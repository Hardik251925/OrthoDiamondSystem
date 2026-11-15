import type http from 'node:http';
import { Server, type Namespace, type Socket } from 'socket.io';
import { isAllowedOrigin } from '../middleware/cors';
import { buildAuthContext } from '../middleware/auth';
import { verifyAccessToken } from '../modules/auth/tokens';
import type { AuthContext } from '../types/express';
import { logger } from './logger';
import { verifyTrackToken } from './trackToken';

let io: Server | null = null;
const ns: { orders?: Namespace; admin?: Namespace; tracking?: Namespace } = {};

type Data = { auth?: AuthContext; trackOrderId?: string };

async function authenticate(socket: Socket): Promise<Data> {
  const token = (socket.handshake.auth?.token as string | undefined) ?? undefined;
  if (token) {
    const claims = verifyAccessToken(token);
    if (claims) {
      const auth = await buildAuthContext(claims.sub);
      if (auth) return { auth };
    }
  }
  const trackToken = socket.handshake.auth?.trackToken as string | undefined;
  if (trackToken) {
    const orderId = verifyTrackToken(trackToken);
    if (orderId) return { trackOrderId: orderId };
  }
  throw new Error('UNAUTHORIZED');
}

export interface RealtimeHandlers {
  canViewOrder: (auth: AuthContext, orderId: string) => Promise<boolean>;
  onAgentLocation: (auth: AuthContext, payload: unknown) => Promise<void>;
}

export function initRealtime(server: http.Server, handlers: RealtimeHandlers) {
  io = new Server(server, {
    cors: { origin: (origin, cb) => cb(null, !origin || isAllowedOrigin(origin)), credentials: true, allowedHeaders: ['ngrok-skip-browser-warning', 'authorization'] },
  });

  const use = (n: Namespace) =>
    n.use((socket, next) => {
      authenticate(socket)
        .then((d) => {
          socket.data = d;
          next();
        })
        .catch(() => next(new Error('UNAUTHORIZED')));
    });

  // /orders — order status + tracking for the people allowed to see an order
  ns.orders = io.of('/orders');
  use(ns.orders);
  ns.orders.on('connection', (socket) => {
    const d = socket.data as Data;
    if (d.auth) socket.join(`user:${d.auth.userId}`);
    if (d.trackOrderId) socket.join(`order:${d.trackOrderId}`);
    socket.on('order:join', async (orderId: unknown, ack?: (r: unknown) => void) => {
      if (typeof orderId !== 'string' || !d.auth) return ack?.({ ok: false });
      const allowed = await handlers.canViewOrder(d.auth, orderId).catch(() => false);
      if (allowed) socket.join(`order:${orderId}`);
      ack?.({ ok: allowed });
    });
    socket.on('order:leave', (orderId: unknown) => typeof orderId === 'string' && socket.leave(`order:${orderId}`));
  });

  // /admin — owner & staff dashboards
  ns.admin = io.of('/admin');
  use(ns.admin);
  ns.admin.use((socket, next) => {
    const role = (socket.data as Data).auth?.role;
    next(role === 'SUPER_ADMIN' || role === 'STAFF' ? undefined : new Error('FORBIDDEN'));
  });
  ns.admin.on('connection', (socket) => socket.join('admin'));

  // /tracking — delivery agents push GPS every 5 s
  ns.tracking = io.of('/tracking');
  use(ns.tracking);
  ns.tracking.use((socket, next) => next((socket.data as Data).auth?.role === 'DELIVERY_AGENT' ? undefined : new Error('FORBIDDEN')));
  ns.tracking.on('connection', (socket) => {
    const d = socket.data as Data;
    socket.on('location', async (payload: unknown, ack?: (r: unknown) => void) => {
      try {
        await handlers.onAgentLocation(d.auth!, payload);
        ack?.({ ok: true });
      } catch (err) {
        ack?.({ ok: false, error: err instanceof Error ? err.message : 'error' });
      }
    });
  });

  logger.info('Socket.IO ready: /orders /admin /tracking');
  return io;
}

export const emit = {
  toAdmin: (event: string, data: unknown) => ns.admin?.to('admin').emit(event, data),
  toOrder: (orderId: string, event: string, data: unknown) => ns.orders?.to(`order:${orderId}`).emit(event, data),
  toUser: (userId: string, event: string, data: unknown) => ns.orders?.to(`user:${userId}`).emit(event, data),
};

export const closeRealtime = () => io?.close();
