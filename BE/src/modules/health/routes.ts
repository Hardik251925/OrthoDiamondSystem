import { Router } from 'express';
import { asyncHandler } from '../../lib/async';
import { ok, fail } from '../../lib/envelope';
import { healthService } from './service';

export const healthRoutes = Router();

healthRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const report = await healthService.all();
    if (report.status === 'down') return fail(res, 503, 'UNHEALTHY', 'Database unavailable', report);
    ok(res, report);
  }),
);
