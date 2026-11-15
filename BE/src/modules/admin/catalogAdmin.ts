import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { asyncHandler } from '../../lib/async';
import { audit } from '../../lib/audit';
import { ok } from '../../lib/envelope';
import { conflict, notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { validate } from '../../lib/validate';
import { requireAuth, requireRole } from '../../middleware/auth';

/** Admin catalogue writes: product + variant matrix generator (diameter x length [x holes x side x material]). */
export const catalogAdminRoutes = Router();
catalogAdminRoutes.use(requireAuth, requireRole('SUPER_ADMIN', 'STAFF'));

const nums = z.array(z.coerce.number().positive()).max(60).default([]);
const productSchema = z.object({
  name: z.string().trim().min(3).max(160),
  categoryId: z.uuid(),
  brandId: z.uuid().optional().nullable(),
  description: z.string().trim().max(2000).default(''),
  hsnCode: z.string().trim().min(4).max(10),
  gstPercent: z.coerce.number().int().min(0).max(28),
  isSterile: z.boolean().default(false),
  tags: z.array(z.string().trim().toLowerCase()).max(20).default([]),
  skuPrefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,8}$/, '2-8 letters/digits'),
  matrix: z.object({
    materialIds: z.array(z.uuid()).min(1).max(4),
    diameterMm: nums,
    lengthMm: nums,
    holes: nums,
    sides: z.array(z.enum(['L', 'R'])).max(2).default([]),
  }),
  basePricePaise: z.coerce.number().int().min(100),
  pricePerStepPaise: z.coerce.number().int().min(0).default(0),
  initialQty: z.coerce.number().int().min(0).max(10000).default(0),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
});

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

catalogAdminRoutes.post(
  '/products',
  validate({ body: productSchema }),
  asyncHandler(async (req, res) => {
    const b = req.body as z.infer<typeof productSchema>;
    const slug = slugify(b.name);
    if (await prisma.product.findUnique({ where: { slug } })) throw conflict('PRODUCT_EXISTS', 'A product with this name already exists');
    const materials = await prisma.material.findMany({ where: { id: { in: b.matrix.materialIds } } });
    const dims = (a: number[]) => (a.length ? a : [undefined]);
    const variants: Prisma.ProductVariantCreateManyProductInput[] = [];
    for (const m of materials)
      dims(b.matrix.diameterMm).forEach((d, di) =>
        dims(b.matrix.lengthMm).forEach((l, li) =>
          dims(b.matrix.holes).forEach((h, hi) =>
            (b.matrix.sides.length ? b.matrix.sides : [undefined]).forEach((s) => {
              const attributes: Record<string, unknown> = {};
              if (d) attributes.diameterMm = d;
              if (l) attributes.lengthMm = l;
              if (h) attributes.holes = h;
              if (s) attributes.side = s;
              const price = b.basePricePaise + (di + li + hi) * b.pricePerStepPaise;
              const sku = [b.skuPrefix, d ? (d < 7 ? d.toFixed(1) : String(d)).replace('.', '') : null, l ? `L${l}` : null, h ? `${h}H` : null, s ?? null, m.code].filter(Boolean).join('-');
              variants.push({ sku, attributes: attributes as Prisma.InputJsonValue, materialId: m.id, pricePaise: price, mrpPaise: Math.round(price * 1.25), lowStockThreshold: b.lowStockThreshold });
            }),
          ),
        ),
      );
    const dupe = await prisma.productVariant.findFirst({ where: { sku: { in: variants.map((v) => v.sku) } }, select: { sku: true } });
    if (dupe) throw conflict('SKU_EXISTS', `SKU ${dupe.sku} already exists; change the SKU prefix`);
    const product = await prisma.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: { name: b.name, slug, categoryId: b.categoryId, brandId: b.brandId ?? null, description: b.description, hsnCode: b.hsnCode, gstPercent: b.gstPercent, isSterile: b.isSterile, tags: b.tags, images: [], variants: { createMany: { data: variants } } },
        include: { variants: true },
      });
      if (b.initialQty > 0) {
        for (const v of p.variants) {
          const batch = await tx.stockBatch.create({ data: { variantId: v.id, lotNo: `INIT-${Date.now().toString(36).toUpperCase()}`, qty: b.initialQty, expiryDate: b.isSterile ? new Date(Date.now() + 2 * 365 * 86400_000) : null, supplier: 'Opening stock' } });
          await tx.stockAdjustment.create({ data: { variantId: v.id, batchId: batch.id, delta: b.initialQty, reason: 'Opening stock', actorId: req.auth!.userId } });
        }
      }
      await audit({ actorId: req.auth!.userId, action: 'product.create', entity: 'Product', entityId: p.id, after: { name: p.name, variants: p.variants.length }, ip: req.ip }, tx);
      return p;
    });
    ok(res, { id: product.id, slug: product.slug, variants: product.variants.length }, undefined, 201);
  }),
);

catalogAdminRoutes.patch(
  '/variants/:id',
  validate({ body: z.object({ pricePaise: z.coerce.number().int().min(0).optional(), mrpPaise: z.coerce.number().int().min(0).optional(), lowStockThreshold: z.coerce.number().int().min(0).optional(), isActive: z.boolean().optional() }) }),
  asyncHandler(async (req, res) => {
    const before = await prisma.productVariant.findUnique({ where: { id: req.params.id } });
    if (!before) throw notFound('Variant');
    const v = await prisma.productVariant.update({ where: { id: req.params.id }, data: req.body });
    await audit({ actorId: req.auth!.userId, action: 'variant.update', entity: 'ProductVariant', entityId: v.id, before: { pricePaise: before.pricePaise, lowStockThreshold: before.lowStockThreshold, isActive: before.isActive }, after: req.body, ip: req.ip });
    ok(res, v);
  }),
);

/** CSV export of products + variants (Excel opens it). */
catalogAdminRoutes.get(
  '/export.csv',
  asyncHandler(async (_req, res) => {
    const vs = await prisma.productVariant.findMany({ include: { product: { include: { category: true, brand: true } }, material: true }, orderBy: { sku: 'asc' } });
    const esc = (x: unknown) => `"${String(x ?? '').replace(/"/g, '""')}"`;
    const rows = [['SKU', 'Product', 'Category', 'Brand', 'Material', 'Diameter mm', 'Length mm', 'Holes', 'Side', 'Price Rs', 'MRP Rs', 'HSN', 'GST %', 'Active']];
    for (const v of vs) {
      const a = v.attributes as Record<string, unknown>;
      rows.push([v.sku, v.product.name, v.product.category.name, v.product.brand?.name ?? '', v.material?.name ?? '', String(a.diameterMm ?? ''), String(a.lengthMm ?? ''), String(a.holes ?? ''), String(a.side ?? ''), (v.pricePaise / 100).toFixed(2), (v.mrpPaise / 100).toFixed(2), v.product.hsnCode, String(v.product.gstPercent), v.isActive ? 'yes' : 'no']);
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ortho-diamond-catalogue.csv"');
    res.send('﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n'));
  }),
);
