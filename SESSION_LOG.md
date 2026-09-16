# SESSION_LOG.md

## 2026-09-16 — Session 1: build the investor prototype from PRD

### Timeline
- 11:20 Plan approved (6 deviations, see DECISIONS.md). Screenshot reference: white cards, hero product card, floating pill tab bar.
- 11:30 Phase 1 Foundation: monorepo (pnpm 11 + turbo), `packages/shared` (types, state machine, pricing, rules, geo, providers), `packages/ui-tokens`, `packages/mock-data` (seeded generator; 568 bookings / 60 customers / 7 agencies / 23 staff), `packages/engine` (DemoEngine + framework-free route table + tests), `apps/mock-api` (Express 5 + ws). Smoke-tested HTTP + WS.

### Errors hit
- pnpm 11 blocks postinstall scripts by default → `allowBuilds` in pnpm-workspace.yaml (not `onlyBuiltDependencies`). Logged in ERRORS.md.
- Seed bug: `{ id: u.id ?? id(), ...u }` spread re-overwrote `id` with `undefined` → all generated users had no id. Fixed by destructuring `id` out before the spread.

- 12:00 Phase 2+4 mobile: Expo 57 + Expo Router; C1–C16 and D1–D6 built; verified on iOS Simulator (Apple Maps) and Expo web (SVG map). Full loop tested on web: login → book → mock Razorpay fail → retry → success → OTP → advance → live map; Ramesh: start trip → wrong OTP rejected → correct OTP → delivered, cash in hand.
- 12:30 Phase 3+5 web: Next 16 + Tailwind 4 + Radix + Recharts + Leaflet. A1–A12, P1–P6, live board (toast + chime), drawer with accept/reject/assign/auto-assign/advance, dark mode. Verified booking from API appears on board instantly; auto-assign picks Ramesh.
- 12:45 Phase 6: README + walkthrough, `pnpm demo` (turbo, EXPO_PORT passthrough), audit fixes (live-update item merge, role redirect, nested buttons, language sheet, retry-live chip), seed scaled to ~100 customers.

### Errors hit (cont.)
- Metro "Failed to get SHA-1" after a full reinstall while Metro was running → restart with `expo start --clear`.
- CARTO tiles return "API key required" → switched to OSM tiles.
- Turbo strict env stripped `EXPO_PORT` → `globalPassThroughEnv`.

### Open threads
- Simulator MCP panel crashed in this session (drove the simulator with `simctl` deep links instead). Splash/login were verified on Expo web, not natively.
- Expo Go shows `expo-notifications` warnings (local notifications need a dev build) — in-app toasts cover the demo.
