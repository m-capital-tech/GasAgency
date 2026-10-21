# SESSION_LOG.md

## 2026-10-21 — Production Operations dashboard expansion

- Added the secured `/operations/dashboard` command centre with daily, weekly, and monthly comparisons for booked orders/value, cylinders, deliveries, and agency-recorded collections.
- Added production-backed fulfilment timing, live queue state, inventory custody, delivery capacity, receivables, credit exposure, exception handling, order-state composition, trends, and recent audited transitions. The dashboard contains no demo-engine fallback.
- Added the agency-scoped dashboard API, same-origin gateway allowlist, RBAC denial coverage, and migration `0012_operations_dashboard` for time-window scans.
- Applied all 12 migrations to a clean disposable PostgreSQL 17 database; all SQL verification scripts and all 14 API tests passed. API/database/web type checking, targeted lint, Node 22 production builds, and rendered daily/weekly/monthly browser checks passed.

## 2026-10-21 — Dashboard expansion, production RBAC, and Super Admin release

- Expanded the Platform Control dashboard with daily, weekly, and monthly reporting boundaries for Super Admin, Platform Admin, and tenant viewers. Added operational summaries, approval queues, onboarding progress, team/RBAC administration, role permission ceilings, session revocation, and immutable audit visibility.
- Completed the mandatory tenant-onboarding contract for GSTIN, address, requirement, and explicitly selected serving agency. Platform team members can create drafts; approval remains a Platform Admin or Super Admin action.
- Added production Super Admin bootstrap support, MFA step-up, custom-role editing, assignment suspension/reinstatement/revocation, and database-tested least-privilege permission replacement. Runtime `DELETE` remains denied for users and audit events and is allowed only for `role_permissions` and auth-rate cleanup.
- Repository-wide API/web/database tests, production builds, SQL integration checks, and all 11 TypeScript targets passed before release. Commits `c87dc79` and corrective runtime-grant commit `b7999cc` were pushed to organization `main`.
- Deployed commit `b7999cc` manually to DigitalOcean as deployment `e343f04d-185e-49a7-a38a-63a26800c42d`. The release job completed `pnpm migrate && pnpm grant:runtime`, logged `runtime_privileges_applied` for `platform_runtime`, and the release reached `Success`, `Live Deployment`, and `Healthy` after API and web readiness passed.
- Confirmed the production Super Admin identity for Pranav Aditya with the approved email and mobile number. Two consecutive bootstrap executions returned `changed: false` with the same user and role IDs, proving the stored identity already matched and the command is idempotent.
- Public smoke tests returned HTTP 200 for `/v1`, `/control/login`, and `/operations/login`; unauthenticated dashboard, session, team, role, and tenant-draft APIs returned HTTP 401.

## 2026-10-16 — DigitalOcean production promotion and mobile release foundation

- Promoted the existing DigitalOcean environment in place: the project environment is now Production, the app is named `commercial-lpg-production`, and API/web `APP_ENV` values are `production`. The existing provider hostname and legacy database identifiers remain unchanged.
- Renamed the tracked App Platform template and renderer command to production terminology; deploy-on-push remains disabled.
- Completed the Expo notification runtime and EAS Update configuration foundation while preserving Expo Go as the immediate UI-review path. Added authenticated, encrypted push-device registration, account-switch-safe token ownership, logout revocation, and safe notification routing. Remote-push and published-OTA acceptance still require the final Expo/EAS project identity, Apple/FCM credentials, and native development/production builds.
- Added a provider-neutral Expo push sender for order, invoice, and payment events. It resolves active tenant memberships only, decrypts tokens only for delivery, sends bounded HTTPS batches, records an idempotent event/device ledger, applies bounded retries, and marks `DeviceNotRegistered` installations stale without logging provider tokens.
- Added a push-only production worker specification with SMS disabled until MessageIndia is ready. The ordinary recurring footprint remains within the approved USD 45 including-GST ceiling; activating this additional paid component remains an explicit release decision.
- Added a dedicated encrypted `PUSH_TOKEN_ENCRYPTION_KEY` to the production API configuration. A fresh disposable PostgreSQL database applied all eleven migrations; all SQL verification suites, all 13 API tests, all 12 worker tests including both database integrations, all 11 TypeScript targets, production builds, engine tests, and mock-data integrity checks passed.
- Pushed release commit `5a0f1bc` and deployed it manually to DigitalOcean as deployment `f8f888b5-3af4-40c2-abbf-5f64117d3e3d`. Migration `0011_push_delivery_ledger` completed, both service readiness checks passed, and the release became the healthy live deployment. Public API/login/redirect/auth-boundary smoke tests passed.

