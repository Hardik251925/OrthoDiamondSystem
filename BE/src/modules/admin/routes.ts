import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { asyncHandler } from '../../lib/async';
import { audit } from '../../lib/audit';
import { ok } from '../../lib/envelope';
import { notFound } from '../../lib/errors';
import { prisma } from '../../lib/prisma';
import { availability } from '../../lib/stock';
import { phoneSchema, validate } from '../../lib/validate';
import { requireAuth, requireRole } from '../../middleware/auth';
import { retryNotification } from '../notifications/service';
import { ACTIVE_DELIVERY } from '../orders/stateMachine';
import { lastLive } from '../tracking/service';

export const adminRoutes = Router();
adminRoutes.use(requireAuth, requireRole('SUPER_ADMIN', 'STAFF'));
const owner = requireRole('SUPER_ADMIN');

const startOfDayIST = () => {
  const now = new Date(Date.now() + 5.5 * 3600_000);
  now.setUTCHours(0, 0, 0, 0);
  return new Date(now.getTime() - 5.5 * 3600_000);
};

adminRoutes.get(
  '/dashboard',
  asyncHandler(async (_req, res) => {
    const today = startOfDayIST();
    const [todayOrders, emergenciesOpen, revenue, kitsOnLoan, active, recent, variants, expiring, pendingDoctors, statusCounts] = await Promise.all([
      prisma.order.count({ where: { createdAt: { gte: today } } }),
      prisma.order.findMany({ where: { priority: 'EMERGENCY', status: 'PLACED' }, select: { id: true, orderNo: true, createdAt: true, hospital: { select: { name: true } } } }),
      prisma.order.aggregate({ where: { createdAt: { gte: today }, status: { notIn: ['CANCELLED', 'REJECTED'] } }, _sum: { totalPaise: true } }),
      prisma.kitBooking.count({ where: { dispatchedAt: { not: null }, returnedAt: null } }),
      prisma.order.findMany({ where: { status: { in: ACTIVE_DELIVERY } }, select: { id: true, orderNo: true, priority: true, deliveryLat: true, deliveryLng: true, status: true, assignedAgent: { select: { id: true, lastLat: true, lastLng: true, user: { select: { name: true } } } }, hospital: { select: { name: true } } } }),
      prisma.order.findMany({ orderBy: { createdAt: 'desc' }, take: 8, include: { hospital: { select: { name: true } } } }),
      prisma.productVariant.findMany({ where: { isActive: true }, select: { id: true } }),
      prisma.stockBatch.count({ where: { qty: { gt: 0 }, expiryDate: { gte: new Date(), lte: new Date(Date.now() + 60 * 86400_000) } } }),
      prisma.doctor.count({ where: { status: 'PENDING' } }),
      prisma.order.groupBy({ by: ['status'], _count: true }),
    ]);
    const stock = await availability(variants.map((v) => v.id));
    const st = [...stock.values()];
    const last7 = await prisma.$queryRaw<{ day: Date; orders: bigint; revenue: bigint }[]>`
      SELECT date_trunc('day', "createdAt" + interval '330 minutes') AS day, count(*) AS orders, coalesce(sum("totalPaise"),0) AS revenue
      FROM "Order" WHERE "createdAt" >= now() - interval '7 days' AND status NOT IN ('CANCELLED','REJECTED') GROUP BY 1 ORDER BY 1`;
    ok(res, {
      todayOrders,
      todayRevenuePaise: revenue._sum.totalPaise ?? 0,
      emergenciesOpen,
      lowStock: st.filter((s) => s.status === 'LOW_STOCK').length,
      outOfStock: st.filter((s) => s.status === 'OUT_OF_STOCK').length,
      expiringBatches: expiring,
      kitsOnLoan,
      pendingDoctors,
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count])),
      activeDeliveries: active.map((a) => {
        const l = a.assignedAgent ? lastLive(a.assignedAgent.id) : undefined;
        return { ...a, position: l ? { lat: l.lat, lng: l.lng } : a.assignedAgent?.lastLat ? { lat: a.assignedAgent.lastLat, lng: a.assignedAgent.lastLng } : null };
      }),
      recent,
      last7: last7.map((d) => ({ day: d.day, orders: Number(d.orders), revenuePaise: Number(d.revenue) })),
    });
  }),
);

adminRoutes.get(
  '/agents',
  asyncHandler(async (_req, res) => {
    const agents = await prisma.deliveryAgent.findMany({ include: { user: { select: { name: true, phone: true, isActive: true } }, orders: { where: { status: { in: ['PACKED', 'DISPATCHED', 'REACHED_HOSPITAL'] } }, select: { id: true, orderNo: true, status: true } } } });
    ok(res, agents.map((a) => ({ ...a, live: lastLive(a.id) ?? null })));
  }),
);

