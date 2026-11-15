import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/async';
import { ok } from '../../lib/envelope';
import { badRequest, notFound } from '../../lib/errors';
import { privateRelPath, privateUpload, removePrivateFile } from '../../lib/upload';
import { phoneSchema, validate } from '../../lib/validate';
import { verifyTrackToken } from '../../lib/trackToken';
import { requireApproved, requireAuth, requireRole } from '../../middleware/auth';
import { trackingFor } from '../tracking/service';
import { streamInvoice } from './invoice';
import { canViewOrder, orderService } from './service';

export const orderRoutes = Router();
const STATUSES = ['PLACED', 'ACCEPTED', 'REJECTED', 'PACKED', 'DISPATCHED', 'REACHED_HOSPITAL', 'DELIVERED_TO_OT', 'KIT_RETURN_PENDING', 'KIT_RETURNED', 'CLOSED', 'CANCELLED'] as const;
const idParam = z.object({ id: z.uuid() });

const checkoutSchema = z.object({
  hospitalId: z.uuid(),
  patient: z.object({
    name: z.string().trim().min(2, 'Patient name is required').max(120),
    age: z.coerce.number().int().min(0).max(120).optional(),
    gender: z.enum(['M', 'F', 'O']).optional(),
    uhid: z.string().trim().max(40).optional(),
    procedure: z.string().trim().min(2, 'Procedure is required').max(160),
    side: z.enum(['L', 'R', 'B', 'NA']).optional(),
    notes: z.string().trim().max(1000).optional(),
  }),
  surgeryAt: z.coerce.date(),
  priority: z.enum(['EMERGENCY', 'SCHEDULED']),
  paymentMode: z.enum(['HOSPITAL_CREDIT', 'PAY_ON_DELIVERY', 'UPI_TEST']),
  deliveryAddress: z.string().trim().max(300).optional(),
  deliveryLat: z.number().min(-90).max(90).optional(),
  deliveryLng: z.number().min(-180).max(180).optional(),
  deliveryContactName: z.string().trim().max(120).optional(),
  deliveryContactPhone: phoneSchema.optional(),
  treatingDoctorName: z.string().trim().max(120).optional(),
  treatingDoctorPhone: phoneSchema.optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

orderRoutes.post(
  '/',
  requireAuth,
  requireRole('DOCTOR', 'HOSPITAL_PURCHASE'),
  requireApproved,
  validate({ body: checkoutSchema }),
  asyncHandler(async (req, res) => {
    const key = (req.headers['idempotency-key'] as string | undefined) ?? req.body.idempotencyKey;
    if (!key) throw badRequest('IDEMPOTENCY_KEY_REQUIRED', 'Send an Idempotency-Key header');
    const r = await orderService.checkout(req.auth!, { ...req.body, idempotencyKey: key });
    ok(res, r.order, { replayed: r.replayed }, r.replayed ? 200 : 201);
  }),
);

// X-ray / prescription attachments before checkout (private upload)
orderRoutes.post(
  '/attachments',
  requireAuth,
  requireApproved,
  privateUpload('xrays').single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('VALIDATION_ERROR', 'file is required');
    ok(res, { path: privateRelPath('xrays', req.file.filename) }, undefined, 201);
  }),
);

const listQuery = z.object({
  status: z.string().optional().transform((s) => (s ? s.split(',').filter((x): x is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(x)) : undefined)),
  priority: z.enum(['EMERGENCY', 'SCHEDULED']).optional(),
  q: z.string().trim().max(60).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(30),
});
orderRoutes.get(
  '/',
  requireAuth,
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { items, meta } = await orderService.list(req.auth!, req.query as never);
    ok(res, items, meta);
  }),
);

orderRoutes.get('/:id', requireAuth, validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await orderService.get(req.auth!, req.params.id!))));

orderRoutes.post(
  '/:id/transition',
  requireAuth,
  validate({ params: idParam, body: z.object({ to: z.enum(STATUSES), reason: z.string().trim().max(300).optional() }) }),
  asyncHandler(async (req, res) => {
    const actor = await orderService.actorFor(req.auth!, req.params.id!);
    if (!(await canViewOrder(req.auth!, req.params.id!))) throw notFound('Order');
    await orderService.transition(req.params.id!, req.body.to, actor, req.body.reason, req.ip);
    ok(res, await orderService.get(req.auth!, req.params.id!));
  }),
);

