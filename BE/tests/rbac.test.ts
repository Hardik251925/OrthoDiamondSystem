import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Request, Response } from 'express';
import { prisma } from '../src/lib/prisma';
import { requireRole } from '../src/middleware/auth';
import { AppError } from '../src/lib/errors';
import { api, bearer, createHospital, createUser, login, nextPhone, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

// 1x1 PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('requireRole middleware (unit)', () => {
  const run = (role: string | undefined, allowed: Parameters<typeof requireRole>) => {
    let error: unknown = 'not-called';
    const req = { auth: role ? { userId: 'u', role, isApproved: true } : undefined } as unknown as Request;
    requireRole(...allowed)(req, {} as Response, (err?: unknown) => {
      error = err;
    });
    return error;
  };
  it('passes allowed roles', () => expect(run('STAFF', ['SUPER_ADMIN', 'STAFF'])).toBeUndefined());
  it('blocks other roles with 403', () => {
    const err = run('DOCTOR', ['SUPER_ADMIN']);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).status).toBe(403);
  });
  it('401 when unauthenticated', () => expect((run(undefined, ['STAFF']) as AppError).status).toBe(401));
});

describe('approved-only routes', () => {
  it('no token -> 401', async () => {
    const res = await api().get('/api/hospitals');
    expect(res.status).toBe(401);
  });

  it('pending doctor -> 403 NOT_APPROVED; approved doctor -> 200', async () => {
    const pending = await createUser('DOCTOR', { doctorStatus: 'PENDING' });
    const approved = await createUser('DOCTOR', { doctorStatus: 'APPROVED' });
    const tp = await login(pending.phone);
    const ta = await login(approved.phone);

    const denied = await api().get('/api/hospitals').set(bearer(tp.accessToken));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_APPROVED');

    const allowed = await api().get('/api/hospitals').set(bearer(ta.accessToken));
    expect(allowed.status).toBe(200);
  });

  it('rejected doctor and delivery agent -> 403; hospital buyer & staff -> 200', async () => {
    const h = await createHospital();
    const cases = [
      [await createUser('DOCTOR', { doctorStatus: 'REJECTED' }), 403],
      [await createUser('DELIVERY_AGENT'), 403],
      [await createUser('HOSPITAL_PURCHASE', { hospitalId: h.id }), 200],
      [await createUser('HOSPITAL_PURCHASE'), 403], // buyer not linked to a hospital
      [await createUser('STAFF'), 200],
    ] as const;
    for (const [user, status] of cases) {
      const t = await login(user.phone);
      const res = await api().get('/api/hospitals').set(bearer(t.accessToken));
      expect(res.status, `${user.role}`).toBe(status);
    }
  });

  it('approval takes effect immediately on the existing token', async () => {
    const owner = await createUser('SUPER_ADMIN');
    const doc = await createUser('DOCTOR', { doctorStatus: 'PENDING' });
    const to = await login(owner.phone);
    const td = await login(doc.phone);

    expect((await api().get('/api/hospitals').set(bearer(td.accessToken))).status).toBe(403);
    const approve = await api().post(`/api/doctors/${doc.doctor!.id}/approve`).set(bearer(to.accessToken));
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');
    expect((await api().get('/api/hospitals').set(bearer(td.accessToken))).status).toBe(200);

    const log = await prisma.auditLog.findFirst({ where: { action: 'doctor.approve', entityId: doc.doctor!.id } });
    expect(log?.actorId).toBe(owner.id);
  });
});

describe('doctor approval permissions', () => {
  it('only SUPER_ADMIN can approve/reject; STAFF can list', async () => {
    const pending = await createUser('DOCTOR', { doctorStatus: 'PENDING' });
    const staff = await login((await createUser('STAFF')).phone);
    const doctor = await login((await createUser('DOCTOR')).phone);
    const owner = await login((await createUser('SUPER_ADMIN')).phone);

    expect((await api().get('/api/doctors?status=PENDING').set(bearer(staff.accessToken))).status).toBe(200);
    expect((await api().get('/api/doctors').set(bearer(doctor.accessToken))).status).toBe(403);
    expect((await api().post(`/api/doctors/${pending.doctor!.id}/approve`).set(bearer(staff.accessToken))).status).toBe(403);
    expect((await api().post(`/api/doctors/${pending.doctor!.id}/approve`).set(bearer(doctor.accessToken))).status).toBe(403);

    const noReason = await api().post(`/api/doctors/${pending.doctor!.id}/reject`).set(bearer(owner.accessToken)).send({});
    expect(noReason.status).toBe(400);
    const reject = await api()
      .post(`/api/doctors/${pending.doctor!.id}/reject`)
      .set(bearer(owner.accessToken))
      .send({ reason: 'Certificate unreadable' });
    expect(reject.status).toBe(200);
    expect(reject.body.data).toMatchObject({ status: 'REJECTED', rejectReason: 'Certificate unreadable' });
  });
});

describe('doctor self-registration', () => {
  it('registers with certificate upload, stays PENDING, admin sees a signed certificate URL', async () => {
    const hospital = await createHospital('City Hospital');
    const phone = nextPhone();
    const { registrationToken } = await login(phone);

    const missingFile = await api()
      .post('/api/doctors/register')
      .set(bearer(registrationToken!))
      .field('fullName', 'Dr New Doctor')
      .field('email', 'new@doc.in')
      .field('specialisation', 'Ortho')
      .field('councilRegNo', 'MP-99999')
      .field('stateCouncil', 'Madhya Pradesh Medical Council')
      .field('hospitalIds', JSON.stringify([hospital.id]));
    expect(missingFile.status).toBe(400);

    const res = await api()
      .post('/api/doctors/register')
      .set(bearer(registrationToken!))
      .field('fullName', 'Dr New Doctor')
      .field('email', 'new@doc.in')
      .field('specialisation', 'Ortho')
      .field('councilRegNo', 'MP-99999')
      .field('stateCouncil', 'Madhya Pradesh Medical Council')
      .field('hospitalIds', JSON.stringify([hospital.id]))
      .attach('certificate', PNG, { filename: 'cert.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect(res.body.data.user.doctor.status).toBe('PENDING');

    // pending doctor is logged in but cannot reach approved-only routes
    expect((await api().get('/api/hospitals').set(bearer(res.body.data.accessToken))).status).toBe(403);
    expect((await api().get('/api/doctors/me').set(bearer(res.body.data.accessToken))).body.data.status).toBe('PENDING');

    // registering the same phone again is refused
    const again = await login(phone);
    expect(again.isNewUser).toBe(false);

    const owner = await login((await createUser('SUPER_ADMIN')).phone);
    const detail = await api().get(`/api/doctors/${res.body.data.user.doctor.id}`).set(bearer(owner.accessToken));
    const url = detail.body.data.certificate.url as string;
    expect(url).toMatch(/^\/uploads\/private\/certificates\/.+\?exp=\d+&sig=/);

    const file = await api().get(url);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toContain('image/png');

    const tampered = await api().get(url.replace(/sig=.*/, 'sig=AAAA'));
    expect(tampered.status).toBe(403);
    const unsigned = await api().get(url.split('?')[0]!);
    expect(unsigned.status).toBe(403);
  });

  it('registration endpoint requires the OTP registration token', async () => {
    const owner = await login((await createUser('SUPER_ADMIN')).phone);
    const res = await api().post('/api/doctors/register').set(bearer(owner.accessToken)).field('fullName', 'x');
    expect(res.status).toBe(401);
  });
});

describe('health', () => {
  it('reports database status', async () => {
    const res = await api().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data.services.db.ok).toBe(true);
  });
});
