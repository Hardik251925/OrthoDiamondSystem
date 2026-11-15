import { Router } from 'express';
import { asyncHandler } from '../../lib/async';
import { ok } from '../../lib/envelope';
import { prisma } from '../../lib/prisma';
import { requireApproved, requireAuth } from '../../middleware/auth';

// Step 1 scope: read-only lists. Admin CRUD for hospitals arrives with the admin screens.
export const hospitalRoutes = Router();

/** Public directory (name + address only) for the doctor registration form. */
hospitalRoutes.get(
  '/directory',
  asyncHandler(async (_req, res) => {
    const items = await prisma.hospital.findMany({
      where: { isActive: true },
      select: { id: true, name: true, address: true },
      orderBy: { name: 'asc' },
    });
    ok(res, items);
  }),
);

/** Full hospital details incl. OT contact & location — approved buyers / admin only. */
hospitalRoutes.get(
  '/',
  requireAuth,
  requireApproved,
  asyncHandler(async (req, res) => {
    const auth = req.auth!;
    const where =
      auth.role === 'DOCTOR'
        ? { isActive: true, doctors: { some: { doctorId: auth.doctorId } } }
        : auth.role === 'HOSPITAL_PURCHASE'
          ? { isActive: true, id: auth.hospitalId ?? '' }
          : {};
    const items = await prisma.hospital.findMany({
      where,
      select: {
        id: true,
        name: true,
        address: true,
        lat: true,
        lng: true,
        otContactName: true,
        otContactPhone: true,
        ...(auth.role === 'SUPER_ADMIN' || auth.role === 'STAFF'
          ? { gstin: true, creditLimitPaise: true, paymentTermsDays: true, isActive: true }
          : {}),
      },
      orderBy: { name: 'asc' },
    });
    ok(res, items);
  }),
);
