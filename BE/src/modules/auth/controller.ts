import type { Request, Response } from 'express';
import { ok } from '../../lib/envelope';
import { authService } from './service';

export const authController = {
  async requestOtp(req: Request, res: Response) {
    ok(res, await authService.requestOtp(req.body.phone));
  },
  async verifyOtp(req: Request, res: Response) {
    ok(res, await authService.verifyOtp(req.body.phone, req.body.code, req.headers['user-agent']));
  },
  async refresh(req: Request, res: Response) {
    ok(res, await authService.refresh(req.body.refreshToken, req.headers['user-agent']));
  },
  async logout(req: Request, res: Response) {
    ok(res, await authService.logout(req.body.refreshToken));
  },
  async me(req: Request, res: Response) {
    ok(res, { ...(await authService.me(req.auth!.userId)), isApproved: req.auth!.isApproved });
  },
};
