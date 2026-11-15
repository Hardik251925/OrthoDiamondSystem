import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../../config/env';
import { randomToken, sha256 } from '../../lib/crypto';

export interface AccessClaims {
  sub: string;
  role: Role;
  typ: 'access';
}

interface RegistrationClaims {
  phone: string;
  typ: 'register';
}

export function signAccessToken(userId: string, role: Role) {
  const claims: AccessClaims = { sub: userId, role, typ: 'access' };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_TTL_SECONDS, algorithm: 'HS256' });
}

export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'object' && decoded.typ === 'access' && typeof decoded.sub === 'string') {
      return decoded as AccessClaims;
    }
    return null;
  } catch {
    return null;
  }
}

/** Short-lived token proving the phone was OTP-verified; used only to call /api/doctors/register. */
export function signRegistrationToken(phone: string) {
  const claims: RegistrationClaims = { phone, typ: 'register' };
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, { expiresIn: 30 * 60, algorithm: 'HS256' });
}

export function verifyRegistrationToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded === 'object' && decoded.typ === 'register' && typeof decoded.phone === 'string') {
      return decoded.phone;
    }
    return null;
  } catch {
    return null;
  }
}

export const newRefreshToken = () => randomToken(48);
/** Refresh tokens are stored only as a peppered hash. */
export const hashRefreshToken = (token: string) => sha256(`${token}.${env.JWT_REFRESH_PEPPER}`);
export const hashOtp = (phone: string, code: string) => sha256(`${phone}:${code}:${env.JWT_REFRESH_PEPPER}`);
