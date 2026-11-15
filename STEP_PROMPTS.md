# Ortho Diamond — Step prompts


Paste these in order. Each assumes `AGENTS.md`, `docs/SPEC.md` and `docs/PROGRESS.md` are already in the repo.

### Phase A — Backend

```text
STEP 0 — Scaffold & infrastructure
Read AGENTS.md fully. Create the folder layout, docker-compose.yml (postgres 16, redis 7, ollama), gateway/Caddyfile
exactly as described in AGENTS.md "Networking", backend/ with Express + TypeScript + Prisma wired to Postgres,
GET /api/health (db, redis, ollama status), pino logging, error handler, response envelope, Zod helper, Vitest setup.
Create empty admin/ (Vite React TS, base '/admin/') and web/ (Next.js) apps that each render "Hello".
Create scripts/dev.sh and scripts/dev.ps1 that start docker, backend, web, admin-build and ngrok.
Create .env.example with every variable. Do NOT build features.
Done when: `docker compose up -d` works; /api/health returns ok on localhost:8080 and on the ngrok URL;
/admin and / both load through ngrok; PROGRESS.md updated.
```

```text
STEP 1 — Database schema, auth, users, seed
Read AGENTS.md, PROGRESS.md and SPEC.md §2, §3, §12.
Write the complete Prisma schema for §3 (all models, enums, indexes, relations). Run migrations.
Implement auth module: POST /api/auth/otp/request, /otp/verify, /refresh, /logout; JWT + rotating refresh tokens;
requireAuth and requireRole middleware. Doctor registration with certificate upload (private upload), admin
approve/reject endpoints. AuditLog helper.
Write prisma/seed.ts with the full §12 seed data (realistic names, sizes, Indore coordinates).
Done when: migrations apply cleanly; seed runs; an OTP login works via curl for owner, doctor and agent; pending doctor
gets 403 on approved-only routes (price hiding is tested in Step 2); unit tests for token rotation and RBAC pass.
```

```text
STEP 2 — Catalogue, inventory, kits, templates API
Read SPEC.md §3, §4 (stock rules), §7.
Implement modules: categories (tree), brands, materials, products, variants (filters: diameter, length, holes, material,
brand, side, sterile; text search with Postgres trigram), stock batches (FEFO, expiry), stock availability calculation,
stock adjustments with reason (audited), low-stock and expiry reports, operation kits + availability for a date,
procedure templates, banners, image upload with sharp resize. Price fields hidden unless caller is approved.
Add Excel/CSV import-export for products+variants (exceljs).
Done when: all endpoints in openapi.yaml; out-of-stock variants return stockStatus OUT_OF_STOCK; kit availability
respects overlapping bookings; tests for FEFO and availability pass.
```

```text
STEP 3 — Cart, checkout, orders & state machine
Read SPEC.md §3, §4, §7.
Implement cart, checkout (transaction, re-validation, OUT_OF_STOCK error with up to 3 alternatives, idempotency key),
order number generator, order state machine service with allowed transitions and actor roles, stock reserve/release/
deduct-FEFO, kit bookings and kit return (auto-bill used items, flag missing), cancel rules, assign agent, delivery proof
upload, invoice + challan PDF (pdfkit) with GST/HSN, order list/detail filters for doctor and admin.
Done when: tests cover every allowed and forbidden transition, double-submit with same idempotency key creates one
order, concurrent checkout for the last unit lets only one succeed, invoice PDF opens correctly.
```

```text
STEP 4 — Notifications & realtime
Read SPEC.md §5 and AGENTS.md "WhatsApp rules" and "Realtime".
Implement NotificationService with adapters: WhatsAppCloudAdapter (template od_new_order, parameters sanitised to
single line, items joined with " ; " and truncated), SmsAdapter (interface + console dev adapter), FcmAdapter
(firebase-admin), InAppAdapter. Queue all sends on BullMQ with retries; failed jobs listed via API.
Socket.IO server with JWT auth, namespaces /orders /admin, rooms; emit order:status on every transition and
admin:new_order on creation. Write docs/whatsapp-template.md with the exact template text to submit in Meta Business Manager.
Done when: placing an order logs/sends the owner message with correct Order ID, items, address, doctor phone, map link;
a socket client receives status events; a forced WhatsApp failure falls back to SMS/console and shows in failed list.
```

```text
STEP 5 — Live tracking backend
Read SPEC.md §6.
Implement /tracking namespace: agent sends {orderId, lat, lng, speed, heading}; validate agent is assigned; broadcast to
order:<id>; throttle DB writes to 15 s; ETA via OSRM_URL with 30 s cache; GET /api/orders/:id/tracking (last location,
route polyline, ETA). Signed public tracking token endpoint. Write scripts/simulate-agent.ts that drives an agent along
a real OSRM route between two Indore points for a given orderId.
Done when: running the simulator moves the location for a DISPATCHED order and a test socket client receives updates
and ETA every 5 s.
```

### Phase B — Admin Panel

```text
STEP 6 — Admin Panel part 1: shell, auth, dashboard, catalogue, inventory
Read SPEC.md §9 and AGENTS.md "UI rules". Build admin/ with the "Diamond Control Room" theme as Tailwind tokens +
shadcn theme. Layout with sidebar, top bar, command palette (Ctrl+K). OTP login. Dashboard. Catalogue (category tree,
product list/edit, variant matrix generator, image upload, Excel import/export). Inventory (batches, expiry, adjustments,
low/out of stock). Operation Kits and Procedure Templates screens. Use TanStack Query against the real API.
Done when: owner can create a product with 12 variants via the matrix generator, set one to 0 stock and see it flagged.
```

