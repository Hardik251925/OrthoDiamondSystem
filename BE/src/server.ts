import http from 'node:http';
import { env } from './config/env';
import { createApp } from './app';
import { logger } from './lib/logger';
import { prisma } from './lib/prisma';
import { closeRealtime, initRealtime } from './lib/realtime';
import { canViewOrder } from './modules/orders/service';
import { startDemoSimulator } from './modules/tracking/demoSimulator';
import { onAgentLocation } from './modules/tracking/service';

const server = http.createServer(createApp());
initRealtime(server, { canViewOrder, onAgentLocation });

server.listen(env.PORT, env.HOST, () => {
  logger.info(`Ortho Diamond API listening on http://${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
  startDemoSimulator();
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  closeRealtime();
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
