import { Router } from 'express';
import { asyncHandler } from '../../lib/async';
import { validate } from '../../lib/validate';
import { privateUpload } from '../../lib/upload';
import { requireAuth, requireRegistrationToken, requireRole } from '../../middleware/auth';
import { CERT_FOLDER, doctorController } from './controller';
import { idParam, listDoctorsQuery, rejectSchema } from './schema';

export const doctorRoutes = Router();

// Self-registration: Authorization: Bearer <registrationToken from /api/auth/otp/verify>, multipart with "certificate" file
doctorRoutes.post(
  '/register',
  requireRegistrationToken,
  privateUpload(CERT_FOLDER).single('certificate'),
  asyncHandler(doctorController.register),
);

doctorRoutes.get('/me', requireAuth, requireRole('DOCTOR'), asyncHandler(doctorController.me));

doctorRoutes.get(
  '/',
  requireAuth,
  requireRole('SUPER_ADMIN', 'STAFF'),
  validate({ query: listDoctorsQuery }),
  asyncHandler(doctorController.list),
);
doctorRoutes.get(
  '/:id',
  requireAuth,
  requireRole('SUPER_ADMIN', 'STAFF'),
  validate({ params: idParam }),
  asyncHandler(doctorController.get),
);
doctorRoutes.post(
  '/:id/approve',
  requireAuth,
  requireRole('SUPER_ADMIN'),
  validate({ params: idParam }),
  asyncHandler(doctorController.approve),
);
doctorRoutes.post(
  '/:id/reject',
  requireAuth,
  requireRole('SUPER_ADMIN'),
  validate({ params: idParam, body: rejectSchema }),
  asyncHandler(doctorController.reject),
);
