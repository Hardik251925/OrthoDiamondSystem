import type { Response } from 'express';

export interface Envelope<T> {
  success: boolean;
  data: T | null;
  error?: { code: string; message: string; details?: unknown };
  meta?: Record<string, unknown>;
}

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>, status = 200) {
  const body: Envelope<T> = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export function fail(res: Response, status: number, code: string, message: string, details?: unknown) {
  const error: NonNullable<Envelope<null>['error']> = { code, message };
  if (details !== undefined) error.details = details;
  const body: Envelope<null> = { success: false, data: null, error };
  return res.status(status).json(body);
}
