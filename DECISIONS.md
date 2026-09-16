# DECISIONS.md — judgment calls made while building the GasSetu prototype

Each entry: what the PRD said (or didn't), what was chosen, why.

## Approved deviations (plan step, 16 Sep 2026)
1. **`packages/engine` instead of a second bundled mock store.** All business logic (store, state machine, rules, route simulation, demo controls) lives in one pure in-memory `DemoEngine`. `apps/mock-api` wraps it over HTTP + WebSocket; the mobile app instantiates the same engine locally if the API is unreachable. The route table (`packages/engine/src/routes.ts`) is framework-independent so the offline fallback serves the *exact* same endpoints. Offline fallback is mobile-only — the web panel's purpose is live multi-client data.
2. **No NativeWind.** Plain `StyleSheet` + `@gassetu/ui-tokens`. Fewer Babel/Metro moving parts for a stage demo.
3. **Maps:** `react-native-maps` on iOS/Android (Apple Maps on iOS Simulator, no key); platform-split SVG map card on web (`*.web.tsx`).
4. **Tracking simulation runs on the server.** "Start trip" starts route playback in the engine, which broadcasts `staff.location` every 1.5 s (scaled by demo speed). Customer and agency maps move even if the delivery screen is closed.
5. **No timers for reject/timeout.** Rejection is manual only.
6. **Relative seed dates.** History is generated relative to the run date with a fixed faker seed (names/addresses stable, charts always "last 90 days").

## Seed data
- **60 customers (45 domestic / 15 commercial) instead of 40** so that realistic ordering frequency (domestic ≈ monthly, commercial 2–3×/week) yields ~570 bookings over 90 days. With 40 customers the history came out at ~350.
- Riya's history: four 14.2 kg deliveries exactly 30 days apart, last one 26 days ago → gauge shows **~13 % left, refill in ~4 days** (PRD script says "~15 %, 3 days" — same story, computed rather than hard-coded).
- `reminderLeadDays = 2` so that a delivery today schedules the reminder 28 days out (PRD script: "14 Oct" for a 16 Sep delivery).
- Historical `DELIVERY_FAILED` orders older than a day are auto-cancelled in the seed so they don't linger as open orders on the board; one live failed order from today remains for the demo.
- Gachibowli agency has COD disabled (to demo the "COD not available" path). Suresh's agency has 5 kg FTL stock below threshold (low-stock alert visible on first load).
- GST (5 %) is applied only to delivery + fees, not to the cylinder price (domestic LPG has its own tax treatment; this is illustrative).

## Engine behaviour
- `booking.created` is broadcast only once an order reaches `PLACED` (after payment, or immediately for COD). The pending-payment step only emits `booking.updated`. Agency toasts key off `booking.created`.
- Auto-assign: fewest current drops → online first → higher on-time %.
- Yearly domestic quota counts deliveries since 1 April (Indian financial year).
- Delivery ETA is a fake 18-minute trip that falls linearly with route progress.
- Complete-delivery for COD requires the "cash collected" confirmation; wrong OTP is rejected with HTTP 422.
- "Reset demo" regenerates the seed relative to *now* and clears in-flight trips.
- `/demo/simulate payment_failure`: fails the newest `PENDING_PAYMENT` booking if one exists; otherwise arms "next checkout fails".
