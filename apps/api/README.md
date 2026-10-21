# Production API

This service is separate from the investor-demo API. Its current protected production surface is:

- `GET /health/live` and `GET /health/ready`;
- `GET /v1` for the version marker;
- `POST /v1/auth/otp/request` and `POST /v1/auth/otp/verify` for enumeration-resistant tenant phone login;
- `POST /v1/auth/mfa/enroll`, `POST /v1/auth/mfa/enroll/verify`, and `POST /v1/auth/mfa/verify` for privileged authenticator enrollment, verification, and recovery-code login;
- `POST /v1/auth/mfa/step-up` for a fresh authenticator or one-time recovery-code check before privileged access changes;
- `GET /v1/auth/session` and `POST /v1/auth/logout` for session restoration and explicit revocation;
- `POST /v1/auth/push-devices` for active tenant users to register or revoke an Expo push token without storing it in plaintext;
- `POST /v1/admin/roles` for permission-ceiling-enforced Platform Admin/team roles;
- `POST /v1/admin/roles/:rolePublicId` for MFA-protected role editing, permission-ceiling changes, activation, and suspension;
- `POST /v1/admin/team-members` for scoped role assignment and SMS-first access invitation;
- `POST /v1/admin/team-members/:assignmentPublicId/lifecycle` for MFA-protected suspension, reinstatement, or revocation with immediate session invalidation;
- `POST /v1/admin/tenants` for an authenticated, authorized, idempotent tenant draft;
- `POST /v1/admin/tenants/:tenantPublicId/submit` for maker submission;
- `POST /v1/admin/tenants/:tenantPublicId/reviews` for changes, rejection, or approval/activation;
- `POST /v1/admin/tenants/:tenantPublicId/lifecycle` for scoped suspension or reinstatement;
- `POST /v1/admin/tenants/:tenantPublicId/credit-decisions` for platform-owned credit approval, limit/term changes, suspension, or reinstatement;
- `GET /v1/admin/overview` for scope-bounded daily, weekly, monthly, onboarding, and receivables summaries;
- `GET /v1/admin/dashboard?period=daily|weekly|monthly` for scope-bounded performance, onboarding, credit aging, support SLA, agency operations, exceptions, run-rate projection, audit activity, and Super Admin-only revenue/system indicators;
- `POST /v1/admin/revenue-entries` for fresh-MFA-protected Super Admin posting to the append-only platform revenue ledger;
- `GET|POST /v1/admin/support-cases` and `POST /v1/admin/support-cases/:supportCasePublicId/transitions` for scoped support intake, queue visibility, acknowledgement, work, resolution, reopening, closure, and comments;
- `GET /v1/admin/agencies` for approved agencies available within the actor's assignment scope;
- `GET /v1/admin/agency-registry` and `GET /v1/admin/agency-registry/:agencyPublicId` for the scope-bounded agency verification queue, owner profile, service area, and review history;
- `POST /v1/admin/agencies` for idempotent agency and owner registration with GSTIN, address, distributor, and service-area data;
- `POST /v1/admin/agencies/:agencyPublicId/reviews` for fresh-MFA maker-checker approval or rejection, and `POST /v1/admin/agencies/:agencyPublicId/lifecycle` for suspension or reinstatement with session revocation;
- `GET|POST /v1/admin/tenants/:tenantPublicId/documents` and `GET|POST /v1/admin/agencies/:agencyPublicId/documents` for scoped KYC evidence listing and raw private upload;
- `GET|POST /v1/agencies/:agencyPublicId/documents` for agency-owner document custody, `GET /v1/tenants/:tenantPublicId/documents` for active tenant-member visibility, and `GET /v1/documents/:documentPublicId/content` for permission-checked inline or attachment streaming;
- `POST /v1/documents/:documentPublicId/archive` for fresh-MFA, reasoned metadata archival without physical object deletion;
- `GET /v1/admin/tenants` and `GET /v1/admin/tenants/:tenantPublicId` for a keyset-paginated queue and complete review record;
- `GET /v1/admin/permissions`, `GET /v1/admin/roles`, and `GET /v1/admin/team-members` for permission-ceiling-aware team administration;
- `GET /v1/tenants/:tenantPublicId/home` for the tenant's outlets, stock, serving agency, account prices, slots, and payment eligibility;
- `GET /v1/tenants/:tenantPublicId/profile` and `POST /v1/tenants/:tenantPublicId/outlets/:outletPublicId` for the approved registration record and role-gated contact, handover, stock, and requirement maintenance;
- `GET /v1/tenants/:tenantPublicId/dashboard?period=daily|weekly|monthly` for tenant-only orders, consumption, delivery, GST, receivables, cylinder mix, outlet activity, and labelled stock-runway estimates;
- `GET|POST /v1/tenants/:tenantPublicId/support-cases` for audited tenant support and controlled-field change requests, including optional tenant-owned order linkage;
- `POST /v1/tenants/:tenantPublicId/quotes` for an expiring server-authoritative order quotation;
- `POST /v1/tenants/:tenantPublicId/orders` for idempotent COD or approved-credit order placement;
- `GET /v1/tenants/:tenantPublicId/orders` and `GET /v1/tenants/:tenantPublicId/orders/:orderPublicId` for tenant-scoped history, detail, and fulfillment timeline;
- `GET /v1/tenants/:tenantPublicId/billing` and `GET /v1/tenants/:tenantPublicId/invoices/:invoicePublicId` for tenant-scoped receivables, GST invoices, and allocated collections;
- `GET /v1/agencies/:agencyPublicId/orders` and `GET /v1/agencies/:agencyPublicId/orders/:orderPublicId` for the scoped fulfillment queue and order detail;
- `GET /v1/agencies/:agencyPublicId/delivery-staff` and `GET /v1/agencies/:agencyPublicId/inventory` for active delivery capacity and current cylinder custody;
- `POST /v1/agencies/:agencyPublicId/delivery-staff` and `POST /v1/agencies/:agencyPublicId/delivery-staff/:staffPublicId/lifecycle` for SMS-first staff invitation and access suspension or reinstatement;
- `POST /v1/agencies/:agencyPublicId/inventory/adjustments` for balance-checked, reasoned inventory corrections recorded in the append-only movement ledger;
- `POST /v1/agencies/:agencyPublicId/orders/:orderPublicId/transitions` for idempotent accept, reject, cancel, assign, dispatch, fail, reschedule, and deliver actions;
- `GET /v1/agencies/:agencyPublicId/accounts` and `GET /v1/agencies/:agencyPublicId/payments` for scoped commercial accounts, receivables, prices, and collection history;
- `POST /v1/agencies/:agencyPublicId/credit-policy` for an agency-wide credit availability switch;
- `POST /v1/agencies/:agencyPublicId/accounts/:accountPublicId/prices` for lower negotiated account prices; and
- `POST /v1/agencies/:agencyPublicId/accounts/:accountPublicId/payments` for idempotent, append-only collection recording and oldest-invoice-first allocation.