const hospitalSchema = z.object({
  name: z.string().trim().min(2).max(160),
  address: z.string().trim().min(5).max(300),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  otContactName: z.string().trim().min(2).max(120),
  otContactPhone: phoneSchema,
  gstin: z.string().trim().max(20).optional().nullable(),
  creditLimitPaise: z.coerce.number().int().min(0).default(0),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(30),
  isActive: z.boolean().default(true),
});
adminRoutes.get('/hospitals', asyncHandler(async (_req, res) => ok(res, await prisma.hospital.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { orders: true, doctors: true } } } }))));
adminRoutes.post('/hospitals', validate({ body: hospitalSchema }), asyncHandler(async (req, res) => {
  const h = await prisma.hospital.create({ data: req.body });
  await audit({ actorId: req.auth!.userId, action: 'hospital.create', entity: 'Hospital', entityId: h.id, after: h, ip: req.ip });
  ok(res, h, undefined, 201);
}));
adminRoutes.put('/hospitals/:id', validate({ body: hospitalSchema }), asyncHandler(async (req, res) => {
  const before = await prisma.hospital.findUnique({ where: { id: req.params.id } });
  if (!before) throw notFound('Hospital');
  const h = await prisma.hospital.update({ where: { id: req.params.id }, data: req.body });
  await audit({ actorId: req.auth!.userId, action: 'hospital.update', entity: 'Hospital', entityId: h.id, before, after: h, ip: req.ip });
  ok(res, h);
}));

adminRoutes.get('/owner-contacts', asyncHandler(async (_req, res) => ok(res, await prisma.ownerContact.findMany({ orderBy: { createdAt: 'asc' } }))));
adminRoutes.post('/owner-contacts', owner, validate({ body: z.object({ name: z.string().trim().min(2), whatsappNumber: phoneSchema, enabled: z.boolean().default(true) }) }), asyncHandler(async (req, res) => {
  const c = await prisma.ownerContact.create({ data: req.body });
  await audit({ actorId: req.auth!.userId, action: 'owner_contact.create', entity: 'OwnerContact', entityId: c.id, after: c });
  ok(res, c, undefined, 201);
}));
adminRoutes.patch('/owner-contacts/:id', owner, validate({ body: z.object({ enabled: z.boolean() }) }), asyncHandler(async (req, res) => {
  const c = await prisma.ownerContact.update({ where: { id: req.params.id }, data: { enabled: req.body.enabled } });
  await audit({ actorId: req.auth!.userId, action: 'owner_contact.toggle', entity: 'OwnerContact', entityId: c.id, after: c });
  ok(res, c);
}));

adminRoutes.get('/notifications', asyncHandler(async (req, res) => {
  const where: Prisma.NotificationWhereInput = {};
  if (req.query.status) where.status = req.query.status as never;
  if (req.query.channel) where.channel = req.query.channel as never;
  ok(res, await prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { name: true } } } }));
}));
adminRoutes.post('/notifications/:id/retry', asyncHandler(async (req, res) => ok(res, await retryNotification(req.params.id!))));

adminRoutes.get('/audit', asyncHandler(async (_req, res) => ok(res, await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 300, include: { actor: { select: { name: true, role: true } } } }))));

