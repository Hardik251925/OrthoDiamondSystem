import { env } from '../config/env';
import { hmac, safeEqual } from './crypto';

/** Signed, expiring URL for a file in uploads/private. relPath is relative to uploads/private, using "/". */
export function signPrivatePath(relPath: string, ttlSeconds = env.SIGNED_URL_TTL_SECONDS) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = hmac(`${relPath}:${exp}`);
  const encoded = relPath.split('/').map(encodeURIComponent).join('/');
  return { url: `/uploads/private/${encoded}?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000) };
}

export function verifyPrivatePath(relPath: string, exp: unknown, sig: unknown) {
  if (typeof exp !== 'string' || typeof sig !== 'string') return false;
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum < Date.now() / 1000) return false;
  return safeEqual(hmac(`${relPath}:${expNum}`), sig);
}