Draft creation, submission, and review are separate authorized transitions. Approval atomically activates the tenant and agency assignment, opens the commercial account, optionally approves credit, and queues the SMS-first tenant invitation. Tenant OTP verification activates invited memberships and issues an opaque, hashed, revocable session.

Tenant ordering is scoped through active membership, tenant, outlet, agency assignment, and commercial account records. The server selects base, slab, or lower negotiated pricing, calculates GST and delivery charges, stores an immutable quote snapshot, then recomputes policy and price inside the order transaction. Credit orders lock the commercial account before exposure is recalculated, preventing concurrent orders from overspending one limit. Online payment methods remain unavailable until a production payment adapter and webhook flow are connected.

Tenant self-service uses the same closed scope. Owners and managers can maintain operational outlet fields and LPG requirements; staff remain read-only. Legal identity, GSTIN/FSSAI, registered phone, outlet address, and serving-agency changes create auditable requests instead of mutating approved onboarding data. Tenant dashboards expose only the signed-in business, distinguish source-backed financial values from operational stock estimates, and use `Asia/Kolkata` reporting boundaries.

Agency fulfillment is scoped through active RBAC assignments and separates `order.view`, `order.edit`, and reserved `order.execute` authority. Acceptance reserves inventory, dispatch removes physical stock, failed delivery returns it, and completion records typed empties, outlet stock, account custody, payment state, and an invoice. Status, audit, outbox, inventory, and invoice effects commit atomically. The production web console is available at `/operations`; its Next.js gateway keeps the opaque API token in an HttpOnly cookie and requires the server-side `PLATFORM_API_URL` setting.

