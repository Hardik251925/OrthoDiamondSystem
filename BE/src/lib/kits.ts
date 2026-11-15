import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { availability } from './stock';

type Db = Prisma.TransactionClient | typeof prisma;
export const LOAN_DAYS = 3;
const H = 3600_000;

/** A loan kit is busy from 12 h before surgery until it is returned (or expected back). */
export function bookingWindow(surgeryAt: Date, expectedReturnAt?: Date | null) {
  return { from: new Date(surgeryAt.getTime() - 12 * H), to: expectedReturnAt ?? new Date(surgeryAt.getTime() + LOAN_DAYS * 24 * H) };
}

/** Loan kit availability = physicalSets - overlapping open bookings (SPEC §4). */
export async function loanKitAvailable(kitId: string, surgeryAt: Date, db: Db = prisma, excludeOrderId?: string) {
  const kit = await db.operationKit.findUnique({ where: { id: kitId }, select: { physicalSets: true } });
  if (!kit) return 0;
  const want = bookingWindow(surgeryAt);
  const bookings = await db.kitBooking.findMany({
    where: {
      kitId,
      returnedAt: null,
      ...(excludeOrderId ? { orderId: { not: excludeOrderId } } : {}),
      order: { status: { notIn: ['CANCELLED', 'REJECTED', 'CLOSED', 'KIT_RETURNED'] } },
    },
    select: { surgeryAt: true, expectedReturnAt: true },
  });
  const overlapping = bookings.filter((b) => {
    const w = bookingWindow(b.surgeryAt, b.expectedReturnAt);
    return w.from < want.to && want.from < w.to;
  }).length;
  return Math.max(0, kit.physicalSets - overlapping);
}

/** Sale kit availability = how many complete kits current stock can build. */
export async function saleKitAvailable(kitId: string, db: Db = prisma) {
  const items = await db.kitItem.findMany({ where: { kitId } });
  if (!items.length) return 0;
  const stock = await availability(items.map((i) => i.variantId), db);
  return Math.min(...items.map((i) => Math.floor((stock.get(i.variantId)?.available ?? 0) / i.qty)));
}

export async function kitAvailable(kit: { id: string; type: 'SALE' | 'LOAN' }, date: Date, db: Db = prisma) {
  return kit.type === 'LOAN' ? loanKitAvailable(kit.id, date, db) : saleKitAvailable(kit.id, db);
}
