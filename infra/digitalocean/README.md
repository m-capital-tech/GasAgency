# DigitalOcean deployment contract

The production cloud is DigitalOcean. The primary region is Bangalore: App Platform uses `blr`, while the associated regional resources and VPC use `blr1`.

The commercial product name is not finalized. Resource names therefore use neutral operational identifiers such as `commercial-lpg-production`; application behavior does not depend on the working name GasSetu or on a custom domain.

## Production topology

| Component | DigitalOcean target | Exposure |
|---|---|---|
| Admin dashboard | App Platform service | Public HTTPS; provider-generated domain initially |
| Production API | App Platform service | Public HTTPS through ingress |
| Background worker | App Platform worker | No public route |
| Migration job | App Platform job | Release-time only; database-owner credential |
| PostgreSQL | Managed PostgreSQL in `blr1` | Public TLS endpoint restricted to the App Platform app as its only trusted source |
| Documents | Private Spaces bucket in the closest supported region | Signed, short-lived access only |

The API, worker, and migration job are separate components and separate security principals. Runtime components do not receive the migration-owner credential.

## Environment contract

Values marked secret are configured through encrypted App Platform environment variables and never committed.

| Variable | Components | Classification | Purpose |
|---|---|---|---|
| `APP_ENV` | All | General | `production` in the active DigitalOcean app |
| `DATABASE_URL` | API, worker | Secret | App Platform database binding for the least-privilege runtime user; production uses the public TLS endpoint with CA-verified hostname checks and an app-only database firewall rule |
| `MIGRATION_DATABASE_URL` | Migration job only | Secret | Dedicated schema-owner binding supplied by App Platform during controlled releases |
| `DATABASE_RUNTIME_ROLE` | Migration job only | General | Pre-created login role that receives tightly scoped runtime grants after each migration |
| `SESSION_TOKEN_PEPPER` | API | Secret | Server-side session-token hashing pepper |
| `OTP_HASH_PEPPER` | API, worker | Secret | Server-side OTP hashing pepper |
| `OTP_DELIVERY_KEY` | API, worker | Secret | Independent base64 AES-256 key for OTP delivery envelopes |
| `MFA_ENCRYPTION_KEY` | API | Secret | Independent base64 AES-256 key for TOTP secret envelopes |
| `PUSH_TOKEN_ENCRYPTION_KEY` | API | Secret | Independent base64 AES-256 key for Expo push-token envelopes; never reuse an OTP or MFA key |
| `MFA_TICKET_PEPPER` | API | Secret | Independent HMAC pepper for MFA tickets and recovery codes |
| `MFA_ISSUER` | API | General | Neutral product label shown by authenticator apps |
| `PRIVILEGED_SESSION_TTL_SECONDS` | API | General | MFA-verified privileged session lifetime; default 8 hours, maximum 24 hours |
| `PUBLIC_APP_ORIGIN` | API | General | Admin dashboard origin; provider URL until a domain exists |
| `PUBLIC_API_ORIGIN` | Dashboard/mobile builds | General | Public API base URL |
| `PLATFORM_API_URL` | Dashboard server | General | Server-side production API origin used by the `/operations` gateway; never exposed to browser code |
| `OBJECT_STORAGE_ENDPOINT` | API, worker | General | Spaces S3-compatible endpoint |
| `OBJECT_STORAGE_BUCKET` | API, worker | General | Environment-specific private bucket |
| `OBJECT_STORAGE_ACCESS_KEY` | API, worker | Secret | Dedicated application credential |
| `OBJECT_STORAGE_SECRET_KEY` | API, worker | Secret | Dedicated application credential |
| `LOG_LEVEL` | API, worker | General | Structured-log verbosity |
| `MESSAGE_PROVIDER` | Worker | General | Provider adapter selector; `messageindia` in the planned production integration |
| `MESSAGEINDIA_SEND_URL` | Worker | General | Provider-issued HTTPS submission endpoint; plaintext HTTP is rejected |
| `MESSAGEINDIA_TRANSPORT` | Worker | General | Must be `post` in staging/production so credentials are never placed in URLs |
| `MESSAGEINDIA_USERNAME` | Worker | Secret | MessageIndia account identifier |
| `MESSAGEINDIA_API_KEY` | Worker | Secret | MessageIndia API credential stored only as an encrypted runtime variable |
| `MESSAGEINDIA_SENDER_NAME` | Worker | General | Approved six-character DLT sender header |
| `MESSAGEINDIA_ENTITY_ID` | Worker | General | TRAI DLT principal entity ID |
| `MESSAGEINDIA_*_TEMPLATE_ID` | Worker | General | Approved DLT template IDs for login OTP, tenant registration and platform access |
| `MESSAGEINDIA_*_TEMPLATE_TEXT` | Worker | General | Exact approved DLT bodies with controlled placeholders |

