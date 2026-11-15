import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

type Db = Prisma.TransactionClient | typeof prisma;

export type StockStatus = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK';

/** availableQty = sum(non-expired batch qty) - reservedQty   (SPEC §3) */
export async function availability(variantIds: string[], db: Db = prisma) {
  const out = new Map<string, { available: number; onHand: number; reserved: number; threshold: number; status: StockStatus }>();
  if (!variantIds.length) return out;
  const [batches, variants] = await Promise.all([
    db.stockBatch.groupBy({
      by: ['variantId'],
      where: { variantId: { in: variantIds }, qty: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] },
      _sum: { qty: true },
    }),
    db.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, reservedQty: true, lowStockThreshold: true } }),
  ]);
  const onHandMap = new Map(batches.map((b) => [b.variantId, b._sum.qty ?? 0]));
  for (const v of variants) {
    const onHand = onHandMap.get(v.id) ?? 0;
    const available = Math.max(0, onHand - v.reservedQty);
    out.set(v.id, {
      available,
      onHand,
      reserved: v.reservedQty,
      threshold: v.lowStockThreshold,
      status: statusFor(available, v.lowStockThreshold),
    });
  }
  return out;
}

export const statusFor = (available: number, threshold: number): StockStatus =>
  available <= 0 ? 'OUT_OF_STOCK' : available <= threshold ? 'LOW_STOCK' : 'IN_STOCK';

/** Deduct qty from batches, earliest expiry first (FEFO); non-expiring batches last, then oldest received. */
export async function deductFefo(tx: Prisma.TransactionClient, variantId: string, qty: number, reason: string, orderId: string | null, actorId: string | null) {
  const batches = await tx.stockBatch.findMany({
    where: { variantId, qty: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gt: new Date() } }] },
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
  });
  let left = qty;
  for (const b of batches) {
    if (left <= 0) break;
    const take = Math.min(b.qty, left);
    await tx.stockBatch.update({ where: { id: b.id }, data: { qty: { decrement: take } } });
    await tx.stockAdjustment.create({ data: { variantId, batchId: b.id, delta: -take, reason, orderId, actorId } });
    left -= take;
  }
  if (left > 0) throw new Error(`FEFO: not enough stock for variant ${variantId} (short ${left})`);
}

/** Human label for a variant, e.g. "3.5mm Locking Screw 20mm Ti" */
export function variantLabel(productName: string, attrs: unknown, materialCode?: string | null) {
  const a = (attrs ?? {}) as Record<string, unknown>;
  const parts = [productName];
  if (a.lengthMm) parts.push(`${a.lengthMm}mm`);
  if (a.holes) parts.push(`${a.holes} hole`);
  if (a.side) parts.push(a.side === 'L' ? 'Left' : 'Right');
  if (a.angle) parts.push(`${a.angle}°`);
  if (materialCode) parts.push(materialCode === 'TI' ? 'Ti' : materialCode === 'SS' ? 'SS' : materialCode);
  if (a.diameterMm && !String(productName).includes(`${a.diameterMm}mm`)) parts.splice(1, 0, `Ø${a.diameterMm}mm`);
  return parts.join(' ');
}
