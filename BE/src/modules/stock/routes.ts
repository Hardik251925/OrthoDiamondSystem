import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { asyncHandler } from '../../lib/async';
import { audit } from '../../lib/audit';
import { ok } from '../../lib/envelope';
import { badRequest, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { availability, variantLabel } from '../../lib/stock';
import { validate } from '../../lib/validate';
import { requireApproved, requireAuth, requireRole } from '../../middleware/auth';
import { notifyStockAlerts } from '../notifications/service';

export const stockRoutes = Router();
const admin = [requireAuth, requireRole('SUPER_ADMIN', 'STAFF')];

const overviewQuery = z.object({
  filter: z.enum(['all', 'low', 'out']).default('all'),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/** Stock overview per variant (admin). */
stockRoutes.get(
  '/overview',
  ...admin,
  validate({ query: overviewQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof overviewQuery>;
    const where: Prisma.ProductVariantWhereInput = { isActive: true };
    if (q.q) where.OR = [{ sku: { contains: q.q, mode: 'insensitive' } }, { product: { name: { contains: q.q, mode: 'insensitive' } } }];
    const variants = await prisma.productVariant.findMany({
      where,
      include: { product: { select: { name: true, category: { select: { name: true } } } }, material: { select: { code: true } } },
      orderBy: { sku: 'asc' },
    });
    const stock = await availability(variants.map((v) => v.id));
    let rows = variants.map((v) => {
      const s = stock.get(v.id)!;
      return {
        variantId: v.id, sku: v.sku, label: variantLabel(v.product.name, v.attributes, v.material?.code), category: v.product.category.name,
        onHand: s.onHand, reserved: s.reserved, available: s.available, threshold: s.threshold, status: s.status, pricePaise: v.pricePaise,
      };
    });
    if (q.filter === 'low') rows = rows.filter((r) => r.status === 'LOW_STOCK');
    if (q.filter === 'out') rows = rows.filter((r) => r.status === 'OUT_OF_STOCK');
    const counts = {
      total: variants.length,
      low: [...stock.values()].filter((s) => s.status === 'LOW_STOCK').length,
      out: [...stock.values()].filter((s) => s.status === 'OUT_OF_STOCK').length,
    };
    ok(res, rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize), { ...counts, filtered: rows.length, page: q.page, pageSize: q.pageSize });
  }),
);

stockRoutes.get(
  '/batches',
  ...admin,
  asyncHandler(async (req, res) => {
    const variantId = z.uuid().parse(req.query.variantId);
    ok(res, await prisma.stockBatch.findMany({ where: { variantId }, orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }] }));
  }),
);

stockRoutes.get(
  '/expiring',
  ...admin,
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days ?? 60);
    const batches = await prisma.stockBatch.findMany({
      where: { qty: { gt: 0 }, expiryDate: { not: null, lte: new Date(Date.now() + days * 86400_000) } },
      include: { variant: { include: { product: { select: { name: true } }, material: { select: { code: true } } } } },
      orderBy: { expiryDate: 'asc' },
    });
    ok(res, batches.map((b) => ({ id: b.id, lotNo: b.lotNo, qty: b.qty, expiryDate: b.expiryDate, supplier: b.supplier, sku: b.variant.sku, label: variantLabel(b.variant.product.name, b.variant.attributes, b.variant.material?.code), expired: b.expiryDate! < new Date() })));
  }),
);

const batchSchema = z.object({
  variantId: z.uuid(),
  lotNo: z.string().trim().min(1).max(40),
  qty: z.coerce.number().int().min(1).max(100000),
  expiryDate: z.coerce.date().optional().nullable(),
  supplier: z.string().trim().max(120).optional(),
});
stockRoutes.post(
  '/batches',
  ...admin,
  validate({ body: batchSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof batchSchema>;
    const variant = await prisma.productVariant.findUnique({ where: { id: b.variantId }, include: { product: true } });
    if (!variant) throw notFound('Variant');
    if (variant.product.isSterile && !b.expiryDate) throw badRequest('VALIDATION_ERROR', 'Expiry date is required for sterile items', [{ field: 'expiryDate', message: 'Required for sterile items' }]);
    const wasOut = ((await availability([b.variantId])).get(b.variantId)?.available ?? 0) <= 0;
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.stockBatch.create({ data: { variantId: b.variantId, lotNo: b.lotNo, qty: b.qty, expiryDate: b.expiryDate ?? null, supplier: b.supplier } });
      await tx.stockAdjustment.create({ data: { variantId: b.variantId, batchId: created.id, delta: b.qty, reason: `Received lot ${b.lotNo}`, actorId: req.auth!.userId } });
      await audit({ actorId: req.auth!.userId, action: 'stock.receive', entity: 'StockBatch', entityId: created.id, after: created, ip: req.ip }, tx);
      return created;
    });
    if (wasOut) void notifyStockAlerts(b.variantId);
    ok(res, batch, undefined, 201);
  }),
);

const adjustSchema = z.object({ batchId: z.uuid(), delta: z.coerce.number().int().refine((n) => n !== 0, 'Cannot be 0'), reason: z.string().trim().min(3).max(200) });
stockRoutes.post(
  '/adjust',
  ...admin,
  validate({ body: adjustSchema }),
  asyncHandler(async (req, res) => {
    const a = req.body as z.infer<typeof adjustSchema>;
    const result = await prisma.$transaction(async (tx) => {
      const batch = await tx.stockBatch.findUnique({ where: { id: a.batchId } });
      if (!batch) throw notFound('Batch');
      if (batch.qty + a.delta < 0) throw badRequest('INVALID_QTY', `Batch has only ${batch.qty}`);
      const updated = await tx.stockBatch.update({ where: { id: a.batchId }, data: { qty: batch.qty + a.delta } });
      await tx.stockAdjustment.create({ data: { variantId: batch.variantId, batchId: batch.id, delta: a.delta, reason: a.reason, actorId: req.auth!.userId } });
      await audit({ actorId: req.auth!.userId, action: 'stock.adjust', entity: 'StockBatch', entityId: batch.id, before: { qty: batch.qty }, after: { qty: updated.qty, reason: a.reason }, ip: req.ip }, tx);
      return { batch: updated, wasZero: batch.qty === 0 };
    });
    if (a.delta > 0) void notifyStockAlerts(result.batch.variantId);
    ok(res, result.batch);
  }),
);

stockRoutes.get(
  '/adjustments',
  ...admin,
  asyncHandler(async (_req, res) => {
    const rows = await prisma.stockAdjustment.findMany({ orderBy: { createdAt: 'desc' }, take: 100, include: { variant: { select: { sku: true } }, actor: { select: { name: true } } } });
    ok(res, rows);
  }),
);

/** "Notify me" when an out-of-stock size is back. */
export const stockAlertRoutes = Router();
stockAlertRoutes.post(
  '/',
  requireAuth,
  requireApproved,
  validate({ body: z.object({ variantId: z.uuid() }) }),
  asyncHandler(async (req, res) => {
    const alert = await prisma.stockAlert.upsert({
      where: { userId_variantId: { userId: req.auth!.userId, variantId: req.body.variantId } },
      update: { notifiedAt: null },
      create: { userId: req.auth!.userId, variantId: req.body.variantId },
    });
    ok(res, alert, undefined, 201);
  }),
);
