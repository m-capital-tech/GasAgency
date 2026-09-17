# GasSetu — LPG cylinder booking marketplace (investor prototype)

A clickable, mock-data prototype of a two-sided LPG booking platform:

| App | Who | Where |
|---|---|---|
| **Mobile (Expo)** — Customer mode + Delivery mode | Riya / Imran (customers), Ramesh (delivery partner) | iOS Simulator / Expo Go, or `http://localhost:8081` in a browser |
| **Web — Agency panel ("LMS")** | Suresh, HP Gas distributor in Amberpet | `http://localhost:3000/agency` |
| **Web — Platform admin** | Ops team | `http://localhost:3000/admin` |
| **Mock API** | in-memory store + WebSocket live events | `http://localhost:4000` |

Everything runs locally with **no API keys, no real payments, no SMS**. A booking placed on the phone shows up on the agency board within a second; accepting and assigning on the web updates the phone live; "Start trip" moves a marker on every map.

---

## 1. Run the demo

Prerequisites: Node 20+, pnpm 9+, Xcode with an iOS Simulator (for the native app). Nothing else.

```bash
pnpm install
pnpm demo
```

`pnpm demo` starts all three apps in one terminal:

- Mock API on **:4000** (seeded with 7 agencies, ~100 customers, ~970 bookings over 90 days)
- Web on **:3000**
- Expo dev server on **:8081** — press `i` in that terminal to open the iOS Simulator, scan the QR with Expo Go, or press `w` for the browser build

If port 8081 is busy: `EXPO_PORT=8091 pnpm demo`.

Handy alternatives: `pnpm api`, `pnpm web`, `pnpm mobile` run one app each; `pnpm demo:ios` also launches the simulator.

### Demo logins (shown on the login screens)

| Persona | Login | OTP / password |
|---|---|---|
| Riya — home customer (HP Gas, Amberpet) | `9000000001` | `123456` |
| Imran — tiffin centre (commercial) | `9000000002` | `123456` |
| Ramesh — delivery partner | `9000000003` | `123456` |
| Suresh — agency owner | `suresh@demo` | `123456` |
| Ops admin | `admin@demo` | `123456` |

Any other 10-digit mobile number creates a brand-new customer and walks through onboarding (profile → link connection or auto-assign agency).

### Demo controls (PRD §6.5)

Every app has a **Demo** button (right-edge tab on the phone, top bar on the web): switch persona, advance the current order to its next status, simulate payment failure / delivery failure / low stock / a burst of 5 orders, speed up tracking (1× / 3× / 6×), **Bypass refill rules** (lets Riya rebook straight after a delivery), and **Reset demo data** to the seed.

---

## 2. The 3-minute investor walkthrough (PRD §14)

Open the phone (Riya) on the left and the agency panel (`/agency`, Suresh) on the right.

1. **Sign up & link connection** — Phone: *Get started → 9000000001 → OTP 123456.* Riya lands on her dashboard (already onboarded). To show onboarding, log in with any new number: profile → *"I already have a connection" → HP → any consumer no.* → the app finds her distributor in Amberpet and shows the **Your agency** card.
2. **Book a refill** — Dashboard shows *"Refill due in 4 days"* and the gauge at ~13 %. *Book Refill → 14.2 kg → Express (today, +₹49) → Review (bill breakdown with convenience fee + GST) → Pay → UPI → GPay → Pay.* The mock Razorpay sheet has **Test: Success / Test: Fail** buttons. Success screen shows the booking ID, ETA and the **4-digit Delivery OTP**.
   - *Optional detour:* press **Test: Fail** first — the app offers **Retry payment** and **Switch to Cash on Delivery**.
   - *Optional:* try booking again — the **"You already have an open booking"** rule blocks it; after delivery the **21-day gap** rule blocks it.
