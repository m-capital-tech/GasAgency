# Munna Gas Connect — Initial Production SDET Report

Date: 27 October 2026, 20:59 IST
Tester model: `gpt-6-luna`
Scope: Super Admin dashboard, Operations dashboard, production API, RBAC, tenant ordering, credit, notifications, and security boundaries

## Executive result

This first pass verified the production baseline and current Super Admin session. It did not create production test records, send invitations, or trigger notifications because the approved QA identities and a fresh human MFA action were unavailable.

No defects were confirmed. Mutation, cross-role, tenant-order, credit, and Operations scenarios remain blocked rather than failed.

## Verified production baseline

- `/v1` identifies `commercial-lpg-platform-api`, version `v1`, status `protected-onboarding`.
- Control and Operations login pages render over HTTPS.
- Privacy policy renders and is dated 24 October 2026.
- Repository HEAD matches deployed commit `6301f837279bb5408fdf31301e9a208a7b5f7cb8`.
- The active session is `super_admin` for Pranav Aditya.
- Session persistence after reload passed.
- Latest visible privileged event is `mfa · verified`, 27 October 2026 at 8:47 pm IST.
- Dashboard baseline: 0 orders, ₹0 GMV, ₹0 collections, ₹0 revenue, 0 onboarding queue, ₹0 credit exposure, 6 active sessions, and 0 suspended users.
- Agency registry and tenant-account registry both contain zero scoped records.
- Operations correctly reports that the current Super Admin account has no agency operations scope.
- Team & RBAC correctly requires fresh MFA before privileged role/access changes.

## Status summary

| Area | Result |
|---|---|
| Preflight | 4 PASS |
| Super Admin | 3 PASS, 2 PARTIAL |
| Agency administration | 1 PARTIAL, 4 BLOCKED |
| Tenant onboarding | 1 PARTIAL, 6 BLOCKED, 1 NOT RUN |
| RBAC | 8 BLOCKED, 1 NOT RUN |
| Authentication | 1 PASS, 4 BLOCKED, 2 NOT RUN |
| Tenant app/API | 10 BLOCKED, 1 NOT RUN |
| Credit governance | 4 BLOCKED, 1 NOT RUN |
| Operations | 7 BLOCKED, 2 NOT RUN |
| Notifications/outbox | 3 BLOCKED, 4 NOT RUN |
| Security/negative | 5 BLOCKED, 1 PARTIAL, 3 NOT RUN |

## Complete case status

- P0: `P0-01` PASS; `P0-02` PASS; `P0-03` PASS; `P0-04` PASS.
- SA: `SA-01` PARTIAL; `SA-02` PASS; `SA-03` PARTIAL; `SA-04` PASS; `SA-05` BLOCKED.
- AG: `AG-01` BLOCKED; `AG-02` BLOCKED; `AG-03` BLOCKED; `AG-04` PARTIAL; `AG-05` BLOCKED.
- TN: `TN-01` BLOCKED; `TN-02` BLOCKED; `TN-03` BLOCKED; `TN-04` BLOCKED; `TN-05` BLOCKED; `TN-06` BLOCKED; `TN-07` PARTIAL; `TN-08` NOT RUN.
- RB: `RB-01` BLOCKED; `RB-02` BLOCKED; `RB-03` BLOCKED; `RB-04` BLOCKED; `RB-05` BLOCKED; `RB-06` BLOCKED; `RB-07` BLOCKED; `RB-08` BLOCKED; `RB-09` NOT RUN.
- AU: `AU-01` BLOCKED; `AU-02` BLOCKED; `AU-03` BLOCKED; `AU-04` BLOCKED; `AU-05` PASS; `AU-06` NOT RUN; `AU-07` NOT RUN.
- TE: `TE-01` BLOCKED; `TE-02` BLOCKED; `TE-03` BLOCKED; `TE-04` BLOCKED; `TE-05` BLOCKED; `TE-06` BLOCKED; `TE-07` BLOCKED; `TE-08` BLOCKED; `TE-09` BLOCKED; `TE-10` BLOCKED; `TE-11` NOT RUN.
- CR: `CR-01` BLOCKED; `CR-02` BLOCKED; `CR-03` NOT RUN; `CR-04` BLOCKED; `CR-05` BLOCKED.
- OP: `OP-01` BLOCKED; `OP-02` BLOCKED; `OP-03` BLOCKED; `OP-04` BLOCKED; `OP-05` NOT RUN; `OP-06` BLOCKED; `OP-07` BLOCKED; `OP-08` BLOCKED; `OP-09` BLOCKED.
- NT: `NT-01` BLOCKED; `NT-02` BLOCKED; `NT-03` NOT RUN; `NT-04` NOT RUN; `NT-05` NOT RUN; `NT-06` NOT RUN; `NT-07` BLOCKED.
- SE: `SE-01` BLOCKED; `SE-02` BLOCKED; `SE-03` BLOCKED; `SE-04` PARTIAL; `SE-05` BLOCKED; `SE-06` BLOCKED; `SE-07` NOT RUN; `SE-08` NOT RUN; `SE-09` NOT RUN.

## Observations requiring later verification

- Daily, Weekly, and Monthly buttons visibly change selection, but all production values are zero. Weekly selection still shows labels such as `Today GMV`; this is not yet a confirmed defect because there is no non-zero data with which to validate aggregation.
- Empty mandatory agency and tenant forms prevent submission. Malformed-value API responses were not tested because no approved QA identity/dataset was available.

## QA data created

None. No agency, tenant, outlet, role, user, order, credit request, support case, or notification was created.

## Inputs required for the full run

1. An approved QA agency-owner phone number and synthetic agency dataset.
2. An approved QA tenant-owner phone number and synthetic tenant dataset.
3. Approved test phones for Onboarding Maker, Approval Checker, Audit Analyst, and Agency Operations Manager, or an explicit instruction defining which roles may share a phone identity.
4. The human user available to enter fresh TOTP directly in the UI when prompted. The code must not be sent to the tester.
5. A clean unauthenticated browser context for redirect and unauthenticated-session checks.

## Retest order

1. Unauthenticated P0/SA checks.
2. Agency creation and validation.
3. Tenant maker/checker onboarding.
4. RBAC assignment and role login.
5. Tenant catalog, quote, COD order, idempotency, and credit request.
6. Credit governance.
7. Operations acceptance and order-state transitions.
8. Notification/outbox verification.
9. Cross-role and cross-tenant security checks.
