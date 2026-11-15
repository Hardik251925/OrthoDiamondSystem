import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { logger } from './logger';

type Db = Prisma.TransactionClient;

export interface AuditEntry {
  actorId?: string | null;
  action: string; // e.g. "doctor.approve"
  entity: string; // e.g. "Doctor"
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

const toJson = (v: unknown) =>
  v === undefined || v === null ? undefined : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue);

/**
 * Write an AuditLog row. Pass a transaction client to make it part of that transaction
 * (then a failure aborts the transaction). Outside a transaction, failures are logged, not thrown.
 */
export async function audit(entry: AuditEntry, db?: Db) {
  const data = {
    actorId: entry.actorId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: toJson(entry.before),
    after: toJson(entry.after),
    ip: entry.ip ?? null,
  };
  if (db) {
    await db.auditLog.create({ data });
    return;
  }
  try {
    await prisma.auditLog.create({ data });
  } catch (err) {
    logger.error({ err, action: entry.action }, 'audit log write failed');
  }
}
