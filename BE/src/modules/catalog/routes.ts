import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { asyncHandler } from '../../lib/async';
import { ok } from '../../lib/envelope';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { availability } from '../../lib/stock';
import { validate } from '../../lib/validate';
import { optionalAuth } from '../../middleware/auth';

export const catalogRoutes = Router();
catalogRoutes.use(optionalAuth);

const canSeePrice = (req: Express.Request) => !!req.auth?.isApproved;

catalogRoutes.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const cats = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: { where: { isActive: true } } } } },
    });
    ok(res, cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, icon: c.icon, image: c.image, parentId: c.parentId, productCount: c._count.products })));
  }),
);

catalogRoutes.get('/brands', asyncHandler(async (_req, res) => ok(res, await prisma.brand.findMany({ orderBy: { name: 'asc' } }))));
catalogRoutes.get('/materials', asyncHandler(async (_req, res) => ok(res, await prisma.material.findMany({ orderBy: { name: 'asc' } }))));

const listQuery = z.object({
  category: z.string().optional(), // slug
  q: z.string().trim().max(100).optional(),
  brandId: z.string().optional(),
  sterile: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

catalogRoutes.get(
  '/products',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof listQuery>;
    const where: Prisma.ProductWhereInput = { isActive: true };
    if (q.category) where.category = { slug: q.category };
    if (q.brandId) where.brandId = q.brandId;
    if (q.sterile) where.isSterile = q.sterile === 'true';
    if (q.q) {
      const words = q.q.split(/\s+/).filter(Boolean);
      where.AND = words.map((w) => ({
        OR: [
          { name: { contains: w, mode: 'insensitive' as const } },
          { tags: { has: w.toLowerCase() } },
          { description: { contains: w, mode: 'insensitive' as const } },
          { variants: { some: { sku: { contains: w, mode: 'insensitive' as const } } } },
        ],
      }));
    }
    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: { select: { name: true, slug: true } }, brand: { select: { name: true } }, variants: { where: { isActive: true }, select: { id: true, pricePaise: true } } },
        orderBy: [{ category: { sortOrder: 'asc' } }, { name: 'asc' }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
      prisma.product.count({ where }),
    ]);
    const stock = await availability(items.flatMap((p) => p.variants.map((v) => v.id)));
    const showPrice = canSeePrice(req);
    ok(
      res,
      items.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        brand: p.brand?.name ?? null,
        images: p.images,
        isSterile: p.isSterile,
        tags: p.tags,
        variantCount: p.variants.length,
        inStockCount: p.variants.filter((v) => (stock.get(v.id)?.available ?? 0) > 0).length,
        priceFromPaise: showPrice ? Math.min(...p.variants.map((v) => v.pricePaise)) : null,
      })),
      { total, page: q.page, pageSize: q.pageSize, pricesVisible: showPrice },
    );
  }),
);

catalogRoutes.get(
  '/products/:slug',
  asyncHandler(async (req, res) => {
    const p = await prisma.product.findFirst({
      where: { slug: req.params.slug, isActive: true },
      include: {
        category: { select: { name: true, slug: true } },
        brand: { select: { name: true, country: true } },
        variants: { where: { isActive: true }, include: { material: { select: { name: true, code: true } } }, orderBy: { sku: 'asc' } },
      },
    });
    if (!p) throw notFound('Product');
    const stock = await availability(p.variants.map((v) => v.id));
    const showPrice = canSeePrice(req);
    ok(res, {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      category: p.category,
      brand: p.brand,
      images: p.images,
      hsnCode: p.hsnCode,
      gstPercent: p.gstPercent,
      isSterile: p.isSterile,
      tags: p.tags,
      pricesVisible: showPrice,
      variants: p.variants.map((v) => {
        const s = stock.get(v.id)!;
        return {
          id: v.id,
          sku: v.sku,
          attributes: v.attributes,
          material: v.material,
          barcode: v.barcode,
          pricePaise: showPrice ? v.pricePaise : null,
          mrpPaise: showPrice ? v.mrpPaise : null,
          stockStatus: s.status,
          availableQty: showPrice ? s.available : null,
        };
      }),
    });
  }),
);

/** Variant search with attribute filters (used by AI + barcode scan). */
const variantQuery = z.object({
  q: z.string().optional(),
  barcode: z.string().optional(),
  diameterMm: z.coerce.number().optional(),
  lengthMm: z.coerce.number().optional(),
  holes: z.coerce.number().optional(),
  side: z.enum(['L', 'R']).optional(),
  material: z.string().optional(), // code SS / TI
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
catalogRoutes.get(
  '/variants',
  validate({ query: variantQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof variantQuery>;
    const and: Prisma.ProductVariantWhereInput[] = [{ isActive: true }];
    if (q.barcode) and.push({ barcode: q.barcode });
    if (q.q) and.push({ OR: [{ sku: { contains: q.q, mode: 'insensitive' } }, { product: { name: { contains: q.q, mode: 'insensitive' } } }] });
    for (const key of ['diameterMm', 'lengthMm', 'holes', 'side'] as const) {
      if (q[key] !== undefined) and.push({ attributes: { path: [key], equals: q[key] } });
    }
    if (q.material) and.push({ material: { code: q.material.toUpperCase() } });
    const vs = await prisma.productVariant.findMany({ where: { AND: and }, include: { product: { select: { name: true, slug: true } }, material: { select: { code: true } } }, take: q.limit });
    const stock = await availability(vs.map((v) => v.id));
    const showPrice = canSeePrice(req);
    ok(res, vs.map((v) => ({ id: v.id, sku: v.sku, product: v.product, attributes: v.attributes, material: v.material?.code, pricePaise: showPrice ? v.pricePaise : null, stockStatus: stock.get(v.id)!.status })));
  }),
);

catalogRoutes.get(
  '/banners',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    ok(res, await prisma.banner.findMany({ where: { isActive: true, AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }] }, orderBy: { sortOrder: 'asc' } }));
  }),
);
