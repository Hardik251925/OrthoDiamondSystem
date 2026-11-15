# Ortho Diamond — Progress log

(The AI agent appends an entry here after every step.)

## 2026-11-15 — Step 0 (scaffold & infrastructure) + Step 1 (schema, auth, users, seed)

### Folder layout (owner's choice, differs from AGENTS.md names)
| AGENTS.md | This repo |
| --- | --- |
| backend/ | `BE/` |
| admin/ | `FE/admin/` |
| web/ | `FE/web/` |
| android/ | `Android App/` (empty until Step 10) |
| gateway/, scripts/, docs/, docker-compose.yml | same, at repo root |

### Ports (changed from AGENTS.md so it runs next to the Medical-Store project, which uses 4000)
backend **4100**, web **3100**, gateway **8100**, admin Vite dev **5180**.

### Built
- **BE** (Express 4 + TS strict + Prisma 6 + PostgreSQL): env validation (Zod), pino logging, response envelope
  `{ success, data, error?, meta? }`, error handler, Zod `validate()` helper, CORS (PUBLIC_BASE_URL, localhost, ngrok,
  LAN IPs in dev), `GET /api/health` (db / redis / ollama).
- **Prisma schema** for every SPEC §3 model + enums + indexes. First migration enables `pg_trgm` and adds a trigram
  index on product names and a GIN index on variant attributes. Extra models: OtpCode, RefreshToken, DeviceToken,
  StockAdjustment, OrderItem.
- **Auth**: `POST /api/auth/otp/request`, `/otp/verify`, `/refresh`, `/logout`, `GET /api/auth/me`.
  OTP is 6 digits, stored hashed, 5 min, max 5 tries, max 5 requests / 15 min. JWT access 15 min; refresh tokens
  are random, stored as peppered hashes, rotated on every refresh, grouped in families. Reusing a rotated token
  revokes the whole family. `requireAuth`, `requireRole(...)`, `requireApproved` middleware.
  Dev: OTP printed in the backend log and returned as `devOtp` when `OTP_DEV_ECHO=true` (forced off in production).
  SMS goes through the `SmsProvider` interface (console adapter for now).
- **Doctors**: unknown phone + verified OTP gives a `registrationToken`. `POST /api/doctors/register` (multipart,
  `certificate` file saved to uploads/private) creates a PENDING doctor. Admin: `GET /api/doctors`, `GET /api/doctors/:id`
  (signed certificate URL), `POST /api/doctors/:id/approve`, `/reject {reason}` (SUPER_ADMIN only, audited).
- **Hospitals**: `GET /api/hospitals/directory` (public, for the registration form). `GET /api/hospitals` is
  approved-only: doctors see their own hospitals, buyers see their hospital, admin sees all.
- **Uploads**: `/uploads/public/*` static; `/uploads/private/*` only with a valid HMAC signature and expiry.
- **AuditLog** helper (`lib/audit.ts`), used for doctor register / approve / reject.
- **Seed** (`npm run db:seed`): 10 categories, 4 brands, 4 materials, 62 products, 678 variants, 863 batches,
  11 zero-stock variants, 3 batches expiring within 60 days, 6 kits (2 LOAN), 5 procedure templates,
  3 Indore hospitals, owner, staff, 2 approved doctors + 1 pending, 2 agents, 1 hospital buyer, owner WhatsApp contact.
- **FE/admin**: Vite + React 19 + TS, `base: '/admin/'`, "Hello" page showing API health. **FE/web**: Next.js 16 "Hello".
- **Gateway**: `gateway/Caddyfile` + `docker-compose.yml` as AGENTS.md describes, for when Docker is installed.
  There is no Docker on this PC, so `scripts/gateway.mjs` is a dependency-free Node gateway with the same routing
  (HTTP + WebSocket), listening on 0.0.0.0:8100.
- **Scripts**: `scripts/start-local.cmd` (3 cmd windows), `scripts/dev.ps1 [-Ngrok]`, `scripts/dev.sh [--ngrok]`.

### How to run / test
```
scripts\start-local.cmd
```
Or by hand, in 3 cmd windows: `cd BE && npm run dev` · `cd FE\web && npm run dev -- -p 3100` ·
`cd FE\admin && npm run build && cd ..\.. && node scripts\gateway.mjs`.
Open `http://<PC-WiFi-IP>:8100/` (web), `/admin/` (admin) and `/api/health`.
Seed phones: owner 9000000001, staff 9000000002, Dr Verma 9000000011 / Dr Joshi 9000000012 (approved),
Dr Choudhary 9000000013 (pending), agents 9000000021/22, hospital buyer 9000000031.

