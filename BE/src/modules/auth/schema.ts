import { z } from 'zod';
import { phoneSchema } from '../../lib/validate';

export const otpRequestSchema = z.object({ phone: phoneSchema });
export const otpVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});
export const refreshSchema = z.object({ refreshToken: z.string().min(20) });
