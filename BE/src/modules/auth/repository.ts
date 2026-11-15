import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const publicUserSelect = {
  id: true,
  phone: true,
  name: true,
  email: true,
  role: true,
  hospitalId: true,
  doctor: { select: { id: true, status: true, fullName: true, specialisation: true, rejectReason: true } },
  deliveryAgent: { select: { id: true, vehicleNo: true, isOnDuty: true } },
} satisfies Prisma.UserSelect;

export const authRepository = {
  countRecentOtps: (phone: string, since: Date) =>
    prisma.otpCode.count({ where: { phone, createdAt: { gte: since } } }),

  createOtp: async (phone: string, codeHash: string, expiresAt: Date) => {
    // only the newest code is valid
    await prisma.otpCode.updateMany({ where: { phone, consumedAt: null }, data: { consumedAt: new Date() } });
    return prisma.otpCode.create({ data: { phone, codeHash, expiresAt } });
  },

  latestActiveOtp: (phone: string) =>
    prisma.otpCode.findFirst({
      where: { phone, consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    }),

  incrementOtpAttempts: (id: string) =>
    prisma.otpCode.update({ where: { id }, data: { attempts: { increment: 1 } } }),

  consumeOtp: (id: string) =>
    prisma.otpCode.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: new Date() } }),

  findUserByPhone: (phone: string) => prisma.user.findUnique({ where: { phone }, select: { ...publicUserSelect, isActive: true } }),

  findUserById: (id: string) => prisma.user.findUnique({ where: { id }, select: { ...publicUserSelect, isActive: true } }),

  touchLogin: (id: string) => prisma.user.update({ where: { id }, data: { lastLoginAt: new Date() } }),

  createRefreshToken: (
    data: { userId: string; tokenHash: string; familyId: string; expiresAt: Date; userAgent?: string },
    db: Prisma.TransactionClient = prisma,
  ) => db.refreshToken.create({ data }),

  findRefreshToken: (tokenHash: string) => prisma.refreshToken.findUnique({ where: { tokenHash } }),

  /** Atomically marks a token rotated; returns false if someone else rotated it first. */
  markRotated: async (id: string, replacedById: string, db: Prisma.TransactionClient) => {
    const res = await db.refreshToken.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(), replacedById },
    });
    return res.count === 1;
  },

  revokeFamily: (familyId: string) =>
    prisma.refreshToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } }),
};
