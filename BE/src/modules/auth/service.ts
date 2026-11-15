import crypto from 'node:crypto';
import type { Role } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { badRequest, forbidden, tooMany, unauthorized } from '../../lib/errors';
import { getSmsProvider } from '../../lib/sms';
import { safeEqual } from '../../lib/crypto';
import { logger } from '../../lib/logger';
import { authRepository } from './repository';
import { hashOtp, hashRefreshToken, newRefreshToken, signAccessToken, signRegistrationToken } from './tokens';

const OTP_WINDOW_MS = 15 * 60 * 1000;
const OTP_MAX_PER_WINDOW = 5;

export interface TokenPair {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
}

export const authService = {
  async requestOtp(phone: string) {
    const recent = await authRepository.countRecentOtps(phone, new Date(Date.now() - OTP_WINDOW_MS));
    if (recent >= OTP_MAX_PER_WINDOW) throw tooMany('Too many OTP requests. Try again in 15 minutes.');

    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);
    await authRepository.createOtp(phone, hashOtp(phone, code), expiresAt);
    await getSmsProvider().send(phone, `${code} is your Ortho Diamond login OTP. Valid for ${Math.round(env.OTP_TTL_SECONDS / 60)} minutes.`);
    if (env.NODE_ENV === 'development') logger.info(`OTP for ${phone}: ${code}`);

    return {
      expiresInSeconds: env.OTP_TTL_SECONDS,
      ...(env.OTP_DEV_ECHO ? { devOtp: code } : {}),
    };
  },

  async verifyOtp(phone: string, code: string, userAgent?: string) {
    const otp = await authRepository.latestActiveOtp(phone);
    if (!otp) throw badRequest('OTP_INVALID', 'OTP expired or not requested. Request a new one.');
    if (otp.attempts >= env.OTP_MAX_ATTEMPTS) throw tooMany('Too many wrong attempts. Request a new OTP.');

    if (!safeEqual(otp.codeHash, hashOtp(phone, code))) {
      await authRepository.incrementOtpAttempts(otp.id);
      throw badRequest('OTP_INVALID', 'Incorrect OTP');
    }
    const consumed = await authRepository.consumeOtp(otp.id);
    if (consumed.count !== 1) throw badRequest('OTP_INVALID', 'OTP already used');

    const user = await authRepository.findUserByPhone(phone);
    if (!user) {
      // Unknown phone: allow self-registration as a doctor
      return { isNewUser: true as const, registrationToken: signRegistrationToken(phone) };
    }
    if (!user.isActive) throw forbidden('This account is disabled', 'ACCOUNT_DISABLED');

    await authRepository.touchLogin(user.id);
    const tokens = await this.issueTokens(user.id, user.role, undefined, userAgent);
    const { isActive: _ignored, ...publicUser } = user;
    return { isNewUser: false as const, user: publicUser, ...tokens };
  },

  /** New login (new family) or rotation inside an existing family. */
  async issueTokens(userId: string, role: Role, familyId?: string, userAgent?: string): Promise<TokenPair> {
    const refreshToken = newRefreshToken();
    await authRepository.createRefreshToken({
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      familyId: familyId ?? crypto.randomUUID(),
      expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86400_000),
      userAgent: userAgent?.slice(0, 255),
    });
    return { accessToken: signAccessToken(userId, role), accessTokenExpiresIn: env.JWT_ACCESS_TTL_SECONDS, refreshToken };
  },

  async refresh(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    const stored = await authRepository.findRefreshToken(hashRefreshToken(refreshToken));
    if (!stored) throw unauthorized('Invalid refresh token', 'REFRESH_INVALID');

    if (stored.revokedAt) {
      // A rotated token was used again => likely stolen. Kill the whole login.
      await authRepository.revokeFamily(stored.familyId);
      logger.warn({ userId: stored.userId, familyId: stored.familyId }, 'refresh token reuse detected');
      throw unauthorized('Session expired. Please log in again.', 'REFRESH_REUSED');
    }
    if (stored.expiresAt < new Date()) throw unauthorized('Session expired. Please log in again.', 'REFRESH_EXPIRED');

    const user = await authRepository.findUserById(stored.userId);
    if (!user || !user.isActive) throw unauthorized('Account not found or disabled', 'ACCOUNT_DISABLED');

    const next = newRefreshToken();
    await prisma.$transaction(async (tx) => {
      const created = await authRepository.createRefreshToken(
        {
          userId: user.id,
          tokenHash: hashRefreshToken(next),
          familyId: stored.familyId,
          expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 86400_000),
          userAgent: userAgent?.slice(0, 255),
        },
        tx,
      );
      const won = await authRepository.markRotated(stored.id, created.id, tx);
      if (!won) throw new Error('ROTATION_RACE');
    }).catch(async (err: unknown) => {
      if (err instanceof Error && err.message === 'ROTATION_RACE') {
        await authRepository.revokeFamily(stored.familyId);
        throw unauthorized('Session expired. Please log in again.', 'REFRESH_REUSED');
      }
      throw err;
    });

    return { accessToken: signAccessToken(user.id, user.role), accessTokenExpiresIn: env.JWT_ACCESS_TTL_SECONDS, refreshToken: next };
  },

  async logout(refreshToken: string) {
    const stored = await authRepository.findRefreshToken(hashRefreshToken(refreshToken));
    if (stored) await authRepository.revokeFamily(stored.familyId);
    return { loggedOut: true };
  },

  async me(userId: string) {
    const user = await authRepository.findUserById(userId);
    if (!user) throw unauthorized();
    const { isActive: _ignored, ...publicUser } = user;
    return publicUser;
  },
};
