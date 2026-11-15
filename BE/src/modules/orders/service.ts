import crypto from 'node:crypto';
import { Prisma, type OrderStatus, type PaymentMode, type OrderPriority } from '@prisma/client';
import { env } from '../../config/env';
import { audit } from '../../lib/audit';
import { AppError, badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { LOAN_DAYS, loanKitAvailable } from '../../lib/kits';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { emit } from '../../lib/realtime';
import { signPrivatePath } from '../../lib/signedUrl';
import { availability, deductFefo, variantLabel } from '../../lib/stock';
import { signTrackToken } from '../../lib/trackToken';
import type { AuthContext } from '../../types/express';
import { KIT_TAX } from '../cart/service';
import { notifyAdmins, notifyOrderStatus, notifyOwnerNewOrder, notifyUser } from '../notifications/service';
import { actorMay, canTransition, type Actor } from './stateMachine';

type Tx = Prisma.TransactionClient;

export interface CheckoutInput {
  hospitalId: string;
  patient: { name: string; age?: number; gender?: string; uhid?: string; procedure: string; side?: string; notes?: string };
  surgeryAt: Date;
  priority: OrderPriority;
  paymentMode: PaymentMode;
  deliveryAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryContactName?: string;
  deliveryContactPhone?: string;
  treatingDoctorName?: string;
  treatingDoctorPhone?: string;
  attachments?: string[];
  idempotencyKey: string;
}

const isAdminRole = (r: string) => r === 'SUPER_ADMIN' || r === 'STAFF';

export async function canViewOrder(auth: AuthContext, orderId: string) {
  if (isAdminRole(auth.role)) return true;
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { placedById: true, doctorId: true, hospitalId: true, assignedAgent: { select: { userId: true } } } });
  if (!o) return false;
  if (o.placedById === auth.userId) return true;
  if (auth.role === 'DOCTOR' && o.doctorId && o.doctorId === auth.doctorId) return true;
  if (auth.role === 'HOSPITAL_PURCHASE' && o.hospitalId === auth.hospitalId) return true;
  if (auth.role === 'DELIVERY_AGENT' && o.assignedAgent?.userId === auth.userId) return true;
  return false;
}

/** Stock each order consumes: variant lines + contents of SALE kits. */
async function stockNeeds(db: Tx | typeof prisma, items: { variantId: string | null; kitId: string | null; qty: number }[]) {
  const needs = new Map<string, number>();
  const add = (v: string, q: number) => needs.set(v, (needs.get(v) ?? 0) + q);
  for (const i of items) {
    if (i.variantId) add(i.variantId, i.qty);
    else if (i.kitId) {
      const kit = await db.operationKit.findUnique({ where: { id: i.kitId }, include: { contents: true } });
      if (kit?.type === 'SALE') for (const c of kit.contents) add(c.variantId, c.qty * i.qty);
    }
  }
  return needs;
}