Agency account operations preserve the confirmed commercial boundary: agencies can pause new credit orders globally, set account-specific negotiated prices, and record invoice settlements. They cannot create credit approval, alter an account limit, or change net terms. Collection records and their invoice allocations are append-only at the database layer; overpayments are rejected until an advance-payment model is explicitly introduced.

Agency administration preserves a separate governance boundary. Platform users register the legal entity, owner, GSTIN, distributor, godown address, and service area; a different authorized reviewer must approve it unless Super Admin records an explicit override. Approval creates scoped owner access, enforces privileged MFA, initializes cylinder inventory, and queues the SMS-first invitation atomically. Agency owners can manage delivery staff and physical stock only inside their approved agency. Suspension revokes scoped live sessions without erasing the review or inventory history.

Private business documents use a provider-neutral object-storage contract. Production can select the S3-compatible DigitalOcean Spaces adapter; local/test can select a filesystem adapter whose paths are confined to one private root. The database stores versioned metadata and a SHA-256 digest, not file bytes. Uploads accept only PDF, JPEG, PNG, and WebP up to 10 MiB, verify magic bytes, use random non-PII object keys, and remain disabled unless both a storage provider and the `features.document_uploads` Super Admin control are enabled. Every view, download, upload, quarantine, and archive is appended to the document ledger. Downloads recheck size and digest before returning `private, no-store` content.

Platform Control is available at `/control`. Its read models apply the same RBAC assignments inside every database query, use keyset pagination for tenant lists, and calculate daily/weekly/monthly periods in `Asia/Kolkata`. Super Admin receives global results only through global scope; Platform Admin/team results remain bounded to their region, city, agency, selected agencies, or tenant. The command centre separates source-backed actuals from estimates: revenue comes only from its immutable posting ledger, support metrics come from the scoped case workflow, and the forecast card is explicitly labelled as an elapsed-period run-rate projection with an evidence threshold and confidence band. Platform revenue is restricted to Super Admin. The UI cannot bypass maker–checker, lifecycle, credit, role, or team-access permissions because every decision is re-authorized by the API. Suspending a tenant revokes its live sessions; reinstatement restores eligibility without silently altering its separately managed credit state.

## Super Admin bootstrap

Build first, then execute this once with the schema-owner connection. The command is safe to rerun for the same person and will report `changed: false` when nothing needs changing.

```bash
pnpm --filter @platform/api build

MIGRATION_DATABASE_URL='postgresql://...' \
DATABASE_SSL_MODE='verify-full' \
DATABASE_CA_CERT='-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----' \
BOOTSTRAP_SUPER_ADMIN_NAME='Founder name' \
BOOTSTRAP_SUPER_ADMIN_PHONE='+91...' \
BOOTSTRAP_SUPER_ADMIN_EMAIL='founder@example.com' \
BOOTSTRAP_REASON='Initial production authority bootstrap approved by ...' \
pnpm --filter @platform/api bootstrap:super-admin
```

The command does not issue credentials or bypass OTP/MFA. A second global Super Admin is rejected unless `ALLOW_ADDITIONAL_SUPER_ADMIN=true` is supplied after an explicit governance decision.

## Tenant draft contract

`POST /v1/admin/tenants` requires:

- `Authorization: Bearer <opaque session token>`;
- an MFA-verified session for privileged users;
- active `tenant.create` permission covering the selected city or agency;
- `Idempotency-Key` containing 8–128 safe characters;
- a checksum-valid GSTIN, approved agency, initial outlet, structured LPG requirement, and prepaid or proposed-credit terms.

Replaying the same key and normalized body returns the original `201` response with `Idempotent-Replayed: true`. Reusing the key for another body returns `409`.

## Delegation and approval rules

