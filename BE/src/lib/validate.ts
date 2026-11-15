import type { RequestHandler } from 'express';
import { z } from 'zod';
import { badRequest } from './errors';

interface Schemas {
  body?: z.ZodType;
  query?: z.ZodType;
  params?: z.ZodType;
}

export function formatIssues(error: z.ZodError) {
  return error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
}

/** Parse with a Zod schema or throw a VALIDATION_ERROR AppError. */
export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown, what = 'body'): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest('VALIDATION_ERROR', `Invalid request ${what}`, formatIssues(result.error));
  }
  return result.data;
}

/** Zod validation middleware for body / query / params. Parsed values replace the raw ones. */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    try {
      const target = req as unknown as Record<string, unknown>;
      for (const key of ['params', 'query', 'body'] as const) {
        const schema = schemas[key];
        if (schema) target[key] = parseOrThrow(schema, req[key], key);
      }
      next();
    } catch (err) {
      next(err);
    }
  };

/** Indian mobile: accepts 9876543210, 09876543210, +919876543210 -> +919876543210 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-]/g, ''))
  .refine((v) => /^(\+91|0)?[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit Indian mobile number')
  .transform((v) => `+91${v.slice(-10)}`);