## 2026-10-16 — Parallel production account controls and tenant self-service

- Built post-activation Platform Control for scoped tenant suspension/reinstatement and credit approval, limit/net-term changes, suspension, and reinstatement. Tenant suspension revokes live tenant sessions; credit exposure guards prevent unsafe limit reductions.
- Built agency commercial-account operations for an agency-wide credit availability switch, lower negotiated account prices, append-only payment collection, oldest-invoice-first allocation, and receivables/collection views. Agency mutations cannot alter platform-owned limits or net terms.
- Built production tenant order history, fulfillment timeline, billing summary, GST invoice detail, and tenant-visible payment allocations in the mobile path. Every query is constrained to the authenticated tenant's active membership and serving account.
- Added migration `0009_agency_commercial_controls` with indexed payment and allocation ledgers, cross-account integrity triggers, and database-enforced immutability. PostgreSQL best-practice guidance informed exact numerics, foreign-key indexes, ordered short transactions, and keyset pagination.
- On a fresh disposable PostgreSQL 17 database, applied all nine migrations and passed 9/9 SQL verification suites, 11/11 API tests, 5/5 worker tests, and 3/3 database concurrency/security tests. Repository type checking passed all 11 targets and every production build target passed. The disposable database was removed after verification.
- Pushed release commit `f886baa` to the organization repository and deployed it manually to DigitalOcean as deployment `40235cce-3dfc-4512-923a-93cec3306fd0`. The release reached live status after the API returned HTTP 200 readiness, the web service became ready, migration `0009_agency_commercial_controls` completed, and runtime privileges were reapplied.
- Confirmed DigitalOcean source hash `f886baa` with Autodeploy Off. Public `/v1`, `/control/login`, `/operations/login`, and `/operations/accounts` returned HTTP 200; unauthenticated admin/session, agency-account, and tenant-billing APIs returned HTTP 401.
- MessageIndia production delivery remains intentionally deferred as the final external integration; no provider credential was added to code, Git, or the cloud configuration during this work.

## 2026-10-16 — Staging release and end-to-end verification

- Removed the DigitalOcean rollback pin through its zero-downtime revert operation, then manually deployed GitHub `main` at `f33ad65` as deployment `bfb0b0af-e1e6-46e9-926f-a7fabe409c1f`.
- Confirmed the pre-deploy migration job, API readiness, dashboard readiness, public `/v1`, Platform Control login, and agency operations login. Protected admin/session routes remained closed to unauthenticated requests, and unknown-number OTP requests retained their enumeration-safe response.
- Confirmed DigitalOcean source hash `f33ad65` and `Autodeploy: Off` after the release.
- Created an isolated local database, applied all eight migrations, bootstrapped a test-only Super Admin, and passed the complete delegated Super Admin → Platform Admin → onboarding team → tenant approval → credit order → agency fulfilment integration scenario.
- Passed 7/7 API tests, 8/8 SQL verification suites, 5/5 worker tests, 11/11 type-check targets, and every production build target. Removed the disposable database after verifying no active sessions.
- Real staging login and invitation delivery remain gated by the provider's operational HTTPS SMS endpoint and approved DLT entity/template configuration; no SMS credential was stored in the repository or cloud environment.

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

## 2026-09-18 — Session 3: B2B pivot
- Decisions (Pranav): drop domestic; admin decides credit at onboarding; multi-outlet now; Imran is 9000000001.
- Step 1 engine/seed, step 2 mobile, step 3 web — all committed; typecheck 7/7, engine test green, `next build` green.
- Verified live: Imran 5 × 19 kg on credit end-to-end (web build); agency dashboard/accounts/receivables; admin onboarding queue verify + credit terms. Native: SDK-57 Expo Go reinstalled on iPhone 17 Pro; splash + logged-out states render.
- Docs: README rewritten (B2B walkthrough), PRD_B2B_ADDENDUM.md, DECISIONS/ERRORS updated. Tag `b2c-prototype` marks the pre-pivot code.
- Open: native logged-in tap-through not possible without the simulator panel; scheduler for standing orders is "Run now" only.
