# Ortho Diamond — Product Specification

## §1 Business context
Ortho Diamond is an orthopaedic implant and instrument distributor in Indore. When a patient has a fracture or accident,
the treating doctor orders implants (screws, plates, nails, K-wires), drivers/instruments and complete operation kits
for that patient's surgery. The owner instantly gets a WhatsApp message with Order ID, item names, delivery address and
the doctor's contact number. Delivery to the hospital/OT is tracked live on a map (Zomato-style) with an e-commerce
status timeline (Amazon/Flipkart-style). ALL catalogue data, stock, prices and settings are managed from the Admin Panel.

## §2 Roles
SUPER_ADMIN (owner), STAFF (orders + stock), DELIVERY_AGENT, DOCTOR, HOSPITAL_PURCHASE.
- Doctor self-registration: full name, phone, email, specialisation, Medical Council registration no., state council,
  attached hospital(s), certificate photo. status PENDING -> APPROVED | REJECTED by admin.
- Prices and ordering are available only to APPROVED doctors and hospital buyers. Public visitors see catalogue without prices.
- HOSPITAL_PURCHASE users use the same web and Android ordering flows; every order they place must name the treating
  doctor (name + phone), because the owner message needs the doctor's contact.

## §3 Data model
- Category (tree, icon, image, sortOrder). Seed: Screws, Plates, Intramedullary Nails, K-Wires & Pins, External Fixators,
  Drivers & Instruments, Operation Kits, Arthroplasty, Spine, Consumables.
- Brand; Material (SS 316L, Titanium Ti-6Al-4V, ...).
- Product: name, slug, categoryId, brandId, description, images[], hsnCode, gstPercent, isSterile, tags[], isActive.
- ProductVariant: sku, productId, attributes JSON {diameterMm, lengthMm, holes, side L/R, angle, threadType},
  materialId, pricePaise, mrpPaise, lowStockThreshold, barcode, isActive.
- StockBatch: variantId, lotNo, qty, expiryDate (sterile items), receivedAt, supplier.
- Stock: availableQty(variant) = sum(batch qty, non-expired) - reservedQty. availableQty <= 0 => OUT_OF_STOCK.
- OperationKit: name, type SALE | LOAN, contents [{variantId, qty}], trayPhotos[], rentalChargePaise, physicalSets,
  sterilisationStatus. KitBooking: kitId, orderId, surgeryAt, dispatchedAt, expectedReturnAt, returnedAt,
  usedItems[], missingItems[].
- ProcedureTemplate (admin-defined): name (e.g. "Distal Radius ORIF"), kitId?, items [{variantId, qty}].
- Hospital: name, address, lat, lng, otContactName, otContactPhone, gstin, creditLimitPaise, paymentTermsDays.
- Doctor (userId, details, hospitals[]), DeliveryAgent (userId, vehicleNo, isOnDuty, lastLat, lastLng, lastSeenAt).
- Cart, CartItem.
- Order: orderNo "OD-YYMMDD-XXXX", doctorId, hospitalId, patient {name, age, gender, uhid, procedure, side, notes},
  surgeryAt, priority EMERGENCY | SCHEDULED, deliveryAddress + lat/lng + contact, items, kitBookings,
  subtotalPaise, gstPaise, totalPaise, paymentMode HOSPITAL_CREDIT | PAY_ON_DELIVERY | UPI_TEST, attachments[] (X-ray),
  assignedAgentId, status, idempotencyKey.
- OrderStatusHistory (orderId, from, to, actorId, reason, at). DeliveryLocation (agentId, orderId, lat, lng, speed, heading, at).
- DeliveryProof (orderId, receiverName, signatureUrl, photoUrl, at).
- StockAlert ("notify me"), Notification, OwnerContact (whatsapp numbers, enabled), Banner, AppSetting, AuditLog,
  AiConversation, AiMessage, AiPendingAction.

