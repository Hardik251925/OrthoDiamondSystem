import type { RequestHandler } from 'express';
import { env } from '../config/env';

const allowed = new Set(
  [
    env.PUBLIC_BASE_URL,
    'http://localhost:3100',
    'http://localhost:5180',
    'http://localhost:8100',
    env.NGROK_DOMAIN ? `https://${env.NGROK_DOMAIN}` : '',
    ...env.CORS_EXTRA_ORIGINS.split(','),
  ]
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
);

// In development also allow private LAN addresses (phones/laptops on the same Wi-Fi).
const lanOrigin = /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

export const isAllowedOrigin = (origin: string) =>
  allowed.has(origin) || (env.NODE_ENV !== 'production' && lanOrigin.test(origin));

export const cors: RequestHandler = (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Idempotency-Key, ngrok-skip-browser-warning');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
};
