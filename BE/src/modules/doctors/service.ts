import type { ApprovalStatus } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { audit } from '../../lib/audit';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { signPrivatePath } from '../../lib/signedUrl';
import { authService } from '../auth/service';
import { publicUserSelect } from '../auth/repository';
import { doctorInclude, doctorRepository } from './repository';
import type { RegisterDoctorInput } from './schema';

type DoctorRow = NonNullable<Awaited<ReturnType<typeof doctorRepository.findById>>>;

function present(d: DoctorRow, withCertificate: boolean) {
  return {
    id: d.id,
    userId: d.userId,
    phone: d.user.phone,
    fullName: d.fullName,
    email: d.email,
    specialisation: d.specialisation,
    councilRegNo: d.councilRegNo,
    stateCouncil: d.stateCouncil,
    status: d.status,
    rejectReason: d.rejectReason,
    reviewedBy: d.reviewedBy,
    reviewedAt: d.reviewedAt,
    hospitals: d.hospitals.map((h) => h.hospital),
    createdAt: d.createdAt,
    ...(withCertificate
      ? { certificate: d.certificatePath ? signPrivatePath(d.certificatePath) : null }
      : {}),
  };
}

export const doctorService = {
  async register(phone: string, input: RegisterDoctorInput, certificatePath: string, userAgent?: string) {
    const existing = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (existing) throw conflict('ALREADY_REGISTERED', 'This phone number is already registered. Please log in.');

    const hospitalIds = [...new Set(input.hospitalIds)];
    if ((await doctorRepository.countActiveHospitals(hospitalIds)) !== hospitalIds.length) {
      throw badRequest('VALIDATION_ERROR', 'One or more hospitals are invalid', [
        { field: 'hospitalIds', message: 'Unknown hospital' },
      ]);
    }
    const dup = await prisma.doctor.findUnique({
      where: { stateCouncil_councilRegNo: { stateCouncil: input.stateCouncil, councilRegNo: input.councilRegNo } },
      select: { id: true },
    });
    if (dup) throw conflict('REG_NO_EXISTS', 'This Medical Council registration number is already registered');

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          phone,
          name: input.fullName,
          email: input.email,
          role: 'DOCTOR',
          doctor: {
            create: {
              fullName: input.fullName,
              email: input.email,
              specialisation: input.specialisation,
              councilRegNo: input.councilRegNo,
              stateCouncil: input.stateCouncil,
              certificatePath,
              status: 'PENDING',
              hospitals: { create: hospitalIds.map((hospitalId) => ({ hospitalId })) },
            },
          },
        },
        select: publicUserSelect,
      });
      await audit(
        { actorId: created.id, action: 'doctor.register', entity: 'Doctor', entityId: created.doctor!.id, after: { phone, ...input } },
        tx,
      );
      return created;
    });

    const tokens = await authService.issueTokens(user.id, user.role, undefined, userAgent);
    return { user, ...tokens };
  },

  async me(userId: string) {
    const d = await doctorRepository.findByUserId(userId);
    if (!d) throw notFound('Doctor profile');
    return present(d, false);
  },

  async list(filter: { status?: ApprovalStatus; q?: string; page: number; pageSize: number }) {
    const { items, total } = await doctorRepository.list(filter);
    return { items: items.map((d) => present(d, false)), meta: { total, page: filter.page, pageSize: filter.pageSize } };
  },

  async get(id: string) {
    const d = await doctorRepository.findById(id);
    if (!d) throw notFound('Doctor');
    return present(d, true);
  },

  async review(id: string, actorId: string, decision: 'APPROVED' | 'REJECTED', reason: string | null, ip?: string) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.doctor.findUnique({ where: { id }, select: { status: true, rejectReason: true } });
      if (!before) throw notFound('Doctor');
      if (before.status === decision) {
        throw conflict('ALREADY_' + decision, `Doctor is already ${decision.toLowerCase()}`);
      }
      const updated = await tx.doctor.update({
        where: { id },
        data: { status: decision, rejectReason: reason, reviewedById: actorId, reviewedAt: new Date() },
        include: doctorInclude,
      });
      await audit(
        {
          actorId,
          action: decision === 'APPROVED' ? 'doctor.approve' : 'doctor.reject',
          entity: 'Doctor',
          entityId: id,
          before,
          after: { status: updated.status, rejectReason: updated.rejectReason },
          ip,
        },
        tx,
      );
      return present(updated, false);
    });
  },
};
