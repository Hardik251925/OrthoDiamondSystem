import express from 'express';
import pinoHttp from 'pino-http';
import { logger } from './lib/logger';
import { cors } from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/error';
import { catalogAdminRoutes } from './modules/admin/catalogAdmin';
import { adminRoutes, agentRoutes, myNotificationRoutes } from './modules/admin/routes';
import { authRoutes } from './modules/auth/routes';
import { cartRoutes } from './modules/cart/routes';
import { catalogRoutes } from './modules/catalog/routes';
import { doctorRoutes } from './modules/doctors/routes';
import { healthRoutes } from './modules/health/routes';
import { hospitalRoutes } from './modules/hospitals/routes';
import { kitRoutes, templateRoutes } from './modules/kits/routes';
import { orderRoutes, publicTrackRoutes } from './modules/orders/routes';
import { stockAlertRoutes, stockRoutes } from './modules/stock/routes';
import { uploadRoutes } from './modules/uploads/routes';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback'); // gateway on the same machine

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => req.url === '/api/health' },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    }),
  );
  app.use(cors);
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  const api = express.Router();
  api.use('/health', healthRoutes);
  api.use('/auth', authRoutes);
  api.use('/doctors', doctorRoutes);
  api.use('/hospitals', hospitalRoutes);
  api.use('/catalog', catalogRoutes);
  api.use('/kits', kitRoutes);
  api.use('/procedure-templates', templateRoutes);
  api.use('/stock', stockRoutes);
  api.use('/stock-alerts', stockAlertRoutes);
  api.use('/cart', cartRoutes);
  api.use('/orders', orderRoutes);
  api.use('/track', publicTrackRoutes);
  api.use('/admin/catalog', catalogAdminRoutes);
  api.use('/admin', adminRoutes);
  api.use('/agents', agentRoutes);
  api.use('/notifications', myNotificationRoutes);
  api.use(notFoundHandler);

  app.use('/api', api);
  app.use('/uploads', uploadRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