The MessageIndia adapter is implemented behind the provider-neutral contract. Its credentials and DLT configuration are intentionally absent from the version-controlled production specification until the provider supplies a working HTTPS endpoint and all three templates are approved. WhatsApp variables remain absent until that fallback provider is selected.

## Version-controlled production specification

`app.production.template.yaml` follows the current App Platform specification and keeps all repository identities, database identities, and secrets as unresolved tokens. It defines:

- the Next.js dashboard as the public root service;
- the production API under the preserved `/v1` path;
- internal dashboard-to-API traffic through `http://api`;
- readiness and liveness checks for both services;
- a `PRE_DEPLOY` migration job that runs before application rollout;
- an idempotent post-migration grant step that limits the runtime database role to application DML and denies schema creation or broad deletes;
- an existing managed PostgreSQL 16 cluster attached through separate runtime and migration bindings, with its public TLS endpoint restricted to the app as the only trusted source;
- Bangalore App Platform region `blr`, Node.js 22 from the root engine declaration, and the root pnpm workspace build context.

The messaging worker is intentionally not present in the production specification yet. Although the real adapter now exists, the inspected MessageIndia account exposes no DLT template or entity IDs and its dashboard documents a plaintext HTTP endpoint. The advertised public HTTPS path did not resolve to an API. Add the worker only after MessageIndia supplies an operational HTTPS endpoint, the three DLT templates, encrypted credentials, and a delivery smoke test plan.

## Production budget guardrail

The approved production ceiling is **USD 45 per month including applicable Indian GST**. The current specification therefore uses:

- a 512 MiB shared API service (`apps-s-1vcpu-0.5gb`);
- a fixed 1 GiB shared dashboard service (`apps-s-1vcpu-1gb-fixed`);
- a 512 MiB pre-deploy migration job, billed only while it runs; and
- a single-node 1 GiB managed PostgreSQL cluster.

The ordinary recurring services cost approximately USD 30.15 before tax, or USD 35.58 with 18% GST: USD 15 for the API and dashboard plus USD 15.15 for PostgreSQL. DigitalOcean's proposal also presents the release job at its USD 5 monthly rate even though jobs are charged only while running; the conservative proposal total is therefore USD 35.15 before tax, or about USD 41.48 with GST.

A future 512 MiB messaging worker would raise the conservative proposal to about USD 47.38 with GST. It must not be enabled until the footprint is reduced or the ceiling is explicitly changed. Spaces, high availability, dedicated CPUs, dedicated egress IPs, additional database nodes, and autoscaling likewise require separate approval.

Treat USD 45 as an authorization ceiling, not as a DigitalOcean-enforced hard cap. Review the provider's proposal before creation and monitor month-to-date billing after deployment.

The generated `.do/app.yaml` is git-ignored because first submission contains plaintext values that App Platform encrypts. Render it only on an authorized operator machine:

```bash
export DO_GITHUB_REPOSITORY='owner/repository'
export DO_GITHUB_BRANCH='main'
export DO_DATABASE_CLUSTER='existing-managed-postgres-cluster-name'
export DO_DATABASE_NAME='platform_staging'
export DO_DATABASE_RUNTIME_USER='platform_runtime'
export DO_DATABASE_MIGRATION_USER='platform_migrator'

export SESSION_TOKEN_PEPPER='independent-random-secret-at-least-32-characters'
export OTP_HASH_PEPPER='another-independent-random-secret-at-least-32-characters'
export OTP_DELIVERY_KEY='canonical-base64-encoded-32-byte-key'
export MFA_ENCRYPTION_KEY='another-canonical-base64-encoded-32-byte-key'
export PUSH_TOKEN_ENCRYPTION_KEY='a-third-canonical-base64-encoded-32-byte-key'
export MFA_TICKET_PEPPER='another-independent-random-secret-at-least-32-characters'

pnpm deploy:production:render -- .do/app.yaml
```

