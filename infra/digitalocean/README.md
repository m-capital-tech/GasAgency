# DigitalOcean deployment contract

The production cloud is DigitalOcean. The primary region is Bangalore: App Platform uses `blr`, while the associated regional resources and VPC use `blr1`.

The commercial product name is not finalized. Resource names should therefore use neutral operational identifiers such as `commercial-lpg-staging-api`; application behavior must not depend on the working name GasSetu or on a custom domain.

## Staging topology

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
| `APP_ENV` | All | General | `staging` or `production` |
| `DATABASE_URL` | API, worker | Secret | App Platform database binding for the least-privilege runtime user; staging uses the public TLS endpoint with CA-verified hostname checks and an app-only database firewall rule |
| `MIGRATION_DATABASE_URL` | Migration job only | Secret | Dedicated schema-owner binding supplied by App Platform during controlled releases |
| `DATABASE_RUNTIME_ROLE` | Migration job only | General | Pre-created login role that receives tightly scoped runtime grants after each migration |
| `SESSION_TOKEN_PEPPER` | API | Secret | Server-side session-token hashing pepper |
| `OTP_HASH_PEPPER` | API, worker | Secret | Server-side OTP hashing pepper |
| `OTP_DELIVERY_KEY` | API, worker | Secret | Independent base64 AES-256 key for OTP delivery envelopes |
| `MFA_ENCRYPTION_KEY` | API | Secret | Independent base64 AES-256 key for TOTP secret envelopes |
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

SMS and WhatsApp variables are intentionally absent until the Phase 2 provider selection. They will be introduced as provider-neutral adapter configuration rather than embedded vendor names.

## Version-controlled staging specification

`app.staging.template.yaml` follows the current App Platform specification and keeps all repository identities, database identities, and secrets as unresolved tokens. It defines:

- the Next.js dashboard as the public root service;
- the production API under the preserved `/v1` path;
- internal dashboard-to-API traffic through `http://api`;
- readiness and liveness checks for both services;
- a `PRE_DEPLOY` migration job that runs before application rollout;
- an idempotent post-migration grant step that limits the runtime database role to application DML and denies schema creation or broad deletes;
- an existing managed PostgreSQL 16 cluster attached through separate runtime and migration bindings, with its public TLS endpoint restricted to the app as the only trusted source;
- Bangalore App Platform region `blr`, Node.js 22 from the root engine declaration, and the root pnpm workspace build context.

The messaging worker is intentionally not present in the staging specification yet. Its runtime rejects the local provider in staging/production, so deploying it before a real provider adapter exists would create a permanently failing component. Add the worker only with the provider adapter and its encrypted credentials.

## Staging budget guardrail

The approved staging ceiling is **USD 45 per month including applicable Indian GST**. The initial specification therefore uses:

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
export MFA_TICKET_PEPPER='another-independent-random-secret-at-least-32-characters'

pnpm deploy:staging:render -- .do/app.yaml
```

The database runtime login must already exist, must not own schema objects, and must not inherit any other PostgreSQL role. The release job applies migrations as the schema owner and then grants only schema usage, table read/write access, sequence usage, and the single delete permission required for authentication rate-limit expiry.

The renderer refuses missing or malformed values, unresolved tokens, and local-only authentication controls. It creates the output with mode `0600` and never prints a secret value.

After installing and authenticating `doctl`, validate structure before any paid resource is created:

```bash
doctl apps spec validate .do/app.yaml --schema-only
doctl apps propose --spec .do/app.yaml
```

`propose` returns the resolved configuration and projected cost without creating the app. Review it, confirm the target project ID and component prices, then explicitly create staging:

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

The active staging checkout follows this rule: `.do/app.yaml` is mode `0600`, git-ignored, contains DigitalOcean-encrypted `EV[...]` values, and contains no plaintext PostgreSQL URL. Temporary local database passwords and connection exports are removed after deployment.

Do not enable deploy-on-push until database restore, rollback, authorization, and provider-delivery smoke tests have all passed in staging.

## Active staging deployment

Staging was provisioned in the confirmed DigitalOcean project on 9 October 2026:

- app: `commercial-lpg-staging` (`ba80d08f-c743-4c27-824d-1ec3fac0b8f2`);
- public URL: `https://commercial-lpg-staging-67i9v.ondigitalocean.app`;
- PostgreSQL: `commercial-lpg-staging-db` (`867eac0f-2d4e-480e-94ac-e587d51aedec`), database `platform_staging`;
- deployment: `dbf5d0ae-6a93-4bfd-93e0-115b5f42ac74`, sourced from commit `27a03ee`;
- database identities: `platform_runtime` for the API and `platform_migrator` for release migrations; and
- database firewall: the App Platform app is the only trusted source.

The release reached `ACTIVE` with all 14 deployment steps complete. The public `/v1`, `/control/login`, and `/operations/login` routes passed HTTPS smoke tests. Automatic deployment remains disabled.

## Provisioning and release gate

Current status:

- [x] The production API and worker components exist and build as deployable artifacts.
- [x] The repository is connected to the organization GitHub remote.
- [x] The initial schema, verification suite, and outbox concurrency test pass locally.
- [x] The DigitalOcean project is confirmed and both paid resources are assigned to it.
- [x] A secret-safe App Platform staging template and validated renderer exist.
- [x] The managed database, separate runtime/migration users, app-only firewall rule, migrations, and runtime grant verification are complete.
- [x] The first App Platform deployment and public route smoke tests pass.
- [ ] A real SMS provider adapter and staging credentials exist before enabling the worker or login smoke tests.
- [ ] Database restore and application rollback drills pass before enabling automatic deployment.
- [ ] Authorization and real-provider delivery smoke tests pass before production promotion.

The temporary bootstrap API token is retained only until the operator confirms revocation. Future routine deployments should use a narrowly scoped team credential or CI identity rather than a personal bootstrap token.
