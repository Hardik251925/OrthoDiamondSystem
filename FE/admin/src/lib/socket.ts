import { io, type Socket } from 'socket.io-client';
import { session } from './api';

let admin: Socket | null = null;

/** /admin namespace: new orders, status changes, live GPS of all agents. */
export function adminSocket() {
  if (admin) return admin;
  admin = io('/admin', {
    auth: (cb) => cb({ token: session.get()?.accessToken }),
    extraHeaders: { 'ngrok-skip-browser-warning': 'true' },
    transports: ['websocket', 'polling'],
  });
  return admin;
}

export function closeSockets() {
  admin?.disconnect();
  admin = null;
}
