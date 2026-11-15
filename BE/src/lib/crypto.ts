import crypto from 'node:crypto';
import { env } from '../config/env';

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');

export const hmac = (value: string, key = env.URL_SIGNING_SECRET) =>
  crypto.createHmac('sha256', key).update(value).digest('base64url');

export const randomToken = (bytes = 48) => crypto.randomBytes(bytes).toString('base64url');

export const safeEqual = (a: string, b: string) => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};
