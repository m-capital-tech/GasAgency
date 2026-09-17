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
- **~100 customers (75 domestic / 25 commercial) instead of 40** so that realistic ordering frequency (domestic ≈ monthly, commercial 2–3×/week) yields ~970 bookings over 90 days and the agency's daily chart isn't dwarfed by the 14 "live" orders seeded for today. (With 40 customers the history came out at ~350 bookings / ~3 per day for Suresh.) 57 % of customers belong to Suresh's agency.
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

## Web / mobile implementation notes
- **Map tiles:** CARTO basemaps now return "API key required" tiles, so the web uses plain OpenStreetMap tiles (`tile.openstreetmap.org`) — fine for a local demo, would need a paid tile provider in production. iOS uses Apple Maps via `react-native-maps` (no key); the Expo web build uses a key-free SVG map card.
- **Today's seed for Suresh's agency** is 14 orders in various states, arranged so every delivery partner except Ramesh already carries a drop → **Auto-assign picks Ramesh**, matching the demo script. Ramesh also has the best on-time % as a tie-breaker.
- **Tab bar (mobile):** static, labelled bottom tab bar (the floating pill from the reference screenshot was replaced on request, 16 Sep). Demo button is a small right-edge tab so it never covers footer CTAs.
- **Turbo env:** `EXPO_PORT`, `EXPO_PUBLIC_*`, `NEXT_PUBLIC_*` are passed through in `turbo.json` (Turbo 2 strict env mode strips them otherwise) so `EXPO_PORT=8091 pnpm demo` works when 8081 is busy.
- **Nested buttons on web:** React Native Web renders `Pressable` as `<button>`; cards that contain a call/checkbox button use a pressable inner region (mobile) or `div role="button"` (web) to avoid invalid nested buttons.
- **Language picker:** Hindi/Telugu are selectable labels only (PRD says English text is enough for the prototype); the choice persists but the UI stays English, with a note.

## Colour palette (16 Sep, investor brief)
Palette: charcoal `#1D1D1E`, maroon `#620A1A`, gold `#C6953F`, red `#A31E21`, sand `#E9E3D6`, off-white `#F9F7F5`. Applied as a mix, not a swap:
- **Red** — primary actions & brand (Book Refill, Accept, active tab, cylinder illustration, order line on charts).
- **Gold** — money and premium accents (revenue KPIs, settlement bars, ratings, Express tag/upsell, Assigned status, delivery-partner avatars, "delivered" chart line, gauge mid-range).
- **Maroon** — depth and danger (primary pressed/dark, failed/rejected, emergency card, splash gradient).
- **Charcoal** — text, dark cards (active-order card, Demo button), dark theme base, agency map pins.
- **Sand / off-white** — page background / cards. Borders are a darker sand.
- One exception outside the palette: a muted green `#2E7D4F` for *delivered / online / paid* so success never reads as the red primary. The mock Razorpay sheet keeps Razorpay's blue on purpose (it's a third-party checkout).

- **Bypass refill rules (demo switch, 17 Sep):** `POST /demo/bypass-rules {enabled}` makes `quote()` skip min-gap / quota / duplicate-open checks. Off by default and cleared by Reset, so the §13 rule messages still show unless the presenter flips it. Available in both Demo sheets.