- A role cannot grant permissions its creator does not possess.
- Ordinary `platform_team` roles cannot contain reserved permissions such as tenant or credit approval.
- A Platform Admin can assign only roles managed by their account and only within an authorization scope they control.
- Creating or editing a role, appointing a privileged user, and suspending, reinstating, or revoking access requires an MFA verification no more than ten minutes old.
- Platform Admin assignments can be created or edited only by Super Admin; ordinary platform-team roles cannot acquire reserved permissions.
- Suspending a role or assignment immediately revokes affected active sessions. Administrators cannot change their own assignment from the dashboard.
- New privileged users remain `invited`, require MFA, and cannot create a session until phone verification activates the identity.
- Tenant creators submit drafts but cannot approve them. Super Admin self-approval requires an explicit audited override.
- Credit requests may be approved, rejected, or deferred. Deferred and rejected requests activate the tenant on prepaid terms; approved requests atomically create the credit account.
- Tenant and platform-team invitation events are committed through the transactional outbox. Local/test can process them through the local adapter; real environments remain fail-closed until a production SMS adapter is connected.

## Local OTP mode

Local and test environments may set `OTP_LOCAL_CODE=123456` and `OTP_LOCAL_EXPOSE_CODE=true`. The request response then includes `localDebugCode`; neither option is accepted in staging or production.

OTP codes are HMAC-hashed for verification and separately AES-256-GCM encrypted for worker delivery. Plaintext OTPs are never stored in the challenge table or outbox. Requests are limited by keyed phone and IP hashes, active challenges have resend windows, failed attempts persist, and codes are single-use.

Expo push tokens are SHA-256 digested for installation uniqueness and separately stored in an AES-256-GCM envelope. Registering the same installation after an account switch atomically reassigns it to the current authenticated tenant user so notifications cannot continue targeting a previous account. Set `PUSH_TOKEN_ENCRYPTION_KEY` to a dedicated canonical base64-encoded 32-byte key in staging and production; it must not reuse the OTP or MFA encryption keys. The token itself is excluded from responses, audit records, and application logs. Registrations retain explicit active, stale, and revoked lifecycle state instead of broad deletes.

Phone OTP activates tenant users. Privileged platform users with `mfa_required=true` receive a short-lived, hashed MFA ticket after phone verification—not an application session. First login enrolls a TOTP authenticator and returns ten one-time recovery codes once. Later logins require a fresh authenticator or unused recovery code. TOTP secrets are AES-256-GCM encrypted, repeated time steps are rejected, failed attempts are bounded, and only successful MFA creates an `otp_mfa` session. Privileged sessions default to eight hours and cannot be configured beyond 24 hours; tenant sessions retain their separate lifetime.

## Object storage configuration

`OBJECT_STORAGE_PROVIDER` accepts `disabled`, `local`, or `spaces` and defaults to `disabled`. `local` requires `OBJECT_STORAGE_LOCAL_ROOT` and is rejected in staging/production. `spaces` requires `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_BUCKET`, `OBJECT_STORAGE_ACCESS_KEY`, and `OBJECT_STORAGE_SECRET_KEY`; staging/production endpoints must use HTTPS. `OBJECT_STORAGE_MAX_BYTES` cannot exceed the schema-enforced 10 MiB ceiling. Keep the feature gate off until the private-bucket and recovery acceptance checklist in [`docs/DOCUMENT_STORAGE_POLICY.md`](../../docs/DOCUMENT_STORAGE_POLICY.md) passes.

## Tests

Unit tests run without external services. The database-backed integration suites exercise delegated onboarding, lifecycle and credit controls, agency registration and maker-checker approval, delivery-staff access, inventory custody, private document gating/upload/versioning/access/integrity/archive retention, tenant ordering/tracking/billing, agency fulfillment, negotiated pricing, credit availability, and append-only payment collection when a disposable migrated PostgreSQL database is supplied:

```bash
pnpm --filter @platform/api test
```

Database integration tests are skipped unless a disposable migrated PostgreSQL database is supplied:

```bash
TEST_DATABASE_URL='postgresql://...' node --import tsx --test apps/api/test/*.test.ts
```
