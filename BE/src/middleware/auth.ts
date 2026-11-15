import type { RequestHandler } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { forbidden, unauthorized } from '../lib/errors';
import { verifyAccessToken, verifyRegistrationToken } from '../modules/auth/tokens';
import type { AuthContext } from '../types/express';

const bearer = (header: string | undefined) => {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};

/** Loads the user on every request so disabling a user or approving a doctor takes effect immediately. */
export async function buildAuthContext(userId: string): Promise<AuthContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, isActive: true, hospitalId: true, doctor: { select: { id: true, status: true } } },
  });
  if (!user || !user.isActive) return null;
  let isApproved = false;
  switch (user.role) {
    case 'SUPER_ADMIN':
    case 'STAFF':
      isApproved = true;
      break;
    case 'DOCTOR':
      isApproved = user.doctor?.status === 'APPROVED';
      break;
    case 'HOSPITAL_PURCHASE':
      isApproved = user.hospitalId !== null;
      break;
    case 'DELIVERY_AGENT':
      isApproved = false; // agents deliver; they never see prices or order
      break;
  }
  return { userId: user.id, role: user.role, isApproved, doctorId: user.doctor?.id, hospitalId: user.hospitalId };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = bearer(req.headers.authorization);
  const claims = token ? verifyAccessToken(token) : null;
  if (!claims) return next(unauthorized('Missing or expired access token', 'TOKEN_INVALID'));
  buildAuthContext(claims.sub)
    .then((ctx) => {
      if (!ctx) return next(unauthorized('Account not found or disabled', 'ACCOUNT_DISABLED'));
      req.auth = ctx;
      next();
    })
    .catch(next);
};

/** Attaches req.auth when a valid token is present, otherwise continues as a public visitor. */
export const optionalAuth: RequestHandler = (req, _res, next) => {
  const token = bearer(req.headers.authorization);
  const claims = token ? verifyAccessToken(token) : null;
  if (!claims) return next();
  buildAuthContext(claims.sub)
    .then((ctx) => {
      if (ctx) req.auth = ctx;
      next();
    })
    .catch(next);
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden('Your role cannot perform this action', 'ROLE_FORBIDDEN'));
    next();
  };

/** Prices & ordering: approved doctors, hospital buyers and admin staff only. */
export const requireApproved: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(unauthorized());
  if (!req.auth.isApproved) {
    return next(forbidden('Your account is awaiting approval by Ortho Diamond', 'NOT_APPROVED'));
  }
  next();
};

export const requireRegistrationToken: RequestHandler = (req, _res, next) => {
  const token = bearer(req.headers.authorization);
  const phone = token ? verifyRegistrationToken(token) : null;
  if (!phone) return next(unauthorized('Verify your phone with OTP first', 'REGISTRATION_TOKEN_INVALID'));
  req.registrationPhone = phone;
  next();
};
