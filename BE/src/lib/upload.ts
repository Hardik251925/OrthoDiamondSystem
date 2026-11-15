import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { env } from '../config/env';
import { badRequest } from './errors';

const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
const DOC_TYPES: Record<string, string> = { ...IMAGE_TYPES, 'application/pdf': '.pdf' };

/**
 * multer for files under uploads/private/<folder>. These are never served statically;
 * only through signed, expiring URLs (see lib/signedUrl.ts).
 */
export function privateUpload(folder: string, allowPdf = true) {
  const types = allowPdf ? DOC_TYPES : IMAGE_TYPES;
  const dir = path.join(env.uploadRoot, 'private', folder);
  fs.mkdirSync(dir, { recursive: true });
  return multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${types[file.mimetype] ?? ''}`),
    }),
    limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (types[file.mimetype]) cb(null, true);
      else cb(badRequest('UPLOAD_TYPE', `Allowed file types: ${Object.values(types).join(', ')}`));
    },
  });
}

/** Path relative to uploads/private with forward slashes, e.g. "certificates/abc.jpg". */
export const privateRelPath = (folder: string, filename: string) => `${folder}/${filename}`;

export function removePrivateFile(relPath: string | undefined) {
  if (!relPath) return;
  fs.promises.unlink(path.join(env.uploadRoot, 'private', relPath)).catch(() => undefined);
}
