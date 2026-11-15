# AGENTS.md — rules for every AI coding session in this repo

PRODUCT: ORTHO_DIAMOND
Product spec: docs/SPEC.md (source of truth). Progress log: docs/PROGRESS.md.

## Working rules
1. Before coding, read this file, docs/SPEC.md sections named in the task, and docs/PROGRESS.md.
2. Do ONLY the current step. Do not start future steps. If the step needs something that does not exist yet, create the minimum stub and note it in PROGRESS.md.
3. Never hard-code catalogue data, prices, stock or phone numbers in UI code. All business data comes from the API / database (seed script is the only place for sample data).
4. No fake implementations left behind: no TODO stubs returning mock data in finished steps. If something truly cannot be done locally (e.g. a paid API key is missing), implement it behind an interface with a clearly logged dev fallback.
5. After every step: run lint, type-check and tests; fix failures; then append to docs/PROGRESS.md: date, step number, what was built, how to run/test it, known issues.
6. Libraries named in this file, docs/SPEC.md or the current step prompt are pre-approved. Ask before adding any other dependency.
7. Keep secrets only in .env (never commit). Keep .env.example complete and documented.

## Stack (pin exact versions in package.json / gradle once installed)
- backend/: Node.js 22 LTS, TypeScript (strict), Express 4, Prisma ORM, PostgreSQL 16, Redis 7, BullMQ, Socket.IO 4, Zod, pino, Vitest + Supertest.
- admin/: React 19 + Vite + TypeScript + TailwindCSS + shadcn/ui + TanStack Query + React Router. Vite `base: '/admin/'`.
- web/: Next.js (current stable, App Router) + TypeScript + TailwindCSS + TanStack Query + Zustand + React Hook Form + Zod + next-intl.
- android/: Kotlin 2.x, Jetpack Compose + Material 3, Hilt, Retrofit + OkHttp + kotlinx.serialization, Room, DataStore, Coil, Socket.IO Java client, WorkManager, Firebase Cloud Messaging, osmdroid. minSdk 24, compileSdk/targetSdk 36, JDK 17.
- ai/: lives inside backend/src/ai. Provider = Ollama (model `llama3.1:8b`, Meta Llama) by default, switchable via AI_PROVIDER env.
- Maps: OpenStreetMap tiles + Leaflet (web/admin) + osmdroid (Android). Routing/ETA via OSRM (public demo server in dev only; OSRM_URL env so it can be self-hosted).
- Infra: docker-compose (postgres, redis, ollama), Caddy gateway, ngrok.

## Folder layout
backend/ admin/ web/ android/ gateway/Caddyfile scripts/ docs/ docker-compose.yml .env.example
backend/src/modules/<module>/{routes,controller,service,repository,schema,tests}.ts

## Networking: ONE public URL through a gateway
- Caddy on :8080 routes: /api/* and /socket.io/* and /uploads/* -> backend :4000 ; /admin/* -> admin build (admin/dist) ; /* -> web :3000.
- Caddy runs in docker while backend and web run on the host: upstreams are host.docker.internal:4000 and host.docker.internal:3000, and docker-compose adds extra_hosts "host.docker.internal:host-gateway" (required on Linux). Mount admin/dist read-only into the Caddy container. Redirect /admin to /admin/.
- Expose with: ngrok http --url=$NGROK_DOMAIN 8080. PUBLIC_BASE_URL = https://$NGROK_DOMAIN.
- Day-to-day development: run admin with Vite on localhost:5173 (proxy /api to localhost:4000). Hot-reload over ngrok is unreliable; use the built admin only through ngrok.
- Every client sends header `ngrok-skip-browser-warning: true` on HTTP calls AND on Socket.IO (use `extraHeaders` in the web client; OkHttp interceptor + Socket.IO `extraHeaders` option on Android).
- Browsers opening the web app via ngrok free plan see ngrok's one-time warning page; that is expected in dev.
- CORS: allow PUBLIC_BASE_URL, http://localhost:3000, http://localhost:5173.
- Dev servers must accept the ngrok host or they block requests: next.config `allowedDevOrigins: [NGROK_DOMAIN]`; Vite `server.allowedHosts: [NGROK_DOMAIN]`.
- Android reads BASE_URL from local.properties -> BuildConfig. Never hard-code the URL.

## Backend conventions
- Layers: routes -> controller -> service -> repository. Business rules only in services.
- Zod validation on every request body/query/param. Response envelope: { success, data, error?: { code, message }, meta? }.
- Money stored as integer paise. Dates stored UTC, displayed Asia/Kolkata.
- Auth: phone OTP (dev: print OTP in server log; prod: SmsProvider interface) -> JWT access 15 min + rotating refresh 30 days (stored hashed). RBAC middleware `requireRole(...)`.
- State changes of orders only through the order state machine service. Every transition writes OrderStatusHistory and emits a Socket.IO event.
- Use database transactions for checkout and stock changes. Use idempotency keys on order creation.
- AuditLog for every admin write and every AI tool call.
- Uploads: multer -> /uploads/private/* served only via signed, expiring URLs; product images in /uploads/public/*.
- Background jobs (notifications, reminders, expiry checks) on BullMQ; 3 retries with backoff; failures visible in admin.
- Postgres extensions (pg_trgm) are enabled inside a migration: CREATE EXTENSION IF NOT EXISTS pg_trgm.

## WhatsApp (Meta WhatsApp Cloud API) rules
- Business-initiated messages must use a pre-approved TEMPLATE. Line breaks go in the template body text; template PARAMETER values must be single-line: no newlines, no tabs, no more than 4 consecutive spaces. The body must not start or end with a parameter, two parameters must not sit directly next to each other, and there must be enough fixed words around the parameters, otherwise Meta rejects the template.
- Join item lists with " ; " and truncate to keep the full body under 1024 characters ("... +3 more").
- Test phone number can only message up to 5 verified recipients. Keep an SMS + in-app + console fallback.

## Realtime
- Socket.IO namespaces: /orders, /tracking, /admin. JWT auth on connect. Rooms: order:<id>, user:<id>, admin.
- Delivery agent sends GPS every 5 s; server broadcasts immediately, writes to DB at most every 15 s per agent.

## UI rules
- Each surface has its own visual identity defined in docs/SPEC.md. Do not reuse another surface's theme.
- Every list has loading skeleton, empty state and error state with retry. Forms show field-level errors.
- Support English and Hindi strings from day one (no inline text literals in components).

## Definition of done for any step
Builds with zero type errors, lint clean, tests pass, feature verified manually through http://localhost and through the ngrok URL, PROGRESS.md updated.
