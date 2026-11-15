import request from 'supertest';
import type { ApprovalStatus, Role } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
}

let phoneCounter = 0;
export const nextPhone = () => `+9190000${String(10000 + ++phoneCounter).slice(-5)}`;

export async function createHospital(name = 'Test Hospital') {
  return prisma.hospital.create({
    data: { name, address: 'Indore', lat: 22.72, lng: 75.86, otContactName: 'OT', otContactPhone: '+919999999999' },
  });
}

export async function createUser(role: Role, opts: { doctorStatus?: ApprovalStatus; hospitalId?: string } = {}) {
  const phone = nextPhone();
  return prisma.user.create({
    data: {
      phone,
      name: `${role} user`,
      role,
      hospitalId: opts.hospitalId,
      ...(role === 'DOCTOR'
        ? {
            doctor: {
              create: {
                fullName: 'Dr Test',
                email: 'dr@test.local',
                specialisation: 'Ortho',
                councilRegNo: `REG-${phone}`,
                stateCouncil: 'MPMC',
                status: opts.doctorStatus ?? 'APPROVED',
              },
            },
          }
        : {}),
      ...(role === 'DELIVERY_AGENT' ? { deliveryAgent: { create: { vehicleNo: 'MP09' } } } : {}),
    },
    include: { doctor: true },
  });
}

/** Full OTP login through the HTTP API; returns tokens. */
export async function login(phone: string) {
  const req = await api().post('/api/auth/otp/request').send({ phone });
  if (req.status !== 200) throw new Error(`otp request failed ${req.status} ${JSON.stringify(req.body)}`);
  const res = await api().post('/api/auth/otp/verify').send({ phone, code: req.body.data.devOtp });
  if (res.status !== 200) throw new Error(`otp verify failed ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data as { accessToken: string; refreshToken: string; isNewUser: boolean; registrationToken?: string };
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