/** Up to 3 in-stock alternatives: same product, nearest size. */
async function alternatives(db: Tx, variantId: string, need: number) {
  const v = await db.productVariant.findUnique({ where: { id: variantId } });
  if (!v) return [];
  const sibs = await db.productVariant.findMany({ where: { productId: v.productId, isActive: true, id: { not: v.id } }, include: { product: { select: { name: true } }, material: { select: { code: true } } } });
  const stock = await availability(sibs.map((s) => s.id), db);
  const a = (v.attributes ?? {}) as Record<string, number | string>;
  const dist = (x: Record<string, number | string>) =>
    ['diameterMm', 'lengthMm', 'holes', 'angle'].reduce((d, k) => d + Math.abs(Number(x[k] ?? 0) - Number(a[k] ?? 0)), 0) +
    (x.side !== a.side ? 100 : 0);
  return sibs
    .filter((s) => (stock.get(s.id)?.available ?? 0) >= Math.min(need, 1))
    .map((s) => ({ s, d: dist((s.attributes ?? {}) as Record<string, number | string>) + (s.materialId === v.materialId ? 0 : 0.5) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, 3)
    .map(({ s }) => ({ variantId: s.id, sku: s.sku, label: variantLabel(s.product.name, s.attributes, s.material?.code), available: stock.get(s.id)!.available, pricePaise: s.pricePaise }));
}

function orderNoPrefix(d = new Date()) {
  const ist = new Date(d.getTime() + 5.5 * 3600_000);
  return `OD-${String(ist.getUTCFullYear()).slice(2)}${String(ist.getUTCMonth() + 1).padStart(2, '0')}${String(ist.getUTCDate()).padStart(2, '0')}-`;
}

async function nextOrderNo(tx: Tx) {
  const prefix = orderNoPrefix();
  const last = await tx.order.findFirst({ where: { orderNo: { startsWith: prefix } }, orderBy: { orderNo: 'desc' }, select: { orderNo: true } });
  const n = last ? Number(last.orderNo.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(n).padStart(4, '0')}`;
}

export const orderInclude = {
  hospital: true,
  items: true,
  placedBy: { select: { id: true, name: true, phone: true, role: true } },
  doctor: { select: { id: true, fullName: true, user: { select: { phone: true } } } },
  assignedAgent: { include: { user: { select: { name: true, phone: true } } } },
  statusHistory: { orderBy: { at: 'asc' as const }, include: { actor: { select: { name: true, role: true } } } },
  kitBookings: { include: { kit: { select: { id: true, name: true, type: true, contents: { include: { variant: { include: { product: { select: { name: true } }, material: { select: { code: true } } } } } } } } } },
  proof: true,
} satisfies Prisma.OrderInclude;

type FullOrder = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export function presentOrder(o: FullOrder) {
  return {
    ...o,
    attachments: o.attachments.map((p) => ({ path: p, ...signPrivatePath(p) })),
    proof: o.proof
      ? { ...o.proof, signatureUrl: signPrivatePath(o.proof.signatureUrl).url, photoUrl: o.proof.photoUrl ? signPrivatePath(o.proof.photoUrl).url : null }
      : null,
  };
}

export const orderService = {
  async checkout(auth: AuthContext, input: CheckoutInput) {
    if (auth.role !== 'DOCTOR' && auth.role !== 'HOSPITAL_PURCHASE') throw forbidden('Only doctors and hospital buyers place orders');

    const existing = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      if (existing.placedById !== auth.userId) throw conflict('IDEMPOTENCY_KEY_REUSED', 'This idempotency key belongs to another order');
      return { order: existing, replayed: true };
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { id: auth.userId }, include: { doctor: { include: { hospitals: true } } } });
    const hospital = await prisma.hospital.findFirst({ where: { id: input.hospitalId, isActive: true } });
    if (!hospital) throw badRequest('VALIDATION_ERROR', 'Unknown hospital', [{ field: 'hospitalId', message: 'Select a hospital' }]);

    let treatingName: string;
    let treatingPhone: string;
    if (auth.role === 'DOCTOR') {
      if (!user.doctor!.hospitals.some((h) => h.hospitalId === hospital.id)) throw forbidden('You are not attached to this hospital', 'HOSPITAL_NOT_LINKED');
      treatingName = user.doctor!.fullName;
      treatingPhone = user.phone;
    } else {
      if (auth.hospitalId !== hospital.id) throw forbidden('You can order only for your hospital', 'HOSPITAL_NOT_LINKED');
      if (!input.treatingDoctorName || !input.treatingDoctorPhone) {
        throw badRequest('VALIDATION_ERROR', 'Treating doctor name and phone are required', [
          { field: 'treatingDoctorName', message: 'Required' },
          { field: 'treatingDoctorPhone', message: 'Required' },
        ]);
      }
      treatingName = input.treatingDoctorName;
      treatingPhone = input.treatingDoctorPhone;
    }
    if (input.surgeryAt.getTime() < Date.now() - 6 * 3600_000) throw badRequest('VALIDATION_ERROR', 'Surgery time is in the past', [{ field: 'surgeryAt', message: 'Must be in the future' }]);

    const cart = await prisma.cart.findUnique({ where: { userId: auth.userId }, include: { items: { include: { variant: { include: { product: true, material: true } }, kit: true } } } });
    if (!cart || !cart.items.length) throw badRequest('CART_EMPTY', 'Your cart is empty');

    try {
      const order = await prisma.$transaction(
        async (tx) => {
          const needs = await stockNeeds(tx, cart.items);
          const ids = [...needs.keys()];
          // Row locks serialize concurrent checkouts on the same sizes
          if (ids.length) await tx.$queryRaw`SELECT id FROM "ProductVariant" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
          const stock = await availability(ids, tx);

          const short = [];
          for (const item of cart.items) {
            if (item.variantId) {
              const avail = stock.get(item.variantId)?.available ?? 0;
              if (avail < needs.get(item.variantId)!) {
                short.push({ lineId: item.id, variantId: item.variantId, sku: item.variant!.sku, label: variantLabel(item.variant!.product.name, item.variant!.attributes, item.variant!.material?.code), requested: item.qty, available: avail, alternatives: await alternatives(tx, item.variantId, item.qty) });
              }
            } else if (item.kit) {
              if (item.kit.type === 'LOAN') {
                await tx.$queryRaw`SELECT id FROM "OperationKit" WHERE id = ${item.kit.id} FOR UPDATE`;
                const free = await loanKitAvailable(item.kit.id, input.surgeryAt, tx);
                if (free < item.qty) short.push({ lineId: item.id, kitId: item.kit.id, label: item.kit.name, requested: item.qty, available: free, alternatives: [] });
              } else {
                const kitItems = await tx.kitItem.findMany({ where: { kitId: item.kit.id } });
                const bad = kitItems.find((k) => (stock.get(k.variantId)?.available ?? 0) < needs.get(k.variantId)!);
                if (bad) short.push({ lineId: item.id, kitId: item.kit.id, label: item.kit.name, requested: item.qty, available: 0, alternatives: [] });
              }
            }
          }
          if (short.length) throw new AppError(409, 'OUT_OF_STOCK', 'Some items are no longer available', { lines: short });

          for (const [variantId, qty] of needs) await tx.productVariant.update({ where: { id: variantId }, data: { reservedQty: { increment: qty } } });

          let subtotal = 0;
          let gst = 0;
          const lines: Prisma.OrderItemCreateWithoutOrderInput[] = cart.items.map((i) => {
            if (i.variant) {
              const total = i.variant.pricePaise * i.qty;
              subtotal += total;
              gst += Math.round((total * i.variant.product.gstPercent) / 100);
              return { variant: { connect: { id: i.variant.id } }, description: variantLabel(i.variant.product.name, i.variant.attributes, i.variant.material?.code), sku: i.variant.sku, hsnCode: i.variant.product.hsnCode, qty: i.qty, unitPricePaise: i.variant.pricePaise, gstPercent: i.variant.product.gstPercent, lineTotalPaise: total };
            }
            const k = i.kit!;
            const price = k.type === 'LOAN' ? k.rentalChargePaise : k.salePricePaise;
            const tax = KIT_TAX[k.type];
            const total = price * i.qty;
            subtotal += total;
            gst += Math.round((total * tax.gst) / 100);
            return { kit: { connect: { id: k.id } }, description: `${k.name} (${k.type})`, sku: null, hsnCode: tax.hsn, qty: i.qty, unitPricePaise: price, gstPercent: tax.gst, lineTotalPaise: total };
          });

          const created = await tx.order.create({
            data: {
              orderNo: await nextOrderNo(tx),
              placedById: auth.userId,
              doctorId: auth.role === 'DOCTOR' ? user.doctor!.id : null,
              treatingDoctorName: treatingName,
              treatingDoctorPhone: treatingPhone,
              hospitalId: hospital.id,
              patient: input.patient as Prisma.InputJsonValue,
              surgeryAt: input.surgeryAt,
              priority: input.priority,
              deliveryAddress: input.deliveryAddress || hospital.address,
              deliveryLat: input.deliveryLat ?? hospital.lat,
              deliveryLng: input.deliveryLng ?? hospital.lng,
              deliveryContactName: input.deliveryContactName || hospital.otContactName,
              deliveryContactPhone: input.deliveryContactPhone || hospital.otContactPhone,
              subtotalPaise: subtotal,
              gstPaise: gst,
              totalPaise: subtotal + gst,
              paymentMode: input.paymentMode,
              attachments: input.attachments ?? [],
              idempotencyKey: input.idempotencyKey,
              items: { create: lines },
              kitBookings: {
                create: cart.items
                  .filter((i) => i.kit?.type === 'LOAN')
                  .map((i) => ({ kitId: i.kit!.id, surgeryAt: input.surgeryAt, expectedReturnAt: new Date(input.surgeryAt.getTime() + LOAN_DAYS * 86400_000) })),
              },
              statusHistory: { create: { to: 'PLACED', actorId: auth.userId } },
            },
          });
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
          return created;
        },
        { timeout: 20_000, maxWait: 10_000 },
      );

      const full = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
      emit.toAdmin('admin:new_order', { id: order.id, orderNo: order.orderNo, priority: order.priority, hospital: full.hospital.name, doctor: order.treatingDoctorName, totalPaise: order.totalPaise });
      notifyOwnerNewOrder(order.id).catch((err) => logger.error({ err }, 'owner notification failed'));
      return { order: full, replayed: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const again = await prisma.order.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
        if (again) return { order: again, replayed: true };
      }
      throw err;
    }
  },

  async list(auth: AuthContext, f: { status?: OrderStatus[]; priority?: OrderPriority; q?: string; from?: Date; to?: Date; page: number; pageSize: number }) {
    const where: Prisma.OrderWhereInput = {};
    if (auth.role === 'DOCTOR') where.OR = [{ placedById: auth.userId }, { doctorId: auth.doctorId }];
    else if (auth.role === 'HOSPITAL_PURCHASE') where.hospitalId = auth.hospitalId ?? '-';
    else if (auth.role === 'DELIVERY_AGENT') where.assignedAgent = { userId: auth.userId };
    if (f.status?.length) where.status = { in: f.status };
    if (f.priority) where.priority = f.priority;
    if (f.from || f.to) where.createdAt = { gte: f.from, lte: f.to };
    if (f.q) where.AND = [{ OR: [{ orderNo: { contains: f.q, mode: 'insensitive' } }, { treatingDoctorName: { contains: f.q, mode: 'insensitive' } }, { hospital: { name: { contains: f.q, mode: 'insensitive' } } }] }];
    const [items, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (f.page - 1) * f.pageSize,
        take: f.pageSize,
        include: { hospital: { select: { name: true } }, assignedAgent: { include: { user: { select: { name: true } } } }, _count: { select: { items: true } } },
      }),
      prisma.order.count({ where }),
    ]);
    return { items, meta: { total, page: f.page, pageSize: f.pageSize } };
  },

  async get(auth: AuthContext, id: string) {
    if (!(await canViewOrder(auth, id))) throw notFound('Order');
    const o = await prisma.order.findUnique({ where: { id }, include: orderInclude });
    if (!o) throw notFound('Order');
    return presentOrder(o);
  },

  async actorFor(auth: AuthContext, orderId: string): Promise<Actor> {
    const o = await prisma.order.findUnique({ where: { id: orderId }, select: { placedById: true, doctorId: true, assignedAgent: { select: { userId: true } } } });
    if (!o) throw notFound('Order');
    return {
      userId: auth.userId,
      role: auth.role,
      isOwner: o.placedById === auth.userId || (!!auth.doctorId && o.doctorId === auth.doctorId),
      isAssignedAgent: auth.role === 'DELIVERY_AGENT' && o.assignedAgent?.userId === auth.userId,
    };
  },

  /** The ONLY way order status changes. Writes history, applies stock effects, emits events. */
  async transition(orderId: string, to: OrderStatus, actor: Actor, reason?: string | null, ip?: string) {
    const actorId = actor === 'SYSTEM' ? null : actor.userId;
    const result = await prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`;
        const o = await tx.order.findUnique({ where: { id: orderId }, include: { items: true, kitBookings: true } });
        if (!o) throw notFound('Order');
        if (!canTransition(o.status, to)) throw new AppError(409, 'INVALID_TRANSITION', `Cannot move order from ${o.status} to ${to}`);
        if (!actorMay(actor, to)) throw forbidden(`Your role cannot move an order to ${to}`, 'TRANSITION_FORBIDDEN');
        if (to === 'REJECTED' && !reason) throw badRequest('VALIDATION_ERROR', 'Reason is required to reject', [{ field: 'reason', message: 'Required' }]);
        if (to === 'DISPATCHED' && !o.assignedAgentId) throw badRequest('NO_AGENT', 'Assign a delivery agent before dispatch');
        if (to === 'CLOSED' && o.status === 'DELIVERED_TO_OT' && o.kitBookings.length) throw new AppError(409, 'KIT_RETURN_REQUIRED', 'Loan kit must be returned first (move to KIT_RETURN_PENDING)');
        if (to === 'KIT_RETURN_PENDING' && !o.kitBookings.length) throw new AppError(409, 'NO_LOAN_KIT', 'Order has no loan kit; close it instead');

        const needs = await stockNeeds(tx, o.items.filter((i) => !i.description.startsWith('Used from loan kit')));
        if (to === 'REJECTED' || to === 'CANCELLED') {
          for (const [v, q] of needs) await tx.productVariant.update({ where: { id: v }, data: { reservedQty: { decrement: q } } });
        }
        if (to === 'DISPATCHED') {
          for (const [v, q] of needs) {
            await tx.productVariant.update({ where: { id: v }, data: { reservedQty: { decrement: q } } });
            await deductFefo(tx, v, q, `Dispatched ${o.orderNo}`, o.id, actorId);
          }
          await tx.kitBooking.updateMany({ where: { orderId: o.id }, data: { dispatchedAt: new Date() } });
        }

        const updated = await tx.order.update({ where: { id: o.id }, data: { status: to, ...(to === 'REJECTED' ? { rejectReason: reason } : {}) } });
        await tx.orderStatusHistory.create({ data: { orderId: o.id, from: o.status, to, actorId, reason: reason ?? null } });
        if (actor !== 'SYSTEM' && isAdminRole(actor.role)) {
          await audit({ actorId, action: `order.${to.toLowerCase()}`, entity: 'Order', entityId: o.id, before: { status: o.status }, after: { status: to, reason }, ip }, tx);
        }
        return { order: updated, from: o.status, hasLoanKit: o.kitBookings.length > 0 };
      },
      { timeout: 20_000 },
    );

    const payload = { orderId, orderNo: result.order.orderNo, from: result.from, to, reason: reason ?? null, at: new Date().toISOString() };
    emit.toOrder(orderId, 'order:status', payload);
    emit.toAdmin('order:status', payload);
    const trackUrl = to === 'DISPATCHED' ? this.trackLink(orderId).url : undefined;
    notifyOrderStatus(orderId, to, reason, trackUrl).catch((err) => logger.error({ err }, 'status notify failed'));
    if (to === 'DELIVERED_TO_OT' && result.hasLoanKit) await this.transition(orderId, 'KIT_RETURN_PENDING', 'SYSTEM', 'Loan kit to be collected');
    return result.order;
  },

  async assignAgent(auth: AuthContext, orderId: string, agentId: string, ip?: string) {
    const agent = await prisma.deliveryAgent.findUnique({ where: { id: agentId }, include: { user: true } });
    if (!agent || !agent.user.isActive) throw notFound('Delivery agent');
    const o = await prisma.order.findUnique({ where: { id: orderId } });
    if (!o) throw notFound('Order');
    if (!['PLACED', 'ACCEPTED', 'PACKED'].includes(o.status)) throw new AppError(409, 'INVALID_STATE', `Cannot assign an agent when order is ${o.status}`);
    const updated = await prisma.order.update({ where: { id: orderId }, data: { assignedAgentId: agentId } });
    await audit({ actorId: auth.userId, action: 'order.assign_agent', entity: 'Order', entityId: orderId, before: { agentId: o.assignedAgentId }, after: { agentId }, ip });
    await notifyUser(agent.userId, o.priority === 'EMERGENCY' ? 'EMERGENCY delivery assigned' : 'New delivery assigned', `${o.orderNo} → ${o.deliveryAddress}`, { orderId, priority: o.priority });
    emit.toUser(agent.userId, 'agent:assigned', { orderId, orderNo: o.orderNo, priority: o.priority });
    emit.toAdmin('order:updated', { orderId });
    return updated;
  },

  async addProof(auth: AuthContext, orderId: string, receiverName: string, signaturePath: string, photoPath?: string) {
    const actor = await this.actorFor(auth, orderId);
    const o = await prisma.order.findUnique({ where: { id: orderId } });
    if (!o) throw notFound('Order');
    if (o.status !== 'REACHED_HOSPITAL') throw new AppError(409, 'INVALID_STATE', 'Proof can be added after reaching the hospital');
    await prisma.deliveryProof.upsert({ where: { orderId }, update: { receiverName, signatureUrl: signaturePath, photoUrl: photoPath ?? null, at: new Date() }, create: { orderId, receiverName, signatureUrl: signaturePath, photoUrl: photoPath ?? null } });
    return this.transition(orderId, 'DELIVERED_TO_OT', actor, `Received by ${receiverName}`);
  },

  /** Loan kit back: used items billed automatically, missing items flagged. */
  async kitReturn(auth: AuthContext, orderId: string, bookingId: string, used: { variantId: string; qty: number }[], missing: { variantId: string; qty: number }[]) {
    const actor = await this.actorFor(auth, orderId);
    if (!actorMay(actor, 'KIT_RETURNED')) throw forbidden();
    const res = await prisma.$transaction(async (tx) => {
      const o = await tx.order.findUnique({ where: { id: orderId }, include: { kitBookings: true } });
      if (!o) throw notFound('Order');
      if (o.status !== 'KIT_RETURN_PENDING') throw new AppError(409, 'INVALID_STATE', 'Order is not waiting for a kit return');
      const booking = o.kitBookings.find((b) => b.id === bookingId);
      if (!booking || booking.returnedAt) throw notFound('Open kit booking');
      const variants = await tx.productVariant.findMany({ where: { id: { in: [...used, ...missing].map((u) => u.variantId) } }, include: { product: true, material: true } });
      let addSub = 0;
      let addGst = 0;
      for (const u of [...used, ...missing]) {
        const v = variants.find((x) => x.id === u.variantId);
        if (!v || u.qty <= 0) continue;
        const total = v.pricePaise * u.qty;
        addSub += total;
        addGst += Math.round((total * v.product.gstPercent) / 100);
        const isMissing = missing.includes(u);
        await tx.orderItem.create({ data: { orderId, variantId: v.id, description: `${isMissing ? 'Missing from loan kit' : 'Used from loan kit'}: ${variantLabel(v.product.name, v.attributes, v.material?.code)}`, sku: v.sku, hsnCode: v.product.hsnCode, qty: u.qty, unitPricePaise: v.pricePaise, gstPercent: v.product.gstPercent, lineTotalPaise: total } });
      }
      await tx.kitBooking.update({ where: { id: bookingId }, data: { returnedAt: new Date(), usedItems: used as Prisma.InputJsonValue, missingItems: missing as Prisma.InputJsonValue } });
      await tx.order.update({ where: { id: orderId }, data: { subtotalPaise: { increment: addSub }, gstPaise: { increment: addGst }, totalPaise: { increment: addSub + addGst } } });
      await audit({ actorId: auth.userId, action: 'kit.return', entity: 'KitBooking', entityId: bookingId, after: { used, missing } }, tx);
      const open = await tx.kitBooking.count({ where: { orderId, returnedAt: null } });
      return { orderNo: o.orderNo, allReturned: open === 0 };
    });
    if (missing.length) await notifyAdmins(`Missing kit items — ${res.orderNo}`, `${missing.reduce((a, m) => a + m.qty, 0)} item(s) missing from returned loan kit`, { orderId });
    if (res.allReturned) await this.transition(orderId, 'KIT_RETURNED', actor, used.length ? `${used.length} used line(s) billed` : null);
    return this.get(auth, orderId);
  },

  trackLink(orderId: string) {
    const token = signTrackToken(orderId, new Date(Date.now() + 3 * 86400_000));
    return { token, url: `${env.PUBLIC_WEB_URL}/track?t=${token}` };
  },

  newIdempotencyKey: () => crypto.randomUUID(),
};
