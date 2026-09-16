# SESSION_LOG.md

## 2026-09-16 — Session 1: build the investor prototype from PRD

### Timeline
- 11:20 Plan approved (6 deviations, see DECISIONS.md). Screenshot reference: white cards, hero product card, floating pill tab bar.
- 11:30 Phase 1 Foundation: monorepo (pnpm 11 + turbo), `packages/shared` (types, state machine, pricing, rules, geo, providers), `packages/ui-tokens`, `packages/mock-data` (seeded generator; 568 bookings / 60 customers / 7 agencies / 23 staff), `packages/engine` (DemoEngine + framework-free route table + tests), `apps/mock-api` (Express 5 + ws). Smoke-tested HTTP + WS.

### Errors hit
- pnpm 11 blocks postinstall scripts by default → `allowBuilds` in pnpm-workspace.yaml (not `onlyBuiltDependencies`). Logged in ERRORS.md.
- Seed bug: `{ id: u.id ?? id(), ...u }` spread re-overwrote `id` with `undefined` → all generated users had no id. Fixed by destructuring `id` out before the spread.

### Open threads
- Phases 2–6 pending (mobile, agency web, delivery mode, admin + demo controls, polish/README).