3. **Agency accepts** — On the web a toast + chime announces *New order GS-…*, and the card appears in the **New** column without a refresh. Click **Accept**, then **Auto-assign** — it picks **Ramesh** (fewest current drops). The phone's timeline ticks *Accepted → Delivery partner assigned* live.
4. **Delivery** — Phone: *Demo tab → Ramesh · delivery* (or Profile → *Switch to Delivery mode*). Home shows the next drop; press **Start trip**. The customer's tracking screen and the agency **Live tracking** map now show Ramesh moving along the route with a falling ETA. (Use the Demo tab's **3×/6×** to hurry.)
5. **OTP** — Delivery: *Complete delivery → Enter OTP.* A wrong OTP is rejected; the correct one (from Riya's tracking screen, or the order drawer on the web) marks the order **Delivered** everywhere, adds the cash to Ramesh's hand if COD, and Riya gets *"Delivered ✅ … Next refill reminder set for 14 Oct"* (28 days out).
6. **Admin** — `/admin` (admin@demo): GMV, orders, active agencies, **platform revenue split by stream** (2 % commission, ₹9 convenience fees, express share, SaaS plans) and the city heatmap. **Agency approvals** has one pending agency (Uppal) — approve it and it becomes assignable for pincode 500039.

Reset at any time from the Demo button.

---

## 3. Repo layout

```
apps/
  mobile/      Expo (React Native, TypeScript, Expo Router) — customer mode (C1–C16) + delivery mode (D1–D6)
  web/         Next.js App Router — /agency (A1–A12) and /admin (P1–P6); Tailwind, Recharts, Leaflet
  mock-api/    Express 5 + ws — REST + WebSocket /live, /demo/* controls
packages/
  shared/      TypeScript types, zod schemas, booking state machine, pricing, refill rules, geo, provider interfaces
  mock-data/   Seed generator (faker, fixed seed; dates relative to "now")
  engine/      DemoEngine — every business rule and the route simulation in one in-memory object, plus a framework-free route table
  ui-tokens/   Colours, radii, type scale shared by both front-ends
```

`packages/engine` is the single source of truth. `apps/mock-api` exposes it over HTTP/WebSocket; the mobile app instantiates the same engine **locally** if the API is unreachable, so the phone demo still works standalone (the Demo sheet shows *Offline (bundled engine)*).

Key endpoints: `POST /auth/otp`, `POST /auth/verify`, `POST /auth/login`, `GET /agencies/nearest`, `GET|POST /bookings`, `POST /bookings/quote`, `PATCH /bookings/:id/status`, `POST /bookings/:id/{assign|start-trip|complete|fail|retry-payment|switch-cod}`, `POST /payments/mock/{order|checkout}`, `GET /agency/:id/{dashboard|staff|customers|inventory|settlements|complaints|transfers}`, `GET /admin/overview`, `WS /live` (`booking.created`, `booking.updated`, `staff.location`, `staff.updated`, `inventory.updated`, `notification`, `demo.reset`), `POST /demo/{reset|advance/:id|simulate|speed}`.

## 4. Provider interfaces (swap-in-later points)

`packages/shared/src/providers.ts` defines `PaymentProvider`, `LocationProvider`, `AuthProvider`, `NotificationProvider`. The mobile app ships `Mock*` implementations in `apps/mobile/src/lib/providers.ts`:

- **Payments** — `MockRazorpayProvider.createOrder()` calls `POST /payments/mock/order`; `checkout()` opens the in-app sheet (`RazorpaySheet.tsx`) and resolves `{ razorpay_payment_id: "pay_mock_…", razorpay_order_id, razorpay_signature }`, mirroring the real SDK. **To go live:** server creates a real Order with the Razorpay Node SDK; the client opens Checkout (`react-native-razorpay` needs an Expo dev build; the web uses `checkout.js`); the server verifies the HMAC signature and listens to `payment.captured` webhooks; **Razorpay Route** transfers the agency's share (`netToAgency` in `computeSettlement`) to a linked account.
- **Location** — replace `MockLocationProvider` with `expo-location`; the delivery app would `POST` real coordinates instead of the server-side route playback.
- **Auth** — replace `MockOtpProvider` with an SMS OTP service; tokens are already carried as `Authorization: Bearer`.
- **Notifications** — `ExpoLocalNotificationProvider` schedules local notifications; swap for Expo push tokens + a server sender.

## 5. Business model in the numbers

`computeSettlement()` (shared) applies: 2 % commission on cylinder value for online orders (or a flat ₹10 — switchable in Admin → Config), ₹9 convenience fee per booking, ₹49 express fee split 50/50, and SaaS plans (Free / Growth ₹1,999 / Pro ₹4,999). The agency **Payments** page shows gross → commission → net payout and COD reconciliation; Admin **Overview** shows platform revenue by stream.

## 6. Checks

```bash
pnpm typecheck     # every package and app
pnpm test          # engine end-to-end test (booking → payment → assign → trip → OTP → reminder)
pnpm seed:check    # prints seed statistics
```

See `DECISIONS.md` for every judgment call made where the PRD was open, and `PRD_LPG_Booking_Platform.md` for the spec.
