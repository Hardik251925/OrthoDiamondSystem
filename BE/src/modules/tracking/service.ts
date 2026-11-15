import { z } from 'zod';
import { env } from '../../config/env';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { emit } from '../../lib/realtime';
import type { AuthContext } from '../../types/express';

export interface Point { lat: number; lng: number }
export interface LivePos extends Point { speed?: number | null; heading?: number | null; at: string; agentId: string; orderId?: string | null; source: 'gps' | 'demo' }

const live = new Map<string, LivePos>(); // agentId -> last position (memory, broadcast immediately)
const lastDbWrite = new Map<string, number>(); // agentId -> ms
const etaCache = new Map<string, { at: number; value: Eta }>(); // orderId -> eta
const routeCache = new Map<string, Point[]>(); // "a|b" -> polyline

export interface Eta { seconds: number; meters: number; source: 'osrm' | 'estimate'; route?: Point[] }

const haversine = (a: Point, b: Point) => {
  const R = 6371e3, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Driving route via OSRM (public demo server in dev only). Falls back to a straight line. */
export async function route(from: Point, to: Point): Promise<{ points: Point[]; seconds: number; meters: number; source: 'osrm' | 'estimate' }> {
  try {
    const url = `${env.OSRM_URL}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'OrthoDiamond-dev' } });
    const body = (await res.json()) as { routes?: { duration: number; distance: number; geometry: { coordinates: [number, number][] } }[] };
    const r = body.routes?.[0];
    if (r) return { points: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })), seconds: r.duration, meters: r.distance, source: 'osrm' };
  } catch (err) {
    logger.debug({ err }, 'OSRM unavailable, using estimate');
  }
  const meters = haversine(from, to) * 1.3;
  const steps = 40;
  const points = Array.from({ length: steps + 1 }, (_, i) => ({ lat: from.lat + ((to.lat - from.lat) * i) / steps, lng: from.lng + ((to.lng - from.lng) * i) / steps }));
  return { points, seconds: meters / (22 / 3.6), meters, source: 'estimate' };
}

async function eta(orderId: string, from: Point, to: Point): Promise<Eta> {
  const c = etaCache.get(orderId);
  if (c && Date.now() - c.at < 30_000) return c.value; // SPEC §6: cached 30 s
  const r = await route(from, to);
  const value: Eta = { seconds: Math.round(r.seconds), meters: Math.round(r.meters), source: r.source, route: r.points };
  etaCache.set(orderId, { at: Date.now(), value });
  return value;
}

/** Shared pipeline for real GPS and the demo simulator: broadcast now, persist at most every 15 s. */
export async function pushLocation(agentId: string, orderId: string | null, p: { lat: number; lng: number; speed?: number | null; heading?: number | null }, source: 'gps' | 'demo') {
  const pos: LivePos = { ...p, at: new Date().toISOString(), agentId, orderId, source };
  live.set(agentId, pos);
  let etaInfo: Eta | null = null;
  if (orderId) {
    const o = await prisma.order.findUnique({ where: { id: orderId }, select: { deliveryLat: true, deliveryLng: true } });
    if (o) etaInfo = await eta(orderId, p, { lat: o.deliveryLat, lng: o.deliveryLng });
    const msg = { ...pos, eta: etaInfo ? { seconds: etaInfo.seconds, meters: etaInfo.meters, source: etaInfo.source } : null };
    emit.toOrder(orderId, 'tracking:location', msg);
    emit.toAdmin('tracking:location', msg);
  } else emit.toAdmin('tracking:location', pos);

  const last = lastDbWrite.get(agentId) ?? 0;
  if (Date.now() - last >= 15_000) {
    lastDbWrite.set(agentId, Date.now());
    await prisma.$transaction([
      prisma.deliveryLocation.create({ data: { agentId, orderId, lat: p.lat, lng: p.lng, speed: p.speed ?? null, heading: p.heading ?? null } }),
      prisma.deliveryAgent.update({ where: { id: agentId }, data: { lastLat: p.lat, lastLng: p.lng, lastSeenAt: new Date() } }),
    ]);
  }
  return etaInfo;
}

const locationSchema = z.object({
  orderId: z.uuid().optional().nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  speed: z.number().optional().nullable(),
  heading: z.number().optional().nullable(),
});

/** Socket /tracking 'location' handler. */
export async function onAgentLocation(auth: AuthContext, payload: unknown) {
  const p = locationSchema.safeParse(payload);
  if (!p.success) throw badRequest('VALIDATION_ERROR', 'Invalid location');
  const agent = await prisma.deliveryAgent.findUnique({ where: { userId: auth.userId } });
  if (!agent) throw forbidden('Not a delivery agent');
  if (p.data.orderId) {
    const o = await prisma.order.findUnique({ where: { id: p.data.orderId }, select: { assignedAgentId: true, status: true } });
    if (!o || o.assignedAgentId !== agent.id) throw forbidden('Order not assigned to you');
    if (o.status !== 'DISPATCHED' && o.status !== 'REACHED_HOSPITAL') throw badRequest('NOT_IN_TRANSIT', 'Order is not in transit');
  }
  await pushLocation(agent.id, p.data.orderId ?? null, p.data, 'gps');
}

export const lastLive = (agentId: string) => live.get(agentId);

/** GET /api/orders/:id/tracking — last location, route polyline, ETA, agent contact. */
export async function trackingFor(orderId: string) {
  const o = await prisma.order.findUnique({
    where: { id: orderId },
    include: { assignedAgent: { include: { user: { select: { name: true, phone: true } } } }, hospital: { select: { name: true } }, statusHistory: { orderBy: { at: 'asc' } } },
  });
  if (!o) throw notFound('Order');
  const dest = { lat: o.deliveryLat, lng: o.deliveryLng };
  let pos: Point & { at?: string; speed?: number | null; heading?: number | null } | null = null;
  if (o.assignedAgent) {
    const m = live.get(o.assignedAgent.id);
    if (m && (!m.orderId || m.orderId === o.id)) pos = m;
    else {
      const d = await prisma.deliveryLocation.findFirst({ where: { orderId: o.id }, orderBy: { at: 'desc' } });
      if (d) pos = { lat: d.lat, lng: d.lng, at: d.at.toISOString(), speed: d.speed, heading: d.heading };
      else if (o.assignedAgent.lastLat != null) pos = { lat: o.assignedAgent.lastLat, lng: o.assignedAgent.lastLng!, at: o.assignedAgent.lastSeenAt?.toISOString() };
    }
  }
  const inTransit = o.status === 'DISPATCHED' || o.status === 'REACHED_HOSPITAL';
  const e = pos && inTransit ? await eta(o.id, pos, dest) : null;
  return {
    orderId: o.id, orderNo: o.orderNo, status: o.status, priority: o.priority,
    destination: { ...dest, address: o.deliveryAddress, hospital: o.hospital.name },
    origin: { lat: env.WAREHOUSE_LAT, lng: env.WAREHOUSE_LNG },
    agent: o.assignedAgent ? { id: o.assignedAgent.id, name: o.assignedAgent.user.name, phone: o.assignedAgent.user.phone, vehicleNo: o.assignedAgent.vehicleNo } : null,
    position: pos,
    eta: e ? { seconds: e.seconds, meters: e.meters, source: e.source } : null,
    route: e?.route ?? null,
    timeline: o.statusHistory.map((h) => ({ to: h.to, at: h.at, reason: h.reason })),
  };
}

export async function cachedRoute(key: string, from: Point, to: Point) {
  if (!routeCache.has(key)) routeCache.set(key, (await route(from, to)).points);
  return routeCache.get(key)!;
}
