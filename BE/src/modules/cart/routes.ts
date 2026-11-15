import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async';
import { ok } from '../../lib/envelope';
import { validate } from '../../lib/validate';
import { requireApproved, requireAuth, requireRole } from '../../middleware/auth';
import { cartService } from './service';

export const cartRoutes = Router();
cartRoutes.use(requireAuth, requireRole('DOCTOR', 'HOSPITAL_PURCHASE'), requireApproved);

cartRoutes.get('/', asyncHandler(async (req, res) => ok(res, await cartService.get(req.auth!.userId))));
cartRoutes.post(
  '/items',
  validate({ body: z.object({ variantId: z.uuid().optional(), kitId: z.uuid().optional(), qty: z.coerce.number().int().min(1).max(500).default(1) }) }),
  asyncHandler(async (req, res) => ok(res, await cartService.add(req.auth!.userId, req.body))),
);
cartRoutes.patch(
  '/items/:id',
  validate({ params: z.object({ id: z.uuid() }), body: z.object({ qty: z.coerce.number().int().min(0).max(500) }) }),
  asyncHandler(async (req, res) => ok(res, await cartService.setQty(req.auth!.userId, req.params.id!, req.body.qty))),
);
cartRoutes.delete(
  '/items/:id',
  validate({ params: z.object({ id: z.uuid() }) }),
  asyncHandler(async (req, res) => ok(res, await cartService.setQty(req.auth!.userId, req.params.id!, 0))),
);
cartRoutes.delete('/', asyncHandler(async (req, res) => ok(res, await cartService.clear(req.auth!.userId))));
cartRoutes.post(
  '/from-template/:id',
  validate({ params: z.object({ id: z.uuid() }) }),
  asyncHandler(async (req, res) => ok(res, await cartService.fromTemplate(req.auth!.userId, req.params.id!))),
);
