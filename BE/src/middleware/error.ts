import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import multer from 'multer';
import { AppError } from '../lib/errors';
import { fail } from '../lib/envelope';
import { logger } from '../lib/logger';

export const notFoundHandler: RequestHandler = (req, res) => {
  fail(res, 404, 'ROUTE_NOT_FOUND', `No route for ${req.method} ${req.path}`);
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : err.message;
    return fail(res, 400, 'UPLOAD_ERROR', message, { field: err.field });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return fail(res, 409, 'CONFLICT', 'A record with these details already exists', err.meta);
    if (err.code === 'P2025') return fail(res, 404, 'NOT_FOUND', 'Record not found');
  }
  if (err?.type === 'entity.parse.failed') {
    return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  if (err?.type === 'entity.too.large') {
    return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  logger.error({ err, path: req.path, method: req.method }, 'unhandled error');
  return fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong');
};
