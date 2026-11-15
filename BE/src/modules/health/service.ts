import { Redis } from 'ioredis';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';

interface Check {
  ok: boolean;
  latencyMs?: number;
  error?: string;
  [k: string]: unknown;
}

const withTimeout = <T>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${ms}ms`)), ms))]);

async function timed(fn: () => Promise<Record<string, unknown> | void>): Promise<Check> {
  const t = Date.now();
  try {
    const extra = (await fn()) ?? {};
    return { ok: true, latencyMs: Date.now() - t, ...extra };
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - t, error: err instanceof Error ? err.message : String(err) };
  }
}

export const healthService = {
  db: () =>
    timed(async () => {
      await withTimeout(prisma.$queryRaw`SELECT 1`, 3000);
    }),

  redis: () =>
    timed(async () => {
      const client = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        retryStrategy: () => null,
        connectTimeout: 1500,
      });
      client.on('error', () => undefined);
      try {
        await withTimeout(client.connect(), 2000);
        const pong = await withTimeout(client.ping(), 1500);
        return { reply: pong };
      } finally {
        client.disconnect();
      }
    }),

  ollama: () =>
    timed(async () => {
      const res = await fetch(`${env.OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { models?: { name: string }[] };
      const models = body.models?.map((m) => m.name) ?? [];
      return { model: env.OLLAMA_MODEL, modelInstalled: models.some((m) => m.startsWith(env.OLLAMA_MODEL)) };
    }),

  async all() {
    const [db, redis, ollama] = await Promise.all([this.db(), this.redis(), this.ollama()]);
    // DB is required; Redis (queues, Step 4) and Ollama (AI, Step 13) are reported but optional for now.
    const status = !db.ok ? 'down' : redis.ok && ollama.ok ? 'ok' : 'degraded';
    return { status, services: { db, redis, ollama }, uptimeSeconds: Math.round(process.uptime()), time: new Date().toISOString() };
  },
};