Checks: `cd BE && npm run typecheck && npm run lint && npm test` (23 tests; they use the separate `ortho_diamond_test` DB).

### Verified
- Migrations apply cleanly. Seed runs and can be re-run.
- Typecheck, lint and 23/23 Vitest tests pass (OTP, single-use OTP, lockout, token rotation, reuse detection,
  concurrent refresh, logout, RBAC unit + route tests, pending doctor 403, live approval, registration with upload,
  signed URL tamper → 403). Admin and web build and lint clean.
- Through the gateway on the Wi-Fi IP: health ok; admin loads; OTP login works for owner, doctor, agent and buyer;
  pending doctor and agent get 403 NOT_APPROVED on `/api/hospitals`; approved doctor gets 200.

### Known issues / deviations
- No Docker, Caddy, Ollama or ngrok used yet (owner asked for local + same Wi-Fi only). Health shows `degraded`
  while Ollama is not installed. Redis answered on localhost:6379, though it is not part of this repo.
- Node 24 is installed (spec says 22 LTS); everything works on 24. PostgreSQL 17 native (spec says 16).
- Extra dev tooling added (not named in AGENTS.md): tsx, eslint + typescript-eslint, pino-pretty, ioredis (Redis
  client used by BullMQ, used directly for the health check), jsonwebtoken, @types/*.
- Prisma warns that `package.json#prisma` (seed config) is deprecated in Prisma 7. Harmless on Prisma 6.
- Seed prices / GST / HSN are illustrative. Owner WhatsApp number in the seed is a placeholder (+919000000001).
- Windows Firewall may block port 8100 from other devices until an inbound rule is added.

## 2026-11-15 — Steps 2–9 (backend features, Admin Panel, Doctor Web) with live demo data

Owner asked for a complete working system with realistic dummy data in one go, so Steps 2–9 were built together.

### Backend
- Catalogue (`/api/catalog/*`): categories, brands, materials, products (search by words/tags/SKU), product
  detail with variants + stockStatus, variant search by attributes/barcode, banners. Prices only for approved users.
- Stock (`/api/stock/*`): overview (all/low/out), batches, receive batch (restock triggers "notify me"), adjust with
  reason (audited), expiring report, adjustment log. FEFO deduction on dispatch (`lib/stock.ts`).
- Kits & templates: loan availability = physicalSets − overlapping open bookings (`lib/kits.ts`), sale kit
  availability from contents, 14-day calendar, procedure templates → cart.
- Cart & checkout: one transaction, `SELECT … FOR UPDATE` on variant rows, OUT_OF_STOCK with up to 3 nearest-size
  alternatives, Idempotency-Key, order number OD-YYMMDD-XXXX (IST date).
- Order state machine (`orders/stateMachine.ts` + `service.transition`), the only way status changes; writes history,
  audit, emits Socket.IO; reserve/release/deduct. Assign agent, delivery proof (signature + photo), loan kit return
  (used items billed, missing items flagged), invoice + challan PDF (pdfkit, GST by HSN, CGST/SGST).
- Notifications: owner `od_new_order` WhatsApp template (params single-line, items " ; " joined, ≤1024 chars) via
  Cloud API when configured → fallback SMS/console → in-app; 3 retries with backoff; log + retry API.
  docs/whatsapp-template.md not written yet.
- Realtime: Socket.IO `/orders`, `/admin`, `/tracking` with JWT; public tracking token can join one order room.
- Tracking: agent GPS broadcast immediately, DB write ≤ every 15 s, OSRM ETA cached 30 s (straight-line fallback),
  `GET /api/orders/:id/tracking`, signed public link `/track/<token>` (expires 24 h after delivery).
- `DEMO_SIMULATOR=true` (dev only, set in BE/.env): agents of DISPATCHED orders drive the OSRM route in a 12-minute
  loop when no real GPS arrives. Real GPS from the Android app always wins.
- Admin APIs: dashboard, agents, hospitals CRUD, owner numbers, notification log/retry, users/staff, settings,
  audit, sales reports; product create with **variant matrix generator**, variant edit, catalogue CSV export.
- Demo seed (`prisma/seed-demo.ts`): 30 days of history (~64 orders), today's 8 orders in every status (2 on the
  road, 1 loan kit awaiting return, emergencies waiting), notification log, a doctor cart, banners, SVG catalogue art.

### Admin Panel (FE/admin, "Diamond Control Room")
Login (OTP), Dashboard (KPIs, live map, 7-day chart, recent orders), Orders Kanban (drag = transition; invalid moves
refused with message) + table + detail (assign agent, transitions, reject/cancel reasons, proof with signature pad,
kit return checklist, invoice/challan PDF, live map), Live Tracking, Catalogue (+ matrix generator, CSV export,
variant price edit), Inventory (stock levels, batches, receive, adjust, expiry, log), Kits (calendar), Templates,
Doctors approval with signed certificate preview, Hospitals, Agents, Notifications, Reports (CSV), Staff & roles,
Settings, Audit log. New order → sound + toast; EMERGENCY → flashing amber banner; Ctrl+K palette; EN/HI toggle.

### Doctor Web (FE/web, "Surgical Precision")
Landing (no prices), OTP login, registration with certificate upload → pending screen (auto-refresh), Home
(Emergency OT Order, banners, recent orders, categories, kits), search, category filters, product **size-matrix
grid** (out-of-stock greyed, Notify me, similar sizes), kits with 14-day calendar, procedure templates → prefilled
cart, cart, 5-step checkout (patient → surgery & priority → Leaflet pin + Nominatim search ≤1 req/s → payment →
review) with out-of-stock alternatives, My Orders (filters, reorder, invoice, cancel), live tracking (stepper, map
with smoothly animated marker, route, ETA, call agent, share link), public tracking page, notifications, profile.

### Verified
- BE: typecheck + lint clean, **33/33 tests** (state machine allowed/forbidden moves, roles, FEFO, reserve/release,
  idempotent double submit, concurrent last-unit checkout → one 201 + one 409 with alternatives, loan kit overlap,
  invoice PDF, price hiding, plus the Step 1 tests).
- API flow over Wi-Fi IP (19 checks) and **real headless Edge browser test (28 checks, 0 JS errors)**: doctor logs
  in → OOS size shows Notify me + similar sizes → template → cart → checkout → order placed → admin sees it on
  Kanban with flashing emergency → accept → pack → assign → dispatch → doctor sees "On the way" + moving marker;
  all 13 other admin pages load.
- Bugs found and fixed by the browser test: CARTO dark tiles now need an API key (switched to OSM + CSS dark
  filter); Leaflet `_leaflet_pos` error when leaving a page mid-animation.

### Known issues / not done yet
- Android app (Steps 10–12) and Diamond AI (Step 13), Playwright suite in repo + README (Step 14) not built.
- WhatsApp/FCM/Razorpay keys not configured → WhatsApp shows FAILED then SMS/console fallback SENT (by design);
  UPI is "test mode (simulated)". BullMQ not wired: retries run in-process (Redis queue is the next step).
- Hindi uses a small dictionary provider, not next-intl yet; many inner labels are still English only.
- Cart judges loan-kit availability for today; checkout re-checks for the actual surgery date.
- OTP limit is 5 per number per 15 min; during heavy testing clear `"OtpCode"` in the dev DB.

## 2026-11-15 — Bootstrap, founder section, GitHub Pages
- Bootstrap 5.3.9 in FE/web. CSS layer order: Tailwind base < `bootstrap` < components < Tailwind utilities
  (`scripts/vendor-bootstrap.mjs` strips `@charset` so it can live in a layer). Bootstrap JS loaded client-side.
  Used for: landing carousel, founder card (grid), FAQ accordion, footer grid, home banner carousel.
- Founder section (landing + new `/about`): Rakesh Maradiya, Founder & Owner. Photo cropped from the owner's
  Instagram screenshot to show only him (`public/owner/rakesh-maradiya.jpg`); replace with a proper portrait later.
- Static export for GitHub Pages: dynamic routes became query pages — `/product?slug=`, `/category?slug=`,
  `/kit?slug=`, `/order?id=`, `/track?t=`. `NEXT_PUBLIC_API_BASE` (backend URL) and `NEXT_PUBLIC_BASE_PATH`.
  `scripts/flatten-rsc.mjs` fixes Next 16 prefetch file names for static hosts. Workflow `.github/workflows/pages.yml`
  deploys FE/web on every push to main. Backend: `PUBLIC_WEB_URL` for tracking links, CORS allows the Pages origin.
- Verified: Pages-style build served under `/OrthoDiamondSystem/` → 16 checks (photo, Bootstrap carousel/accordion/
  buttons, routing, live API data, 0 JS errors); responsive 11 pages × 360/768/1366 px, no horizontal scroll;
  full local flow 28/28 again; BE 33/33.
- Public site needs a public backend: set repo variable `API_BASE` (e.g. ngrok static domain or a VPS URL) and
  re-run the workflow. Until then the public site shows company info and "server not reachable" for live data.
