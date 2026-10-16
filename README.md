# GasSetu for Business — commercial LPG marketplace

> **Production direction:** [`PRD_PRODUCTION_V1.md`](./PRD_PRODUCTION_V1.md) is the canonical specification. The repository contains an isolated PostgreSQL-backed production path alongside the investor prototype described below; the prototype's self-registration, automatic verification, mock authentication, and in-memory persistence are not production behavior.

A clickable, mock-data prototype of a **B2B** LPG platform: restaurants, cloud kitchens, hotels, canteens and tea stalls order **19 kg / 47.5 kg commercial cylinders** from their gas agency, on credit, with standing orders and GST invoices — while the agency runs its business from a web panel and the platform admin verifies businesses and sets credit terms.

| App | Who | Where |
|---|---|---|
| **Mobile (Expo)** — Business mode + Delivery mode | Imran (Al-Madina Tiffin Centre, 2 outlets, credit), Fatima (Star Kitchens Cloud, credit requested), Ramesh (delivery partner) | iOS Simulator / Expo Go, or `http://localhost:8081` in a browser |
| **Web — Agency panel ("LMS")** | Suresh, HP Gas distributor in Amberpet | `http://localhost:3000/agency` |
| **Web — Platform admin** | Ops team — verifies businesses, decides credit | `http://localhost:3000/admin` |
| **Mock API** | in-memory store + WebSocket live events | `http://localhost:4000` |

The production path consists of `apps/api`, `apps/worker`, forward-only PostgreSQL migrations in `packages/database`, tenant authentication/ordering/tracking/billing under `/(tenant)`, agency fulfillment/account operations at `/operations`, and Platform Control onboarding, lifecycle, credit, RBAC, and analytics at `/control`. These do not read from or fall back to the demo engine.

Everything runs locally with **no API keys, no real payments, no SMS**. An order placed on the phone shows up on the agency board within a second; accepting and assigning on the web updates the phone live; "Start trip" moves a marker on every map.

---

## 1. Run the demo

Prerequisites: Node 20+, pnpm 9+, Xcode with an iOS Simulator (for the native app).

```bash
pnpm install
pnpm demo
```

`pnpm demo` starts all three apps in one terminal: Mock API on **:4000** (seeded with 7 agencies, ~100 businesses, ~2,500 orders / ₹2.1 Cr GMV over 90 days), Web on **:3000**, Expo on **:8081** (press `i` for the iOS Simulator, `w` for the browser build). If 8081 is busy: `EXPO_PORT=8091 pnpm demo`.

> Expo Go must be an SDK 57 build. If the simulator shows "Project is incompatible with this version of Expo Go", press `i` in the Metro terminal (installs the matching client) or `xcrun simctl install booted ~/.expo/ios-simulator-app-cache/Expo-Go-57.*.app`.

### Demo logins (shown on the login screens)

| Persona | Login | OTP / password |
|---|---|---|
| Imran — Al-Madina Tiffin Centre (credit ₹40k net-15, 2 outlets) | `9000000001` | `123456` |
| Fatima — Star Kitchens Cloud (credit requested, prepaid) | `9000000002` | `123456` |
| Ramesh — delivery partner | `9000000003` | `123456` |
| Suresh — agency owner | `suresh@demo` | `123456` |
| Ops admin | `admin@demo` | `123456` |

In this prototype only, any other 10-digit mobile number opens the legacy self-registration demo. Production rejects unknown phone numbers: an authorized platform operator creates the tenant, explicitly selects its agency, and a separate Platform Admin approves it before SMS invitation and OTP access.

### Demo controls (PRD §6.5)

Every app has a **Demo** button: switch persona, advance the current order, simulate payment failure / delivery failure / low stock / order burst / **overdue invoice**, tracking speed 1×/3×/6×, **Bypass order rules** (credit limit, overdue, quantity cap), and **Reset demo data**.

---

## 2. The 3-minute investor walkthrough

Phone (Imran) on the left, agency panel (`/agency`, Suresh) on the right, admin (`/admin`) in a second tab.

1. **Stock, not a gauge** — Imran's home shows *Main kitchen · ~1 day of LPG left* (2 in use, 0 spare, 2 empties) and *Vidyanagar branch · ~11 days*, plus his **credit account**: ₹25k outstanding, ₹15k available, net-15.
2. **Reorder usual** — one tap pre-fills *3 × 19 kg*; bump to 5 to show **slab pricing** (₹1,725 instead of ₹1,750), set 4 empties to return, slot *Before opening (6–9 AM)*. Review shows GST @ 18 %, GSTIN on the invoice, and **Pay on credit** as the default. Place the order → success with the delivery OTP and invoice number.
   - *Detour:* switch to UPI and press **Test: Fail** — the app offers retry, **put it on credit**, or cash.
   - *Detour:* order 12 × 47.5 kg on credit → **"Over your credit limit"** card.
