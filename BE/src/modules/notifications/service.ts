import type { NotificationChannel, Prisma } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { emit } from '../../lib/realtime';
import { getSmsProvider } from '../../lib/sms';
import { variantLabel } from '../../lib/stock';
import { joinItems, OWNER_TEMPLATE_BODY, renderTemplate, sanitizeParam, sendWhatsAppTemplate } from './whatsapp';

const IST = (d: Date) =>
  d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });

async function record(data: Prisma.NotificationUncheckedCreateInput) {
  return prisma.notification.create({ data });
}

/** Retry an async send up to 3 times with backoff (in-process; BullMQ when Redis queues are wired). */
async function withRetry<T extends { ok: boolean; error?: string }>(fn: () => Promise<T>, attempts = 3): Promise<T & { attempts: number }> {
  let last: T | undefined;
  for (let i = 1; i <= attempts; i++) {
    try {
      last = await fn();
      if (last.ok) return { ...last, attempts: i };
      if (last.error?.includes('not configured')) return { ...last, attempts: i }; // no point retrying
    } catch (err) {
      last = { ok: false, error: err instanceof Error ? err.message : String(err) } as T;
    }
    if (i < attempts) await new Promise((r) => setTimeout(r, 500 * 2 ** i));
  }
  return { ...(last as T), attempts };
}

/** In-app notification to one user (and live socket push). */
export async function notifyUser(userId: string, title: string, body: string, payload?: Record<string, unknown>) {
  const n = await record({ userId, channel: 'IN_APP', title, body, payload: payload as Prisma.InputJsonValue, status: 'SENT', sentAt: new Date(), attempts: 1 });
  emit.toUser(userId, 'notification', n);
  return n;
}

/** Admin broadcast (userId null) shown in the admin bell + live toast. */
export async function notifyAdmins(title: string, body: string, payload?: Record<string, unknown>) {
  const n = await record({ channel: 'IN_APP', title, body, payload: payload as Prisma.InputJsonValue, status: 'SENT', sentAt: new Date(), attempts: 1 });
  emit.toAdmin('notification', n);
  return n;
}

export async function buildOwnerMessage(orderId: string) {
  const o = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { hospital: true, items: true },
  });
  const p = (o.patient ?? {}) as Record<string, unknown>;
  const patient = [p.name, p.age ? `${p.age}y` : null, p.gender, p.procedure, p.side ? `(${p.side})` : null].filter(Boolean).join(' ');
  const items = o.items.map((i) => `${i.description} x${i.qty}`);
  const base = [
    o.orderNo,
    o.priority === 'EMERGENCY' ? '[EMERGENCY]' : '[SCHEDULED]',
    o.treatingDoctorName,
    o.treatingDoctorPhone,
    o.hospital.name,
    patient || '-',
    IST(o.surgeryAt),
  ].map(sanitizeParam);
  const tail = [o.deliveryAddress, `https://maps.google.com/?q=${o.deliveryLat},${o.deliveryLng}`, `${env.PUBLIC_BASE_URL}/admin/orders/${o.id}`].map(sanitizeParam);
  const itemsParam = sanitizeParam(joinItems(items, [...base, ...tail]));
  const params = [...base, itemsParam, ...tail];
  return { order: o, params, text: renderTemplate(OWNER_TEMPLATE_BODY, params) };
}

/** SPEC §5: every enabled owner number gets the od_new_order template; fallback SMS -> console; plus in-app. */
export async function notifyOwnerNewOrder(orderId: string) {
  const { order, params, text } = await buildOwnerMessage(orderId);
  const contacts = await prisma.ownerContact.findMany({ where: { enabled: true } });
  for (const c of contacts) await deliverOwner(c.whatsappNumber, params, text, order.id);
  await notifyAdmins(
    order.priority === 'EMERGENCY' ? `EMERGENCY order ${order.orderNo}` : `New order ${order.orderNo}`,
    `${order.treatingDoctorName} — ${order.items.length} item(s)`,
    { orderId: order.id, priority: order.priority },
  );
  logger.info(`\n──── OWNER MESSAGE ────\n${text}\n───────────────────────`);
}