The database runtime login must already exist, must not own schema objects, and must not inherit any other PostgreSQL role. The release job applies migrations as the schema owner and then grants only schema usage, table read/write access, sequence usage, and the single delete permission required for authentication rate-limit expiry.

The renderer refuses missing or malformed values, unresolved tokens, and local-only authentication controls. It creates the output with mode `0600` and never prints a secret value.

After installing and authenticating `doctl`, validate structure before any paid resource is created:

```bash
doctl apps spec validate .do/app.yaml --schema-only
doctl apps propose --spec .do/app.yaml
```

`propose` returns the resolved configuration and projected cost without creating the app. Review it, confirm the target project ID and component prices, then explicitly create production:

```bash
doctl apps create \
  --spec .do/app.yaml \
  --project-id '<confirmed-project-id>' \
  --wait
```

After App Platform encrypts the first-submission secrets, download its canonical encrypted spec for future updates and remove the local plaintext rendering:

```bash
doctl apps spec get '<app-id>' --format yaml
```

The active production checkout follows this rule: `.do/app.yaml` is mode `0600`, git-ignored, contains DigitalOcean-encrypted `EV[...]` values, and contains no plaintext PostgreSQL URL. Temporary local database passwords and connection exports are removed after deployment.

Deploy-on-push remains disabled until authorization and provider-delivery smoke tests have passed in production.

## Active production deployment

The environment was provisioned on 9 October 2026 and promoted in place to production on 16 October 2026:

- app: `commercial-lpg-production` (`ba80d08f-c743-4c27-824d-1ec3fac0b8f2`);
- public URL: `https://commercial-lpg-staging-67i9v.ondigitalocean.app`;
- PostgreSQL: `commercial-lpg-staging-db` (`867eac0f-2d4e-480e-94ac-e587d51aedec`), database `platform_staging`; these legacy internal identifiers are retained to avoid a risky data migration and do not define the runtime environment;
- active deployment: `40235cce-3dfc-4512-923a-93cec3306fd0`, a successful manual release sourced from commit `f886baa`;
- database identities: `platform_runtime` for the API and `platform_migrator` for release migrations; and
- database firewall: the App Platform app is the only trusted source.

The DigitalOcean project environment, API `APP_ENV`, and dashboard `APP_ENV` are all set to `production`. Renaming the app does not rename the stable provider-generated hostname.

The active release reached `ACTIVE` after the pre-deploy migration job and both service health checks passed. The public `/v1`, `/control/login`, `/operations/login`, and `/operations/accounts` routes passed HTTPS smoke tests; protected admin, session, agency-account, and tenant-billing routes rejected unauthenticated requests with HTTP 401. DigitalOcean reports source hash `f886baa`, and automatic deployment remains disabled.

### 16 October 2026 commercial-account release

- GitHub `main` release commit `f886baa` was deployed manually as deployment `40235cce-3dfc-4512-923a-93cec3306fd0`.
- The pre-deploy job applied `0009_agency_commercial_controls` and successfully reapplied the least-privilege grants for `platform_runtime` before service cutover.
- DigitalOcean recorded the API readiness probe at HTTP 200 and the Next.js service ready before marking the deployment live.
- Public smoke tests returned HTTP 200 for `/v1`, `/control/login`, `/operations/login`, and `/operations/accounts`. Unauthenticated `/v1/admin/overview`, `/v1/auth/session`, `/v1/agencies/:agency/accounts`, and `/v1/tenants/:tenant/billing` returned HTTP 401.
- The API component reports source hash `f886baa`; automatic deployment remains Off.

### 16 October 2026 release verification