## §4 Order lifecycle & stock rules
State machine:
PLACED -> ACCEPTED | REJECTED(reason)
ACCEPTED -> PACKED -> DISPATCHED -> REACHED_HOSPITAL -> DELIVERED_TO_OT
DELIVERED_TO_OT -> CLOSED (no loan kit) | KIT_RETURN_PENDING -> KIT_RETURNED -> CLOSED
PLACED|ACCEPTED -> CANCELLED (doctor or admin, before PACKED)
Rules:
- Checkout re-validates every line in a DB transaction; any out-of-stock line returns error OUT_OF_STOCK with lineId and
  up to 3 alternatives (same product, nearest size, in stock).
- PLACED reserves qty; REJECTED/CANCELLED releases; DISPATCHED deducts from batches FEFO (earliest expiry first).
- Loan kit availability = physicalSets - overlapping bookings for the surgery date.
- Kit return: used items are billed automatically; missing items flagged to admin.
- Restock of a variant triggers StockAlert notifications.
- Invoice + delivery challan PDF generated on DISPATCHED (GST breakup, HSN).

## §5 Notifications
Owner (all enabled OwnerContact numbers) on every new order via WhatsApp template `od_new_order` (category UTILITY,
language en). Template body (line breaks are part of the template, parameters are single-line):
  "Ortho Diamond new order {{1}}, priority {{2}}\nDoctor: {{3}} | Phone: {{4}}\nHospital: {{5}}\nPatient: {{6}}\nSurgery: {{7}}\nItems: {{8}}\nDeliver to: {{9}}\nMap: {{10}}\nOpen: {{11}}\nPlease accept the order in the admin panel."
  {{2}} = "[EMERGENCY]" or "[SCHEDULED]"; {{8}} = "3.5mm LCP 8 hole Ti x1 ; 3.5mm Locking Screw 20mm x6 ; Distal Radius Kit (LOAN) x1"
  {{10}} = https://maps.google.com/?q=<lat>,<lng> ; {{11}} = PUBLIC_BASE_URL/admin/orders/<id>
Fallbacks: SMS (same text, items truncated), in-app admin notification with sound, console log in dev.
EMERGENCY orders: also FCM push to owner/staff devices and a flashing banner in admin until accepted.
Doctor gets WhatsApp/FCM/in-app on ACCEPTED, REJECTED, DISPATCHED (with tracking link), DELIVERED_TO_OT.

## §6 Live tracking
Agent app sends location every 5 s over Socket.IO /tracking. Server broadcasts to order:<id>, computes ETA with OSRM
(cached 30 s). Public read-only tracking link: PUBLIC_BASE_URL/track/<signed token>, expires 24 h after delivery.

## §7 API surface (OpenAPI in docs/openapi.yaml)
auth, doctors (register/approve/reject), hospitals, catalogue (categories, products, variants with filters diameter/
length/holes/material/brand/side/sterile + text search), kits (+availability), procedure-templates, cart, orders
(create, list, detail, cancel, transition, assign agent, proof, invoice), tracking, stock (batches, adjust, low-stock,
expiry), stock-alerts, agents, notifications, reports, settings, ai.

## §8 AI agent "Diamond AI" (Meta Llama via Ollama)
- Tools run with the caller's permissions. Write tools need confirmation: the server stores an AiPendingAction and the
  client shows Confirm/Cancel; only POST /api/ai/confirm/:id executes it.
- Doctor tools: search_catalog, check_availability, get_procedure_template, build_cart_from_template*, add_to_cart*,
  place_order*, track_order, cancel_order*, notify_when_in_stock. (* = needs confirmation)
- Admin tools: low_stock_report, expiring_batches, todays_orders_summary, pending_kit_returns, sales_report,
  adjust_stock*, assign_agent*.
- System prompt rules: answer only from tool results; never invent items, sizes, prices or stock; never give clinical
  advice; implant suggestions only from ProcedureTemplates; reply in the user's language (English/Hindi/Hinglish).
- Robustness: validate tool args with Zod; on invalid args return the error to the model once, then ask the user to
  clarify. Max 6 tool calls per turn. Stream tokens over Socket.IO event ai:token.

