import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { api, bearer, createUser, login, nextPhone, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('OTP login', () => {
  it('logs in an existing user and returns a token pair', async () => {
    const user = await createUser('SUPER_ADMIN');
    const tokens = await login(user.phone);
    expect(tokens.isNewUser).toBe(false);
    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();

    const me = await api().get('/api/auth/me').set(bearer(tokens.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({ id: user.id, role: 'SUPER_ADMIN', isApproved: true });
  });

  it('normalises 10-digit numbers to +91', async () => {
    const user = await createUser('STAFF');
    const tokens = await login(user.phone.slice(3));
    expect(tokens.isNewUser).toBe(false);
  });

  it('rejects a wrong OTP and locks after max attempts', async () => {
    const user = await createUser('STAFF');
    const r = await api().post('/api/auth/otp/request').send({ phone: user.phone });
    const wrong = r.body.data.devOtp === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++) {
      const bad = await api().post('/api/auth/otp/verify').send({ phone: user.phone, code: wrong });
      expect(bad.status).toBe(400);
      expect(bad.body.error.code).toBe('OTP_INVALID');
    }
    const locked = await api().post('/api/auth/otp/verify').send({ phone: user.phone, code: r.body.data.devOtp });
    expect(locked.status).toBe(429);
  });

  it('an OTP can be used only once', async () => {
    const user = await createUser('STAFF');
    const r = await api().post('/api/auth/otp/request').send({ phone: user.phone });
    const first = await api().post('/api/auth/otp/verify').send({ phone: user.phone, code: r.body.data.devOtp });
    expect(first.status).toBe(200);
    const again = await api().post('/api/auth/otp/verify').send({ phone: user.phone, code: r.body.data.devOtp });
    expect(again.status).toBe(400);
  });

  it('unknown phone gets a registration token, not a session', async () => {
    const res = await login(nextPhone());
    expect(res.isNewUser).toBe(true);
    expect(res.registrationToken).toBeTruthy();
    expect(res.accessToken).toBeUndefined();
  });

  it('validates the phone number', async () => {
    const res = await api().post('/api/auth/otp/request').send({ phone: '12345' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });

  it('disabled users cannot log in', async () => {
    const user = await createUser('STAFF');
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
    const r = await api().post('/api/auth/otp/request').send({ phone: user.phone });
    const res = await api().post('/api/auth/otp/verify').send({ phone: user.phone, code: r.body.data.devOtp });
    expect(res.status).toBe(403);
  });
});

describe('refresh token rotation', () => {
  it('rotates: new refresh token issued, old one stops working', async () => {
    const user = await createUser('STAFF');
    const t1 = await login(user.phone);

    const r1 = await api().post('/api/auth/refresh').send({ refreshToken: t1.refreshToken });
    expect(r1.status).toBe(200);
    expect(r1.body.data.refreshToken).not.toBe(t1.refreshToken);
    expect(r1.body.data.accessToken).toBeTruthy();

    // stored only as hash
    const rows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(2);
    expect(rows.some((r) => r.tokenHash === t1.refreshToken)).toBe(false);

    const r2 = await api().post('/api/auth/refresh').send({ refreshToken: r1.body.data.refreshToken });
    expect(r2.status).toBe(200);
  });

  it('reuse of a rotated token revokes the whole family', async () => {
    const user = await createUser('STAFF');
    const t1 = await login(user.phone);
    const r1 = await api().post('/api/auth/refresh').send({ refreshToken: t1.refreshToken });
    const latest = r1.body.data.refreshToken as string;

    const reuse = await api().post('/api/auth/refresh').send({ refreshToken: t1.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');

    // the legitimately rotated token is now dead too
    const after = await api().post('/api/auth/refresh').send({ refreshToken: latest });
    expect(after.status).toBe(401);
  });

  it('concurrent refresh with the same token: only one succeeds', async () => {
    const user = await createUser('STAFF');
    const t1 = await login(user.phone);
    const results = await Promise.all(
      [0, 1, 2].map(() => api().post('/api/auth/refresh').send({ refreshToken: t1.refreshToken })),
    );
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
  });

  it('separate logins are separate families', async () => {
    const user = await createUser('STAFF');
    const a = await login(user.phone);
    const b = await login(user.phone);
    await api().post('/api/auth/logout').send({ refreshToken: a.refreshToken });
    expect((await api().post('/api/auth/refresh').send({ refreshToken: a.refreshToken })).status).toBe(401);
    expect((await api().post('/api/auth/refresh').send({ refreshToken: b.refreshToken })).status).toBe(200);
  });

  it('rejects unknown and expired refresh tokens', async () => {
    const unknown = await api().post('/api/auth/refresh').send({ refreshToken: 'x'.repeat(64) });
    expect(unknown.status).toBe(401);

    const user = await createUser('STAFF');
    const t = await login(user.phone);
    await prisma.refreshToken.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const expired = await api().post('/api/auth/refresh').send({ refreshToken: t.refreshToken });
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('REFRESH_EXPIRED');
  });
});