- The previous rollback pin was removed through DigitalOcean's zero-downtime revert-rollback operation, then current GitHub `main` at `f33ad65` was deployed manually.
- The migration job completed successfully, the API readiness check reached HTTP 200, the dashboard became ready, and deployment `bfb0b0af-e1e6-46e9-926f-a7fabe409c1f` went live.
- Public smoke tests returned HTTP 200 for `/v1`, `/control/login`, and `/operations/login`; unauthenticated `/v1/admin/overview` and `/v1/auth/session` requests returned HTTP 401; an unknown-number OTP request returned the enumeration-safe HTTP 202 response without exposing account existence.
- A fresh disposable local PostgreSQL database applied all eight migrations. All eight SQL verification suites, all seven API tests including delegated RBAC/onboarding/order/fulfilment, and all five worker tests including encrypted OTP outbox delivery passed. The test database was dropped after confirming zero active sessions.
- Repository-wide type checking passed for all 11 targets and all production build targets passed. Local tooling used Node.js 26 while repository and DigitalOcean builds target Node.js 22; the live DigitalOcean release built and ran under the configured Node.js 22 contract.

## Recovery drill evidence

The first staging recovery drills completed on 9 October 2026.

### Logical database restore

- PostgreSQL 16 client tools created a compressed logical backup of `platform_staging` and restored it into a uniquely named temporary database on the same managed cluster. The source database remained online and unchanged.
- The 221,696-byte staging backup reached a queryable restored state in 22 seconds. This is an observed empty-staging recovery time, not a production recovery-time objective; it will increase with data volume.
- The restored database contained the same 47 application tables, all 8 migration records, identical schema-object inventory, identical column catalog, and identical data dump.
- Migration idempotence, all eight SQL verification suites, and the least-privilege runtime grant policy passed against the restored database.
- The temporary database and its logical backup were deleted after verification. Temporary local credentials were removed, and the managed database firewall was restored to its single App Platform trusted source.
- The drill used client tools matching the server's PostgreSQL 16 major version. Recovery automation must keep this version match explicit.

DigitalOcean also reported an automated managed backup. Restoring that provider backup creates a new primary cluster, so a full managed-backup or point-in-time cluster restore remains a separate pre-production drill with an explicitly approved temporary cost and cleanup window.

### Application rollback

- Forced deployment `edd15686-6793-46c5-9cce-0768e3830c9d` built commit `79d3f5d`, reached `ACTIVE` at 14/14 steps, and passed all three public route checks.
- The app was then rolled back to known-good deployment `dbf5d0ae-6a93-4bfd-93e0-115b5f42ac74`. DigitalOcean created rollback deployment `a4009638-cfad-41df-9313-b344e14b9450`, which reached `ACTIVE` at 14/14 steps from commit `27a03ee`.
- `/v1`, `/control/login`, and `/operations/login` returned HTTP 200 after rollback. Database data and migration history remained intact.

## Provisioning and release gate

Current status:

- [x] The production API and worker components exist and build as deployable artifacts.
- [x] The repository is connected to the organization GitHub remote.
- [x] The initial schema, verification suite, and outbox concurrency test pass locally.
- [x] The DigitalOcean project is confirmed and both paid resources are assigned to it.
- [x] A secret-safe App Platform production template and validated renderer exist.
- [x] The managed database, separate runtime/migration users, app-only firewall rule, migrations, and runtime grant verification are complete.
- [x] The first App Platform deployment and public route smoke tests pass.
- [x] A real MessageIndia SMS adapter with enforced HTTPS, DLT mapping, credential redaction, timeout handling, and unit tests exists.
- [ ] MessageIndia supplies an operational HTTPS endpoint plus approved entity/template IDs before enabling the worker or login smoke tests.
- [x] An isolated logical database restore and an App Platform rollback passed before the in-place production promotion.
- [ ] A managed-backup or point-in-time cluster restore passes as a production operations drill.
- [ ] Authorization and real-provider delivery smoke tests pass before external tenant onboarding begins.

The temporary bootstrap API token is retained only until the operator confirms revocation. Future routine deployments should use a narrowly scoped team credential or CI identity rather than a personal bootstrap token.
