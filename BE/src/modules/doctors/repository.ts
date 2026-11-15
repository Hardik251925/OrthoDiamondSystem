import type { ApprovalStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';

export const doctorInclude = {
  user: { select: { id: true, phone: true, isActive: true, createdAt: true } },
  hospitals: { select: { hospital: { select: { id: true, name: true } } } },
  reviewedBy: { select: { id: true, name: true } },
} satisfies Prisma.DoctorInclude;

export const doctorRepository = {
  findById: (id: string) => prisma.doctor.findUnique({ where: { id }, include: doctorInclude }),
  findByUserId: (userId: string) => prisma.doctor.findUnique({ where: { userId }, include: doctorInclude }),

  async list(filter: { status?: ApprovalStatus; q?: string; page: number; pageSize: number }) {
    const where: Prisma.DoctorWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.q
        ? {
            OR: [
              { fullName: { contains: filter.q, mode: 'insensitive' } },
              { councilRegNo: { contains: filter.q, mode: 'insensitive' } },
              { user: { phone: { contains: filter.q } } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.doctor.findMany({
        where,
        include: doctorInclude,
        orderBy: { createdAt: 'desc' },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      }),
      prisma.doctor.count({ where }),
    ]);
    return { items, total };
  },

  countActiveHospitals: (ids: string[]) => prisma.hospital.count({ where: { id: { in: ids }, isActive: true } }),
};