adminRoutes.get('/users', asyncHandler(async (req, res) => {
  const role = req.query.role as string | undefined;
  ok(res, await prisma.user.findMany({ where: role ? { role: role as never } : {}, orderBy: [{ role: 'asc' }, { name: 'asc' }], select: { id: true, name: true, phone: true, email: true, role: true, isActive: true, lastLoginAt: true, hospital: { select: { name: true } } } }));
}));
adminRoutes.post('/users', owner, validate({ body: z.object({ name: z.string().trim().min(2), phone: phoneSchema, role: z.enum(['STAFF', 'DELIVERY_AGENT', 'HOSPITAL_PURCHASE']), vehicleNo: z.string().optional(), hospitalId: z.uuid().optional() }) }), asyncHandler(async (req, res) => {
  const b = req.body;
  const u = await prisma.user.create({ data: { name: b.name, phone: b.phone, role: b.role, hospitalId: b.role === 'HOSPITAL_PURCHASE' ? b.hospitalId : null, ...(b.role === 'DELIVERY_AGENT' ? { deliveryAgent: { create: { vehicleNo: b.vehicleNo ?? '-' } } } : {}) } });
  await audit({ actorId: req.auth!.userId, action: 'user.create', entity: 'User', entityId: u.id, after: u });
  ok(res, u, undefined, 201);
}));
adminRoutes.patch('/users/:id', owner, validate({ body: z.object({ isActive: z.boolean() }) }), asyncHandler(async (req, res) => {
  const u = await prisma.user.update({ where: { id: req.params.id }, data: { isActive: req.body.isActive } });
  if (!req.body.isActive) await prisma.refreshToken.updateMany({ where: { userId: u.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ actorId: req.auth!.userId, action: req.body.isActive ? 'user.enable' : 'user.disable', entity: 'User', entityId: u.id });
  ok(res, u);
}));

adminRoutes.get('/settings', asyncHandler(async (_req, res) => ok(res, await prisma.appSetting.findMany())));
adminRoutes.put('/settings/:key', owner, asyncHandler(async (req, res) => {
  const before = await prisma.appSetting.findUnique({ where: { key: req.params.key } });
  const s = await prisma.appSetting.upsert({ where: { key: req.params.key! }, update: { value: req.body }, create: { key: req.params.key!, value: req.body } });
  await audit({ actorId: req.auth!.userId, action: 'setting.update', entity: 'AppSetting', entityId: s.key, before: before?.value, after: s.value });
  ok(res, s);
}));

/** Sales report grouped by doctor / hospital / category. */
adminRoutes.get('/reports/sales', asyncHandler(async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(Date.now() - 30 * 86400_000);
  const to = req.query.to ? new Date(String(req.query.to)) : new Date();
  const [byDoctor, byHospital, byCategory, kitUse] = await Promise.all([
    prisma.$queryRaw<{ name: string; orders: bigint; revenue: bigint }[]>`SELECT "treatingDoctorName" AS name, count(*) AS orders, sum("totalPaise") AS revenue FROM "Order" WHERE "createdAt" BETWEEN ${from} AND ${to} AND status NOT IN ('CANCELLED','REJECTED') GROUP BY 1 ORDER BY 3 DESC`,
    prisma.$queryRaw<{ name: string; orders: bigint; revenue: bigint }[]>`SELECT h.name, count(*) AS orders, sum(o."totalPaise") AS revenue FROM "Order" o JOIN "Hospital" h ON h.id = o."hospitalId" WHERE o."createdAt" BETWEEN ${from} AND ${to} AND o.status NOT IN ('CANCELLED','REJECTED') GROUP BY 1 ORDER BY 3 DESC`,
    prisma.$queryRaw<{ name: string; qty: bigint; revenue: bigint }[]>`SELECT c.name, sum(i.qty) AS qty, sum(i."lineTotalPaise") AS revenue FROM "OrderItem" i JOIN "Order" o ON o.id = i."orderId" JOIN "ProductVariant" v ON v.id = i."variantId" JOIN "Product" p ON p.id = v."productId" JOIN "Category" c ON c.id = p."categoryId" WHERE o."createdAt" BETWEEN ${from} AND ${to} AND o.status NOT IN ('CANCELLED','REJECTED') GROUP BY 1 ORDER BY 3 DESC`,
    prisma.$queryRaw<{ name: string; bookings: bigint }[]>`SELECT k.name, count(*) AS bookings FROM "KitBooking" b JOIN "OperationKit" k ON k.id = b."kitId" WHERE b."createdAt" BETWEEN ${from} AND ${to} GROUP BY 1 ORDER BY 2 DESC`,
  ]);
  const n = <T extends Record<string, unknown>>(rows: T[]) => rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v])));
  ok(res, { from, to, byDoctor: n(byDoctor), byHospital: n(byHospital), byCategory: n(byCategory), kitUtilisation: n(kitUse) });
}));

/** Agent self-service: duty toggle, my deliveries. */
export const agentRoutes = Router();
agentRoutes.use(requireAuth, requireRole('DELIVERY_AGENT'));
agentRoutes.get('/me', asyncHandler(async (req, res) => ok(res, await prisma.deliveryAgent.findUnique({ where: { userId: req.auth!.userId }, include: { user: { select: { name: true, phone: true } } } }))));
agentRoutes.patch('/me/duty', validate({ body: z.object({ isOnDuty: z.boolean() }) }), asyncHandler(async (req, res) => ok(res, await prisma.deliveryAgent.update({ where: { userId: req.auth!.userId }, data: { isOnDuty: req.body.isOnDuty } }))));

/** Notifications for the logged-in user (admins also see broadcast rows). */
export const myNotificationRoutes = Router();
myNotificationRoutes.use(requireAuth);
myNotificationRoutes.get('/', asyncHandler(async (req, res) => {
  const isAdmin = req.auth!.role === 'SUPER_ADMIN' || req.auth!.role === 'STAFF';
  const items = await prisma.notification.findMany({
    where: { channel: 'IN_APP', OR: [{ userId: req.auth!.userId }, ...(isAdmin ? [{ userId: null }] : [])] },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  ok(res, items, { unread: items.filter((i) => !i.readAt).length });
}));
myNotificationRoutes.post('/read-all', asyncHandler(async (req, res) => {
  const isAdmin = req.auth!.role === 'SUPER_ADMIN' || req.auth!.role === 'STAFF';
  await prisma.notification.updateMany({ where: { channel: 'IN_APP', readAt: null, OR: [{ userId: req.auth!.userId }, ...(isAdmin ? [{ userId: null }] : [])] }, data: { readAt: new Date() } });
  ok(res, { ok: true });
}));