```text
STEP 7 — Admin Panel part 2: orders, live map, people, notifications, reports
Read SPEC.md §9. Build Orders Kanban (drag = transition via API, invalid moves rejected with message) + table + detail
(patient, items, X-rays via signed URLs, timeline, assign agent, PDFs). Live Tracking page with Leaflet showing all active
deliveries in realtime. Doctors approval queue, Hospitals, Agents, Notifications (owner numbers, logs, retry), Reports
with charts and Excel export, Settings, Staff, Audit log. New-order sound + toast; emergency flashing banner.
Done when: an order placed via curl appears instantly with sound; moving it through all states works; simulator
movement shows on the live map.
```

### Phase C — Doctor Web App

```text
STEP 8 — Web part 1: theme, auth, home, catalogue, kits
Read SPEC.md §10. Build web/ with the "Surgical Precision" theme. Landing (public, no prices), OTP login, doctor
registration with certificate upload and pending screen, Home, Category with filters, Product page with size-matrix grid
(out-of-stock cells disabled + Notify me + similar sizes), Kits with availability calendar, Procedure templates.
next-intl English/Hindi. Responsive down to 360px.
Done when: approved doctor can browse and filter; out-of-stock sizes cannot be added; pending doctor sees no prices.
```

```text
STEP 9 — Web part 2: cart, checkout, tracking, orders
Read SPEC.md §4, §6, §10. Cart (Zustand + server cart sync), multi-step checkout (patient, surgery & priority, address
with Leaflet pin picker + Nominatim search (debounced, max 1 request/second as Nominatim's policy requires), payment incl. Razorpay test mode, review), stock error handling with
alternatives, order tracking page (stepper + live map with smooth marker animation, ETA, call agent, share link), public
/track/<token> page, My Orders, invoice download, cancel, notifications centre with web push.
Done when: full flow works through ngrok: order -> owner message -> admin accepts -> simulator moves -> doctor sees
live marker and every status change without refresh.
```

### Phase D — Android

```text
STEP 10 — Android part 1: project, theme, networking, auth, catalogue
Read SPEC.md §11 and AGENTS.md Android stack. Create android/ (single app, package com.orthodiamond.app). "Night OT"
Material 3 theme with custom chamfered Shape, Manrope font, app icon + animated splash. Hilt modules, Retrofit with
ngrok header + auth interceptors and token-refresh Authenticator, Room cache, DataStore session. osmdroid: set Configuration.getInstance().userAgentValue = BuildConfig.APPLICATION_ID before any map loads (OSM blocks tile requests without it). Role-based navigation
(DOCTOR vs DELIVERY_AGENT graph). Doctor: login, registration with CameraX certificate, pending screen, home, search
(voice), barcode scan, catalogue, product with size chips and out-of-stock state, kits, templates, cart.
Done when: APK installs on a real phone, logs in through the ngrok URL, browses catalogue, cart survives app restart.
```

```text
STEP 11 — Android part 2: checkout, tracking, push, orders
Read SPEC.md §4, §6, §11. Checkout flow (patient, surgery, priority, address with osmdroid pin, payment, review),
submit via WorkManager with idempotency key, stock error UI. Tracking screen: vertical timeline + osmdroid live map with
animated marker, ETA, call agent, share link. Socket.IO with ngrok extraHeaders. FCM (google-services.json from a free
Firebase project) with deep links to the order. My Orders, invoice PDF open, notifications, profile, Hindi/English, Glance widget.
Done when: order placed from phone reaches owner; status changes from admin appear live and as push when app is in background.
```

```text
STEP 12 — Android part 3: delivery agent mode
Read SPEC.md §11 DELIVERY_AGENT. Duty toggle, assigned orders, full-screen emergency alert, order detail with pickup
checklist, status actions, delivery proof (signature pad Canvas + CameraX photo + receiver name), kit collection flow,
foreground service (foregroundServiceType=location) with FusedLocationProvider every 5 s, offline buffer in Room,
correct permission flow for Android 10-16 (fine, background, notifications; FOREGROUND_SERVICE_LOCATION on 14+), navigate intent, day summary.
Done when: with two phones, agent starts trip and the doctor phone shows the marker moving live; service survives screen
off for 10 minutes; proof appears in admin order detail.
```

### Phase E — AI agent and hardening

```text
STEP 13 — Diamond AI (Meta Llama agent) on all three surfaces
Read SPEC.md §8. Backend: provider interface (OllamaProvider using /api/chat with tools; MetaLlamaApiProvider stub
behind AI_PROVIDER env), agent loop (max 6 tool calls), tool registry with Zod schemas and role checks, AiPendingAction
confirm flow, conversation storage, token streaming over Socket.IO, audit logging. Implement every doctor and admin tool
from §8 by calling existing services (no duplicate business logic). Write an eval script scripts/ai-eval.ts with 25 test
prompts in English/Hindi/Hinglish and expected tool calls; print pass rate.
UI: admin drawer, web floating button + page, Android chat screen; rich cards; Confirm/Cancel; mic input.
Done when: "3.5 titanium locking plate 8 hole aur 6 screw 20mm, City Hospital, kal 10 baje" builds a correct cart and
asks to confirm; asking a clinical question gets a refusal; eval pass rate is reported (target 80%+).
```

```text
STEP 14 — Hardening & handover
Add Playwright e2e for web (login -> out-of-stock blocked -> checkout -> live status) and admin (accept -> dispatch).
Security pass: rate limits on OTP, helmet, CORS, signed URLs for private uploads, input size limits, RBAC tests on every
admin route. Performance: DB indexes for search and order lists. Write README.md (setup from zero, dev.sh, ngrok,
WhatsApp template submission, Firebase setup, Android BASE_URL, demo script) and docs/architecture.md with a diagram.
Done when: fresh clone -> README steps -> full demo works on a different laptop.
```