orderRoutes.post(
  '/:id/cancel',
  requireAuth,
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3).max(300) }) }),
  asyncHandler(async (req, res) => {
    if (!(await canViewOrder(req.auth!, req.params.id!))) throw notFound('Order');
    const actor = await orderService.actorFor(req.auth!, req.params.id!);
    await orderService.transition(req.params.id!, 'CANCELLED', actor, req.body.reason, req.ip);
    ok(res, await orderService.get(req.auth!, req.params.id!));
  }),
);

orderRoutes.post(
  '/:id/assign',
  requireAuth,
  requireRole('SUPER_ADMIN', 'STAFF'),
  validate({ params: idParam, body: z.object({ agentId: z.uuid() }) }),
  asyncHandler(async (req, res) => {
    await orderService.assignAgent(req.auth!, req.params.id!, req.body.agentId, req.ip);
    ok(res, await orderService.get(req.auth!, req.params.id!));
  }),
);

orderRoutes.post(
  '/:id/proof',
  requireAuth,
  requireRole('DELIVERY_AGENT', 'SUPER_ADMIN', 'STAFF'),
  privateUpload('proofs', false).fields([{ name: 'signature', maxCount: 1 }, { name: 'photo', maxCount: 1 }]),
  asyncHandler(async (req, res) => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const sig = files?.signature?.[0];
    const photo = files?.photo?.[0];
    const sigPath = sig ? privateRelPath('proofs', sig.filename) : undefined;
    const photoPath = photo ? privateRelPath('proofs', photo.filename) : undefined;
    try {
      const receiverName = z.string().trim().min(2).max(120).parse(req.body.receiverName);
      if (!sigPath) throw badRequest('VALIDATION_ERROR', 'Signature is required', [{ field: 'signature', message: 'Required' }]);
      await orderService.addProof(req.auth!, req.params.id!, receiverName, sigPath, photoPath);
      ok(res, await orderService.get(req.auth!, req.params.id!));
    } catch (err) {
      removePrivateFile(sigPath);
      removePrivateFile(photoPath);
      throw err;
    }
  }),
);

const lineSchema = z.array(z.object({ variantId: z.uuid(), qty: z.coerce.number().int().min(1) })).default([]);
orderRoutes.post(
  '/:id/kit-return',
  requireAuth,
  requireRole('DELIVERY_AGENT', 'SUPER_ADMIN', 'STAFF'),
  validate({ params: idParam, body: z.object({ bookingId: z.uuid(), usedItems: lineSchema, missingItems: lineSchema }) }),
  asyncHandler(async (req, res) => ok(res, await orderService.kitReturn(req.auth!, req.params.id!, req.body.bookingId, req.body.usedItems, req.body.missingItems))),
);

orderRoutes.get(
  '/:id/invoice',
  requireAuth,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    if (!(await canViewOrder(req.auth!, req.params.id!))) throw notFound('Order');
    await streamInvoice(req.params.id!, req.query.type === 'challan' ? 'challan' : 'invoice', res);
  }),
);

orderRoutes.get(
  '/:id/tracking',
  requireAuth,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    if (!(await canViewOrder(req.auth!, req.params.id!))) throw notFound('Order');
    ok(res, await trackingFor(req.params.id!));
  }),
);

orderRoutes.post(
  '/:id/track-link',
  requireAuth,
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    if (!(await canViewOrder(req.auth!, req.params.id!))) throw notFound('Order');
    ok(res, orderService.trackLink(req.params.id!));
  }),
);

/** Public read-only tracking: /api/track/:token */
export const publicTrackRoutes = Router();
publicTrackRoutes.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const orderId = verifyTrackToken(req.params.token!);
    if (!orderId) throw badRequest('TRACK_LINK_INVALID', 'Tracking link expired or invalid');
    const t = await trackingFor(orderId);
    const delivered = t.timeline.find((x) => x.to === 'DELIVERED_TO_OT');
    if (delivered && Date.now() - new Date(delivered.at).getTime() > 24 * 3600_000) throw badRequest('TRACK_LINK_EXPIRED', 'Tracking link expired');
    ok(res, { ...t, agent: t.agent ? { name: t.agent.name, vehicleNo: t.agent.vehicleNo } : null });
  }),
);
