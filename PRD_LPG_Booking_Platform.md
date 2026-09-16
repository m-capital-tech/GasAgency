# PRD — LPG Cylinder Booking Marketplace (Investor Prototype)

**Working name:** GasSetu (placeholder — replace with final brand)
**Owner:** Pranav Aditya
**Version:** 1.0 (Prototype) · **Date:** 16 Sep 2026
**Audience:** Claude Code (builder) and the investor demo team

---

## 0. Instructions for Claude Code (read first)

1. Build a **clickable, mock-data prototype** for an investor demo. No real backend, no real payments, no real SMS/OTP.
2. Make it a **monorepo** with three front-ends and one shared mock API (see §9).
3. All data comes from **seeded mock data** (§8). The shared mock API holds data in memory, so a booking made in the mobile app shows up live in the Agency web panel. State resets when the server restarts. Add a "Reset demo" button.
4. Put **payments (Razorpay)**, **maps/tracking**, **OTP** and **notifications** behind interfaces (`PaymentProvider`, `LocationProvider`, `AuthProvider`, `NotificationProvider`). Ship a `Mock*` version of each so real ones can be swapped in later without touching the UI.
5. Aim for polish over breadth. Every screen in §6 must be reachable and look production-quality. Nothing should dead-end.
6. Follow the build order in §12 and check the acceptance criteria in §13 before calling a phase done.

---

## 1. Summary

A two-sided platform for booking LPG cylinders:

- **B2B — Gas agencies (distributors)** of any oil company (HP Gas, Indane, Bharat Gas) register, set their service area, prices and delivery staff, and manage all incoming bookings from a web panel (an order management system, called "LMS" internally).
- **B2C — Customers** (homes and small businesses) sign up in a mobile app. The app automatically assigns them their nearest agency. They book cylinders, pay online (Razorpay) or on delivery, track the delivery live, and get refill reminders.
- **Delivery staff** use a simple mode in the mobile app to accept assigned drops, share their live location, and confirm delivery with the customer's OTP.
- **Platform admin** approves agencies and watches business numbers (GMV, orders, commission).

**Reference app:** HP PAY (HPCL, 1 crore+ downloads) offers LPG booking inside a crowded fuel/payments super-app, and its reviews often mention failed gas bookings, login/OTP failures and crashes. Our pitch: **a focused, reliable, brand-agnostic LPG app with live delivery tracking and proper software for the agencies**, which HP PAY does not give distributors.

## 2. Problem & opportunity

| Stakeholder | Pain today | Our answer |
|---|---|---|
| Customer | Booking through IVRS, WhatsApp or oil-company apps that fail often; no idea when the cylinder will arrive; forgets to rebook until it runs out | One-tap booking, live tracking, smart refill reminders |
| Agency | Orders arrive by phone, register or OMC portal; manual assignment to delivery staff; cash handling; no view of performance | Order dashboard, staff assignment, digital payments, analytics |
| Delivery staff | Paper route lists, calls to find addresses | Ordered drop list, map navigation, OTP confirmation |

## 3. Goals (prototype)

1. Show investors the **full loop in under 3 minutes**: sign up → auto-assigned agency → book → pay → agency accepts and assigns → live tracking → OTP delivery → reminder set.
2. Show the **B2B value**: agency dashboard with orders, staff, stock and revenue.
3. Show the **business model** (§11) in the admin view.

**Non-goals:** real payments, real KYC, real OMC integration, subsidy (DBT) handling, production security, app-store release.

## 4. Personas

| Persona | Description | Main app |
|---|---|---|
| **Riya — home customer** | 32, Hyderabad, uses one 14.2 kg domestic cylinder, pays by UPI | Mobile (Customer mode) |
| **Imran — small business** | Runs a tiffin centre, needs 2–3 × 19 kg commercial cylinders a week | Mobile (Customer mode) |
| **Suresh — agency owner** | Runs an HP Gas distributorship, ~4,000 customers, 8 delivery staff | Web (Agency panel) |
| **Ramesh — delivery executive** | Delivers 40–60 cylinders a day on a three-wheeler | Mobile (Delivery mode) |
| **Ops admin** | Platform team member | Web (Admin panel) |

## 5. Key user journeys

