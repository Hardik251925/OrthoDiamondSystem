// Local gateway (no Docker needed) — same routing as gateway/Caddyfile:
//   /api/*, /socket.io/*, /uploads/*  -> backend  (127.0.0.1:4100)
//   /admin -> /admin/ ; /admin/*      -> FE/admin/dist (SPA fallback to index.html)
//   /*                                -> doctor web (127.0.0.1:3100)
// Listens on 0.0.0.0:8100 so phones on the same Wi-Fi can open http://<PC-IP>:8100
// Usage: node scripts/gateway.mjs   (env: GATEWAY_PORT, BACKEND_PORT, WEB_PORT)
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.GATEWAY_PORT ?? 8100);
const BACKEND = { host: '127.0.0.1', port: Number(process.env.BACKEND_PORT ?? 4100) };
const WEB = { host: '127.0.0.1', port: Number(process.env.WEB_PORT ?? 3100) };
const ADMIN_DIST = path.join(root, 'FE', 'admin', 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.map': 'application/json',
};

const isBackend = (url) => /^\/(api|socket\.io|uploads)(\/|$|\?)/.test(url);

function upstreamFor(url) {
  return isBackend(url) ? BACKEND : WEB;
}

function forwardedHeaders(req) {
  const ip = req.socket.remoteAddress ?? '';
  return {
    ...req.headers,
    'x-forwarded-for': req.headers['x-forwarded-for'] ? `${req.headers['x-forwarded-for']}, ${ip}` : ip,
    'x-forwarded-proto': 'http',
    'x-forwarded-host': req.headers.host ?? '',
  };
}

function proxy(req, res, target) {
  const upstream = http.request(
    { ...target, method: req.method, path: req.url, headers: forwardedHeaders(req) },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (res.headersSent) return res.destroy();
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        success: false,
        data: null,
        error: { code: 'UPSTREAM_DOWN', message: `Service on port ${target.port} is not running` },
      }),
    );
  });
  req.pipe(upstream);
}

function serveAdmin(req, res) {
  const urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/admin') {
    res.writeHead(301, { location: '/admin/' });
    return res.end();
  }
  const rel = urlPath.replace(/^\/admin\/?/, '');
  let file = path.join(ADMIN_DIST, rel);
  if (!file.startsWith(ADMIN_DIST)) {
    res.writeHead(400);
    return res.end('Bad path');
  }
  if (!rel || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(ADMIN_DIST, 'index.html');
  if (!fs.existsSync(file)) {
    res.writeHead(503, { 'content-type': 'text/plain' });
    return res.end('Admin not built yet. Run: cd FE\\admin && npm run build');
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': rel.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const url = req.url ?? '/';
  if (url === '/admin' || url.startsWith('/admin/') || url.startsWith('/admin?')) return serveAdmin(req, res);
  proxy(req, res, upstreamFor(url));
});

// WebSocket upgrades (Socket.IO -> backend, Next.js HMR -> web)
server.on('upgrade', (req, socket, head) => {
  const target = upstreamFor(req.url ?? '/');
  const up = net.connect(target.port, target.host, () => {
    const headers = Object.entries(forwardedHeaders(req))
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('\r\n');
    up.write(`${req.method} ${req.url} HTTP/1.1\r\n${headers}\r\n\r\n`);
    if (head?.length) up.write(head);
    up.pipe(socket);
    socket.pipe(up);
  });
  up.on('error', () => socket.destroy());
  socket.on('error', () => up.destroy());
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log(`Ortho Diamond gateway on :${PORT}`);
  console.log(`  This PC:      http://localhost:${PORT}   admin: http://localhost:${PORT}/admin/`);
  for (const ip of ips) console.log(`  Same Wi-Fi:   http://${ip}:${PORT}   admin: http://${ip}:${PORT}/admin/`);
});
