import path from 'node:path';
import express, { Router } from 'express';
import { env } from '../../config/env';
import { fail } from '../../lib/envelope';
import { verifyPrivatePath } from '../../lib/signedUrl';

export const uploadRoutes = Router();

// Public product images, banners etc.
uploadRoutes.use('/public', express.static(path.join(env.uploadRoot, 'public'), { fallthrough: false, maxAge: '7d' }));

// Private files (certificates, X-rays, proofs): only with a valid signature that has not expired.
uploadRoutes.get(/^\/private\/(.+)$/, (req, res) => {
  const relPath = decodeURIComponent((req.params as Record<string, string>)[0] ?? '');
  if (relPath.includes('..') || path.isAbsolute(relPath)) {
    return fail(res, 400, 'BAD_PATH', 'Invalid file path');
  }
  if (!verifyPrivatePath(relPath, req.query.exp, req.query.sig)) {
    return fail(res, 403, 'SIGNATURE_INVALID', 'Link expired or invalid');
  }
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(path.join(env.uploadRoot, 'private', relPath), (err) => {
    if (err && !res.headersSent) fail(res, 404, 'NOT_FOUND', 'File not found');
  });
});