### 5.1 Customer onboarding
1. Splash → language picker (English, हिंदी, తెలుగు; only English needs full text in the prototype, the others can be labels) → phone number → OTP (mock: any 6 digits, or `123456`).
2. Profile: name, customer type (**Domestic / Commercial**), address via map pin plus text fields, pincode.
3. **LPG connection step:**
   - "I already have a connection" → pick oil company → enter Consumer No. / 17-digit LPG ID → the app finds and links **that connection's distributor** (mock lookup).
   - "I don't have one / commercial buyer" → the app **auto-assigns the nearest agency** that serves the pincode or geo-radius.
4. "Your agency" card appears: name, oil company logo placeholder, distance, rating, phone. The user can tap **"Request agency change"**, which creates a transfer request the agency and admin can see.

### 5.2 Book a cylinder
1. Home → **Book Refill** → choose cylinder (14.2 kg domestic, 5 kg FTL, 19 kg commercial, 47.5 kg commercial) and quantity (domestic capped at 1 per booking).
2. Delivery slot: *Standard (1–2 days)*, *Tomorrow slot (morning/evening)*, *Express (same day, + ₹49)*.
3. Review: price breakdown (cylinder price from the agency's price list + delivery charge + platform convenience fee + GST line), address, agency.
4. Payment: **UPI / Card / Netbanking / Wallet** through the mocked Razorpay checkout, or **Cash on Delivery** if the agency allows it.
5. Success screen shows booking ID, estimated delivery, and a **4-digit Delivery OTP** (like the oil companies' Delivery Authentication Code).
6. Rule checks (configurable, shown as friendly errors): minimum gap between domestic refills (default 21 days), yearly domestic cylinder quota (default 15), no duplicate open booking.

### 5.3 Track
Order status timeline (state machine in §7). When the order is **Out for Delivery**, show a live map with the delivery person's marker moving along a mock route, ETA, and call/chat buttons (chat can be a placeholder). A push-style in-app banner appears at each status change.

### 5.4 Agency (B2B) flow
New booking appears in real time (toast + sound) → agency **Accepts** (or rejects with a reason) → **assigns a delivery executive** (manually, or with "Auto-assign" by fewest current drops) → can see the executive on a live map → order is marked delivered after OTP → payment is reconciled (online is settled; COD is marked "cash collected").

### 5.5 Delivery flow
Delivery mode login → today's drop list (sorted by route) → **Start trip** (mock GPS broadcast starts) → open drop → navigate (map) → **Enter customer OTP** → collect cash if COD → mark empty cylinder collected → next drop. Failed delivery: reason picker (customer not home, wrong address, refused) → order goes back to the agency queue.

### 5.6 Reminders
After delivery, the app estimates the next refill date from past usage (average days between the last 3 deliveries; default 30 days for domestic). The dashboard shows a **"Gas left" gauge** (estimate), days to the next booking, and a reminder toggle. The user can set a custom reminder or turn on **Auto-book** (books on the chosen date with the saved payment method; mock only).

---

## 6. Screens & features

### 6.1 Mobile app — Customer mode (Expo / React Native)

| # | Screen | Key elements |
|---|---|---|
| C1 | Splash / Language | Brand, language chips |
| C2 | Login / OTP | Phone input (+91), OTP boxes, resend timer |
| C3 | Profile setup | Name, customer type, address map pin |
| C4 | Connection link / Agency assignment | Oil company picker, consumer no., assigned-agency card |
| C5 | **Home dashboard** | Greeting; **gas-left gauge** and "next refill in X days"; big **Book Refill** CTA; active order tracker card; agency card; quick actions (History, Payments, Support, Safety tips) |
| C6 | Book – cylinder & qty | Cylinder cards with price, qty stepper |
| C7 | Book – slot | Slot options, express upsell |
| C8 | Review & pay | Bill breakdown, address, payment options |
| C9 | Mock Razorpay checkout | Sheet styled like a gateway checkout: UPI apps / card / netbanking; "Success" and "Fail" test buttons |
| C10 | Booking success | Booking ID, OTP, ETA, "Track" button |
| C11 | **Order tracking** | Status timeline, live map (when out for delivery), delivery person card, call button, OTP display |
| C12 | Order history | List with filters, invoice view (mock PDF preview), rebook |
| C13 | Reminders & Auto-book | Estimated usage, reminder date, toggles |
| C14 | Notifications | Status updates, reminders, offers |
| C15 | Support | FAQ, raise complaint (category + text), complaint status, emergency leak helpline card (**1906**, the LPG emergency number) |
| C16 | Profile & settings | Addresses, connection details, agency change request, language, logout, **Switch to Delivery mode (demo)** |

### 6.2 Mobile app — Delivery mode

| # | Screen | Key elements |
|---|---|---|
| D1 | Home | Online/offline toggle, today's counts (assigned / delivered / failed), cash in hand |
| D2 | Drop list | Ordered cards: customer, address, cylinder, payment type |
| D3 | Drop detail + navigation | Map with route, call customer, **Start trip** |
| D4 | Complete delivery | OTP input, COD cash confirm, empty cylinder collected checkbox, photo placeholder |
| D5 | Failed delivery | Reason picker, notes |
| D6 | Day summary | Deliveries, cash to deposit |

### 6.3 Web — Agency panel (Next.js) — the "LMS"

| # | Page | Key elements |
|---|---|---|
| A1 | Agency registration / KYC (mock) | Business name, oil company, distributor code, GSTIN, owner details, document upload placeholders, **service area** (pincodes list + radius on map) → status "Pending approval" |
| A2 | **Dashboard** | KPI cards (today's orders, pending, out for delivery, delivered, revenue, COD outstanding); orders-per-day chart (7/30 days); cylinder mix; live staff map mini-view |
| A3 | **Orders board** | Tabs or Kanban: New → Accepted → Assigned → Out for Delivery → Delivered / Failed / Cancelled; search, filters (date, type, payment, staff, pincode); bulk accept; bulk assign |
| A4 | Order detail drawer | Customer, address map, items, payment status, timeline, assign/reassign, cancel with reason, invoice |
| A5 | Live tracking | Map with all active delivery staff and their drops |
| A6 | Delivery staff | List, add/edit, status, today's load, performance (on-time %, failed %) |
| A7 | Customers | Linked customers, booking history, last refill date, due-for-refill list (**upsell/reminder campaign button**, mock) |
| A8 | Inventory | Stock per cylinder type (filled / empty), low-stock alert, daily in/out entry |
| A9 | Pricing & settings | Price per cylinder type, delivery charge, COD on/off, slots and capacity per slot, service area editor |
| A10 | Payments & settlements | Online payments, platform commission deducted, net payout, COD reconciliation, payout history (mock Razorpay Route settlements) |
| A11 | Complaints & transfer requests | Queue with status updates |
| A12 | Subscription | Current plan and invoice (for the revenue story) |

### 6.4 Web — Platform admin panel (same Next.js app, `/admin`)

| # | Page | Key elements |
|---|---|---|
| P1 | Overview | GMV, orders, active customers, active agencies, platform revenue (commission + subscriptions + convenience fees), growth charts, city heatmap |
| P2 | Agency approvals | Pending KYC list, approve/reject |
| P3 | Agencies | List with performance, suspend |
| P4 | Customers | Search, details |
| P5 | Disputes / complaints | Escalated tickets |
| P6 | Config | Commission %, convenience fee, express fee, refill rules (min gap, yearly quota), reminder defaults |

### 6.5 Demo controls (all apps, hidden behind a floating "Demo" button)
- Switch role/persona instantly.
- Advance the current order to its next status.
- Simulate: payment failure, delivery failure, low stock, new incoming order burst.
- Speed up the tracking animation.
- **Reset demo data.**

---

## 7. Booking state machine

```
PENDING_PAYMENT ──pay ok──▶ PLACED ──agency accepts──▶ ACCEPTED ──assign──▶ ASSIGNED
      │ pay fail                │ reject/timeout                         │
      ▼                          ▼                                         ▼
 PAYMENT_FAILED            REJECTED (auto-refund)              OUT_FOR_DELIVERY ──OTP ok──▶ DELIVERED
                                                                           │
                                                                           └─fail─▶ DELIVERY_FAILED ──reschedule──▶ ACCEPTED
Any state before OUT_FOR_DELIVERY ──customer/agency cancel──▶ CANCELLED (refund if paid)
```
COD orders skip `PENDING_PAYMENT` and go straight to `PLACED`, with `paymentStatus = COD_PENDING`. Each change adds a `statusHistory` entry `{status, at, by}` and sends a notification.

## 8. Data model & mock data

### 8.1 Entities (TypeScript types in `packages/shared`)
- **User** `{id, role: customer|agency_owner|agency_staff|delivery|admin, name, phone, language}`
- **Customer** `{userId, type: domestic|commercial, addresses[], connection?: {omc, consumerNo, lpgId}, assignedAgencyId, reminder: {enabled, nextDate, autoBook}}`
- **Address** `{id, label, line1, line2, city, pincode, lat, lng}`
- **Agency** `{id, name, omc: HP|IOCL|BPCL, distributorCode, gstin, ownerUserId, status: pending|approved|suspended, serviceArea: {pincodes[], center, radiusKm}, rating, codEnabled, slots[], plan}`
- **CylinderType** `{id, name, weightKg, category: domestic|commercial}`
- **AgencyPrice** `{agencyId, cylinderTypeId, price, deliveryCharge}`
- **Inventory** `{agencyId, cylinderTypeId, filled, empty, lowStockThreshold}`
- **DeliveryStaff** `{id, userId, agencyId, vehicle, online, currentLocation}`
- **Booking** `{id, code, customerId, agencyId, items[{cylinderTypeId, qty, unitPrice}], slot, charges{subtotal, delivery, convenience, express, gst, total}, payment{method, status, gatewayRef}, status, statusHistory[], deliveryOtp, assignedStaffId, eta, createdAt}`
- **Payment / Settlement** `{bookingId, amount, commission, netToAgency, status, settledAt}`
- **Complaint** `{id, bookingId?, customerId, category, text, status}`
- **AgencyTransferRequest** `{customerId, fromAgencyId, toAgencyId?, reason, status}`
- **Notification** `{userId, title, body, type, read, createdAt}`

### 8.2 Seed data (Hyderabad demo city)
- 6 approved agencies across Hyderabad (Amberpet, Kukatpally, Gachibowli, Secunderabad, LB Nagar, Mehdipatnam), 2 per oil company, plus 1 pending agency for the approval demo.
- 8 delivery staff per demo agency (at least for the main "Suresh" agency); 3 for the others.
- 40 customers (30 domestic, 10 commercial) with realistic Indian names and addresses.
- ~600 historical bookings over the last 90 days, so charts look real.
- Mock prices are editable in the seed and should be labelled "illustrative": 14.2 kg ≈ ₹905, 5 kg ≈ ₹340, 19 kg ≈ ₹1,750, 47.5 kg ≈ ₹4,350. Delivery ₹0–₹30, convenience fee ₹9, express ₹49.
- Demo logins (shown on the login screen in demo mode): Customer `9000000001`, Business customer `9000000002`, Delivery `9000000003`, Agency `suresh@demo`, Admin `admin@demo`; OTP/password `123456`.
- Mock tracking route: a polyline of ~40 points between the agency and the customer address, played back every 1.5 s.

## 9. Technical approach

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces + Turborepo |
| Mobile | **Expo (React Native, TypeScript)**, Expo Router, NativeWind (Tailwind), Zustand, TanStack Query, `react-native-maps` (fall back to a styled static-map image plus an animated marker if map keys aren't available), Expo Notifications (local only) |
| Web | **Next.js (App Router, TypeScript)**, Tailwind + shadcn/ui, TanStack Table, Recharts, Leaflet + OpenStreetMap tiles (no API key needed) |
| Mock API | `apps/mock-api`: small Node (Express or Hono) server with in-memory store loaded from `packages/mock-data` seed; REST endpoints + **WebSocket/SSE** for live order and location updates; `/demo/*` endpoints for demo controls |
| Shared | `packages/shared` (types, state machine, pricing and rule functions, zod schemas), `packages/mock-data` (seed generator using faker with a fixed seed) |
| Payments | `PaymentProvider` interface → `MockRazorpayProvider` (UI sheet that mimics a checkout, returns `{razorpay_payment_id: "pay_mock_..."}`). Document how to swap to real Razorpay: server creates an Order, client opens Checkout (`react-native-razorpay` needs an Expo dev build; web uses `checkout.js`), server verifies the signature, webhooks update status, **Razorpay Route** handles agency split settlements |
| Offline fallback | If the mock API isn't reachable, the apps fall back to a bundled local mock store, so the demo still runs standalone |

**Repo layout**
```
/apps
  /mobile        # Expo: customer + delivery modes
  /web           # Next.js: /agency and /admin
  /mock-api      # in-memory API + websockets
/packages
  /shared        # types, state machine, business rules
  /mock-data     # seed generator
  /ui-tokens     # colors, typography shared by both apps
README.md        # how to run the demo in one command (`pnpm demo`)
```

**Key endpoints (mock):** `POST /auth/otp`, `POST /auth/verify`, `GET /agencies/nearest?lat&lng&pincode`, `GET/POST /bookings`, `PATCH /bookings/:id/status`, `POST /bookings/:id/assign`, `POST /payments/mock/checkout`, `GET /agency/:id/dashboard`, `GET /admin/overview`, `WS /live` (events: `booking.created`, `booking.updated`, `staff.location`), `POST /demo/reset`, `POST /demo/advance/:bookingId`.

**Nearest-agency logic:** if the customer has a linked connection, use that distributor. Otherwise take approved agencies whose `serviceArea.pincodes` include the pincode, or whose centre is within `radiusKm` (haversine), and pick the closest, breaking ties by rating.

## 10. Design guidelines

- Look: clean, trustworthy, utility-first. Primary colour a warm flame orange (`#F26B1D`) with deep navy (`#12263A`) text and a green for success. Avoid any oil company's exact brand colours or logos; use neutral "HP / IOCL / BPCL" text badges.
- Mobile: large tap targets; the Book CTA always sits above the fold; Indian number and currency formatting (₹1,750.00); 12-hour times.
- Web: left sidebar navigation, dense data tables, light and dark themes.
- Empty, loading (skeleton) and error states on every list.
- Accessibility: WCAG AA contrast; labels on all icons.

## 11. Business model (shown in the admin overview and the agency Settlements page)

A mixed model, with all values configurable in admin:
1. **Commission per online booking:** 2% of the cylinder value (or a flat ₹10), deducted before settling with the agency.
2. **Customer convenience fee:** ₹9 per booking (waived for subscribers or promos).
3. **Express delivery fee:** ₹49, split 50/50 with the agency.
4. **Agency SaaS plans:** Free (up to 200 orders/month), Growth ₹1,999/month, Pro ₹4,999/month (staff tracking, campaigns, analytics).
5. Future (slide only): cylinder safety check-ups, stove/accessory marketplace, insurance, and B2B credit for commercial buyers.

## 12. Build plan (phases for Claude Code)

1. **Foundation:** monorepo, shared types, state machine, seed generator, mock API with WebSocket, design tokens.
2. **Customer app:** C1–C16 with the booking, mock payment and tracking flows.
3. **Agency panel:** A1–A12 with live order board and assignment.
4. **Delivery mode:** D1–D6 with location broadcast and OTP completion.
5. **Admin panel + demo controls:** P1–P6 and §6.5.
6. **Polish:** empty/error states, animations, README, `pnpm demo` script that starts all three apps, and a scripted demo walkthrough (§14).

## 13. Acceptance criteria

- [ ] A booking placed in the mobile app appears on the Agency Orders board within 2 seconds, without a refresh.
- [ ] Accepting and assigning in the web panel updates the customer's tracking timeline live.
- [ ] Out-for-delivery shows a moving marker and a falling ETA on both customer and agency maps.
- [ ] Wrong OTP is rejected; correct OTP marks the order Delivered everywhere and schedules the next reminder.
- [ ] Mock payment success and failure paths both work; failed payment offers a retry and a COD fallback.
- [ ] Refill rule violations (gap, quota, duplicate open booking) show clear messages.
- [ ] A new pending agency can be approved in Admin and then becomes selectable for assignment.
- [ ] Dashboards show non-empty charts from the 90-day seed history.
- [ ] "Reset demo" restores the seed state.
- [ ] The whole demo runs locally with one command, with no external API keys.

## 14. Investor demo script (≈3 minutes)

1. Riya signs up → links her HP Gas connection → sees her agency (Amberpet).
2. Home dashboard: "Gas left ~15%, refill due in 3 days" → Book Refill → Express → UPI (mock) → success with OTP.
3. Switch to the Agency web panel: new order toast → Accept → Auto-assign to Ramesh.
4. Switch to Delivery mode: Start trip → the customer's map shows Ramesh moving.
5. Enter OTP → Delivered → the customer gets a "Next refill reminder set for 14 Oct" message.
6. Admin overview: GMV, orders, agencies, platform revenue split by stream.

## 15. Assumptions & open questions

- **Regulation:** real domestic LPG refills are tied to the customer's registered distributor and oil-company systems, and subsidy flows through DBT. The prototype mocks the connection lookup. Going to production needs an OMC partnership or distributor-side integration (to be confirmed).
- Launch city is Hyderabad (demo data only).
- The app name, logo and final pricing are placeholders.
- Out of scope for the prototype: new-connection applications, KYC verification, subsidy display, chat, multi-city ops, real SMS/push, invoices with real GST numbers.
- To decide later: do agencies pay subscription fees, commission, or both at launch? Should COD be allowed for first-time customers?
