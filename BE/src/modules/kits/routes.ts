import { Router } from 'express';
import { asyncHandler } from '../../lib/async';
import { ok } from '../../lib/envelope';
import { notFound } from '../../lib/errors';
import { kitAvailable } from '../../lib/kits';
import { prisma } from '../../lib/prisma';
import { availability, variantLabel } from '../../lib/stock';
import { optionalAuth } from '../../middleware/auth';

export const kitRoutes = Router();
kitRoutes.use(optionalAuth);

const contentsInclude = {
  contents: { include: { variant: { include: { product: { select: { name: true, slug: true } }, material: { select: { code: true } } } } } },
} as const;

kitRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const date = req.query.date ? new Date(String(req.query.date)) : new Date();
    const kits = await prisma.operationKit.findMany({ where: { isActive: true }, include: { _count: { select: { contents: true } } }, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
    const show = !!req.auth?.isApproved;
    const out = [];
    for (const k of kits) {
      out.push({
        id: k.id, name: k.name, slug: k.slug, type: k.type, description: k.description, trayPhotos: k.trayPhotos,
        physicalSets: k.physicalSets, sterilisationStatus: k.sterilisationStatus, itemCount: k._count.contents,
        pricePaise: show ? (k.type === 'LOAN' ? k.rentalChargePaise : k.salePricePaise) : null,
        availableOnDate: await kitAvailable(k, date),
      });
    }
    ok(res, out, { date: date.toISOString(), pricesVisible: show });
  }),
);

kitRoutes.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const k = await prisma.operationKit.findFirst({ where: { OR: [{ id: req.params.id }, { slug: req.params.id }] }, include: contentsInclude });
    if (!k) throw notFound('Kit');
    const show = !!req.auth?.isApproved;
    // availability calendar for the next 14 days
    const calendar = [];
    for (let d = 0; d < 14; d++) {
      const date = new Date();
      date.setHours(10, 0, 0, 0);
      date.setDate(date.getDate() + d);
      calendar.push({ date: date.toISOString().slice(0, 10), available: await kitAvailable(k, date) });
    }
    const stock = await availability(k.contents.map((c) => c.variantId));
    ok(res, {
      id: k.id, name: k.name, slug: k.slug, type: k.type, description: k.description, trayPhotos: k.trayPhotos,
      physicalSets: k.physicalSets, sterilisationStatus: k.sterilisationStatus,
      pricePaise: show ? (k.type === 'LOAN' ? k.rentalChargePaise : k.salePricePaise) : null,
      contents: k.contents.map((c) => ({
        variantId: c.variantId, sku: c.variant.sku, qty: c.qty,
        label: variantLabel(c.variant.product.name, c.variant.attributes, c.variant.material?.code),
        productSlug: c.variant.product.slug, stockStatus: stock.get(c.variantId)?.status,
      })),
      calendar,
    });
  }),
);

export const templateRoutes = Router();
templateRoutes.use(optionalAuth);

templateRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const ts = await prisma.procedureTemplate.findMany({
      where: { isActive: true },
      include: { kit: { select: { id: true, name: true, type: true } }, items: { include: { variant: { include: { product: { select: { name: true } }, material: { select: { code: true } } } } } } },
      orderBy: { name: 'asc' },
    });
    const stock = await availability(ts.flatMap((t) => t.items.map((i) => i.variantId)));
    const show = !!req.auth?.isApproved;
    ok(res, ts.map((t) => ({
      id: t.id, name: t.name, description: t.description, kit: t.kit,
      items: t.items.map((i) => ({
        variantId: i.variantId, sku: i.variant.sku, qty: i.qty,
        label: variantLabel(i.variant.product.name, i.variant.attributes, i.variant.material?.code),
        pricePaise: show ? i.variant.pricePaise : null, stockStatus: stock.get(i.variantId)?.status,
      })),
    })));
  }),
);

