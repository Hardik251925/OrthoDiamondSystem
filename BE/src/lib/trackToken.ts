import { hmac, safeEqual } from './crypto';

/** Public read-only tracking token: base64url(orderId.exp).sig  — expiry is set by the caller. */
export function signTrackToken(orderId: string, expiresAt: Date) {
  const body = Buffer.from(`${orderId}.${Math.floor(expiresAt.getTime() / 1000)}`).toString('base64url');
  return `${body}.${hmac(`track:${body}`)}`;
}

export function verifyTrackToken(token: string): string | null {
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(hmac(`track:${body}`), sig)) return null;
  const [orderId, exp] = Buffer.from(body, 'base64url').toString().split('.');
  if (!orderId || !exp || Number(exp) * 1000 < Date.now()) return null;
  return orderId;
}