async function deliverOwner(to: string, params: string[], text: string, orderId: string) {
  const payload = { orderId, params } as Prisma.InputJsonValue;
  const wa = await withRetry(() => sendWhatsAppTemplate(to, env.WHATSAPP_TEMPLATE_NEW_ORDER, params));
  await record({ channel: 'WHATSAPP', recipient: to, template: env.WHATSAPP_TEMPLATE_NEW_ORDER, title: 'New order (WhatsApp)', body: text, payload, status: wa.ok ? 'SENT' : 'FAILED', error: wa.error ?? null, attempts: wa.attempts, sentAt: wa.ok ? new Date() : null });
  if (wa.ok) return;
  // Fallback: SMS (items truncated) -> console
  const sms = text.length > 600 ? `${text.slice(0, 590)}…` : text;
  const channel: NotificationChannel = env.SMS_PROVIDER === 'console' ? 'CONSOLE' : 'SMS';
  try {
    await getSmsProvider().send(to, sms);
    await record({ channel, recipient: to, title: 'New order (SMS fallback)', body: sms, payload, status: 'SENT', attempts: 1, sentAt: new Date() });
  } catch (err) {
    await record({ channel, recipient: to, title: 'New order (SMS fallback)', body: sms, payload, status: 'FAILED', error: String(err), attempts: 1 });
  }
}

/** Retry a failed notification from the admin panel. */
export async function retryNotification(id: string) {
  const n = await prisma.notification.findUniqueOrThrow({ where: { id } });
  if (n.channel === 'WHATSAPP' && n.recipient) {
    const params = ((n.payload as { params?: string[] } | null)?.params ?? []) as string[];
    const r = await withRetry(() => sendWhatsAppTemplate(n.recipient!, n.template ?? env.WHATSAPP_TEMPLATE_NEW_ORDER, params));
    return prisma.notification.update({ where: { id }, data: { status: r.ok ? 'SENT' : 'FAILED', error: r.error ?? null, attempts: { increment: r.attempts }, sentAt: r.ok ? new Date() : null } });
  }
  if (n.recipient) await getSmsProvider().send(n.recipient, n.body);
  return prisma.notification.update({ where: { id }, data: { status: 'SENT', error: null, attempts: { increment: 1 }, sentAt: new Date() } });
}

const STATUS_TEXT: Record<string, string> = {
  ACCEPTED: 'has been accepted by Ortho Diamond',
  REJECTED: 'was rejected',
  PACKED: 'is packed and ready for dispatch',
  DISPATCHED: 'is on the way',
  REACHED_HOSPITAL: 'has reached the hospital',
  DELIVERED_TO_OT: 'was delivered to the OT',
  CANCELLED: 'was cancelled',
};

/** Doctor / buyer updates on status changes (SPEC §5). */
export async function notifyOrderStatus(orderId: string, status: string, reason?: string | null, trackUrl?: string) {
  const text = STATUS_TEXT[status];
  if (!text) return;
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { orderNo: true, placedById: true, doctor: { select: { userId: true } } } });
  if (!o) return;
  const body = `Order ${o.orderNo} ${text}${reason ? `: ${reason}` : ''}${trackUrl ? `. Track: ${trackUrl}` : ''}`;
  const users = new Set([o.placedById, o.doctor?.userId].filter(Boolean) as string[]);
  for (const u of users) await notifyUser(u, `Order ${status.replace(/_/g, ' ').toLowerCase()}`, body, { orderId, status });
}

/** Restock -> notify everyone who asked "notify me" for this size. */
export async function notifyStockAlerts(variantId: string) {
  try {
    const alerts = await prisma.stockAlert.findMany({ where: { variantId, notifiedAt: null }, include: { variant: { include: { product: true, material: true } } } });
    for (const a of alerts) {
      const label = variantLabel(a.variant.product.name, a.variant.attributes, a.variant.material?.code);
      await notifyUser(a.userId, 'Back in stock', `${label} (${a.variant.sku}) is available again.`, { variantId, productSlug: a.variant.product.slug });
      await prisma.stockAlert.update({ where: { id: a.id }, data: { notifiedAt: new Date() } });
    }
  } catch (err) {
    logger.error({ err }, 'stock alert notify failed');
  }
}