3. **Agency accepts** — toast + chime on the web; the card shows *5 × 19 kg · 4 empties · Credit*. **Accept → Auto-assign** picks **Ramesh**. Phone timeline ticks live.
4. **Delivery** — Phone Demo tab → *Ramesh*. **Start trip** (5 cylinders to load); both maps show him moving. **Deliver · Enter OTP** → wrong OTP rejected → correct OTP, adjust empties collected → Delivered. The outlet's stock jumps, the credit invoice is raised, the agency's inventory shows 5 more *with accounts*.
5. **Money** — Phone → **Billing**: invoice due in 15 days, ledger, **monthly statement**. Web → **Business accounts**: Imran's drawer shows outstanding, negotiated rate, *Record payment*. **Payments → Credit receivables**: aging buckets and every open invoice. Demo → *Overdue invoice* → Imran's credit ordering pauses until he pays from Billing.
6. **Standing order** — Phone → Standing orders → resume *3 × 19 kg every Tue & Fri* → **Run now** places it instantly.
7. **Admin** — `/admin`: GMV ₹2.1 Cr, **credit book**, revenue by stream (commission, **1 % credit facilitation fee**, convenience, express, SaaS). **Businesses → Onboarding queue**: Nizampet Food Court is *pending* — **Verify & apply terms** (₹1.5 L, net-30) in one click; Fatima's credit request gets approved the same way and her app switches to credit ordering live.

Reset at any time from the Demo button.

---

## 3. Repo layout

```
apps/
  mobile/      Expo (React Native, Expo Router) — business mode + delivery mode
  web/         Next.js App Router — /agency and /admin; Tailwind, Recharts, Leaflet
  mock-api/    Express 5 + ws — REST + WebSocket /live, /demo/* controls
packages/
  shared/      types, zod schemas, booking state machine, pricing (slabs, GST), order/credit rules, provider interfaces
  mock-data/   seed generator (faker, fixed seed; dates relative to "now")
  engine/      DemoEngine — all business logic + route simulation in one in-memory object; framework-free route table
  ui-tokens/   palette (red / gold / maroon / charcoal / sand) shared by both front-ends
```

`packages/engine` is the single source of truth. `apps/mock-api` exposes it over HTTP/WebSocket; the mobile app runs the same engine **locally** if the API is unreachable and switches back automatically when it returns.

**Key endpoints:** `POST /auth/otp|verify|login` · `GET|PUT /businesses/:id/profile` · `POST /businesses/:id/outlets` · `POST /businesses/:id/connection|assign-agency` · `POST /businesses/:id/credit/request` · `GET /businesses/:id/ledger|statements/:month` · `PUT|DELETE /businesses/:id/standing-orders` · `POST /bookings/quote` · `GET|POST /bookings` · `PATCH /bookings/:id/status` · `POST /bookings/:id/assign|start-trip|complete|fail|retry-payment|switch-payment` · `POST /payments/mock/order|checkout` · `GET /agency/:id/dashboard|accounts|settlements|inventory` · `PUT /agency/:id/accounts/:bid/price` · `POST /agency/:id/accounts/:bid/payment` · `GET /admin/overview|businesses` · `POST /admin/businesses/:id/status` · `WS /live` · `POST /demo/reset|advance/:id|simulate|speed|bypass-rules`.

## 4. Provider interfaces (swap-in-later)

`packages/shared/src/providers.ts` defines `PaymentProvider`, `LocationProvider`, `AuthProvider`, `NotificationProvider`; mocks live in `apps/mobile/src/lib/providers.ts`. **Payments:** `MockRazorpayProvider` mirrors the real SDK's `{razorpay_payment_id, razorpay_order_id, razorpay_signature}`; to go live the server creates a Razorpay Order, the client opens Checkout (`react-native-razorpay` needs an Expo dev build), the server verifies the HMAC and listens to webhooks, and **Razorpay Route** settles the agency's share. Credit collections would plug into the same ledger via NEFT/UPI-Autopay mandates.

## 5. Business model in the numbers

`computeSettlement()` applies: **2 % commission** on cylinder value (online and credit orders), **1 % credit facilitation fee** on credit orders, **₹19 convenience fee** per order, **₹99 express fee** split 50/50, and agency SaaS plans (Free / Growth ₹2,999 / Pro ₹7,999). Admin → Config changes every lever live.

## 6. Checks

```bash
pnpm typecheck     # every package and app
pnpm test          # engine end-to-end test (credit order → slab price → assign → trip → OTP → invoice → ledger → statement → standing order → admin decision)
pnpm seed:check    # seed statistics
```

`DECISIONS.md` records every judgment call; `PRD_LPG_Booking_Platform.md` is the original spec and `PRD_B2B_ADDENDUM.md` the pivot.
