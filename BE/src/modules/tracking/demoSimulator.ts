import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { cachedRoute, lastLive, pushLocation, type Point } from './service';

/**
 * DEMO_SIMULATOR=true: every 5 s, agents of DISPATCHED orders that are not sending real GPS
 * move along the OSRM route from the warehouse to the hospital (about 12 minutes per trip, looping).
 * Real GPS from the Android app always wins.
 */
const TRIP_MS = 12 * 60_000;

const bearing = (a: Point, b: Point) => (Math.atan2(b.lng - a.lng, b.lat - a.lat) * 180) / Math.PI;

async function tick() {
  const orders = await prisma.order.findMany({
    where: { status: 'DISPATCHED', assignedAgentId: { not: null } },
    select: { id: true, assignedAgentId: true, deliveryLat: true, deliveryLng: true, statusHistory: { where: { to: 'DISPATCHED' }, select: { at: true }, take: 1 } },
  });
  for (const o of orders) {
    const agentId = o.assignedAgentId!;
    const real = lastLive(agentId);
    if (real?.source === 'gps' && Date.now() - Date.parse(real.at) < 20_000) continue;
    const from = { lat: env.WAREHOUSE_LAT, lng: env.WAREHOUSE_LNG };
    const to = { lat: o.deliveryLat, lng: o.deliveryLng };
    const points = await cachedRoute(`${o.id}`, from, to);
    const started = o.statusHistory[0]?.at.getTime() ?? Date.now();
    // Demo only: loop the trip so the map keeps moving until someone marks the order as reached.
    const f = ((Date.now() - started) % TRIP_MS) / TRIP_MS;
    const idx = Math.min(points.length - 1, Math.floor(f * (points.length - 1)));
    const p = points[idx]!;
    const next = points[Math.min(points.length - 1, idx + 1)]!;
    await pushLocation(agentId, o.id, { lat: p.lat, lng: p.lng, speed: 6.5, heading: bearing(p, next) }, 'demo');
  }
}

export function startDemoSimulator() {
  if (!env.DEMO_SIMULATOR) return;
  logger.info('Demo delivery simulator ON (DEMO_SIMULATOR=true)');
  const run = () => tick().catch((err) => logger.warn({ err }, 'demo simulator tick failed'));
  run();
  setInterval(run, 5000).unref();
}
