import { Router } from 'express';
import { asyncHandler } from '../../lib/async';
import { validate } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { authController } from './controller';
import { otpRequestSchema, otpVerifySchema, refreshSchema } from './schema';

export const authRoutes = Router();

authRoutes.post('/otp/request', validate({ body: otpRequestSchema }), asyncHandler(authController.requestOtp));
authRoutes.post('/otp/verify', validate({ body: otpVerifySchema }), asyncHandler(authController.verifyOtp));
authRoutes.post('/refresh', validate({ body: refreshSchema }), asyncHandler(authController.refresh));
authRoutes.post('/logout', validate({ body: refreshSchema }), asyncHandler(authController.logout));
authRoutes.get('/me', requireAuth, asyncHandler(authController.me));