## §9 Admin Panel — "Diamond Control Room"
Theme: dark graphite #0E1116 bg, #161B22 surfaces, diamond-cyan #3DD6F5 accent, amber #F5A524 = EMERGENCY.
Fonts Inter + JetBrains Mono (SKUs/order numbers). Faceted diamond logo. Dense tables, keyboard shortcuts.
Pages: Login; Dashboard (today's orders, emergencies, revenue, low stock, kits on loan, mini live map); Orders
(Kanban by status + table, detail with patient, items, X-rays, timeline, assign agent, invoice/challan PDF); Live
Tracking (full map, all active deliveries); Catalogue (category tree, products, variant matrix generator diameter x length,
Excel/CSV import-export, images); Inventory (batches, expiry, adjustments with reason, low/out of stock); Operation
Kits (builder, booking calendar, return checklist); Procedure Templates; Doctors (approval queue with certificate
preview); Hospitals; Delivery Agents; Notifications (owner numbers, logs, failed retry); Reports (by doctor/hospital/
category, kit utilisation, Excel export); Settings; Staff & roles; Audit log; Diamond AI drawer on every page.
New order: sound + toast. Emergency: flashing amber until accepted.

## §10 Doctor Web App — "Surgical Precision"
Theme: off-white #F7FAFC, deep navy #0B2545, cyan #13C4E3, coral #FF6B4A only for EMERGENCY. Font Plus Jakarta Sans.
Subtle faceted patterns. Fully responsive.
Pages: Landing (public, no prices); OTP login; Doctor registration + pending screen; Home (Emergency OT Order button,
search, categories, recently ordered, kits available today, banners); Category with filters; Product with size-matrix
grid (out-of-stock cells greyed + "Out of Stock" + Notify me + similar sizes); Kits (contents, tray photos, LOAN/SALE,
availability calendar); Procedure templates -> prefilled cart; Checkout steps (patient -> surgery & priority ->
delivery address with map pin -> payment -> review); Order tracking (stepper with timestamps, live Leaflet map with
smoothly animated agent marker, route, ETA, call agent, share link); My Orders (filters, reorder, invoice, cancel
before PACKED); Notifications + web push; Profile; Diamond AI page + floating button (streaming, voice input via Web
Speech API, rich cards, Confirm card, "no clinical advice" note).

## §11 Android App — "Night OT"
Theme: deep navy #0A1A33, frosted cards, chamfered "diamond-cut" corner shape, ice-cyan #7FE7FF, coral #FF5A5F
emergency. Font Manrope. Min tap target 56dp. Emergency order in 3 taps. Faceted-diamond + bone app icon.
DOCTOR mode: login/registration (CameraX certificate), home with Emergency FAB, voice search, ML Kit barcode scan,
catalogue + filter bottom sheet, size chips with out-of-stock state, kits/templates, checkout (cart in Room, submit via
WorkManager with idempotency key), tracking (vertical timeline + osmdroid live map, call agent, share via WhatsApp
intent), orders, invoices, notifications (FCM), profile, Hindi/English, Diamond AI chat (mic input, confirm sheet),
Glance widget "Active orders".
DELIVERY_AGENT mode: duty toggle; assigned orders; full-screen alert for EMERGENCY; order detail with OT contact and
pickup checklist (items + kit tray); Picked up -> Start trip (DISPATCHED) -> Reached hospital -> Delivered with proof
(receiver name, signature pad, photo); kit collection flow (used/missing); foreground location service (type location)
every 5 s with offline buffer; navigate via Google Maps intent; today's summary.

## §12 Seed data
~60 products with variants: cortical/cancellous/locking/cannulated screws 2.7/3.5/4.5/6.5 mm in multiple lengths;
LCP, DCP, reconstruction, T and L plates; IM nails; K-wires; drivers, depth gauge, drill bits. 6 operation kits
(2 LOAN), 5 procedure templates, 3 Indore hospitals with coordinates, 2 approved doctors + 1 pending, 2 delivery
agents, 1 owner, 1 staff. At least 8 variants at zero stock and 3 batches expiring within 60 days.
