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
| PostgreSQL | Managed PostgreSQL in `blr1` | Private VPC/trusted sources only |
| Documents | Private Spaces bucket in the closest supported region | Signed, short-lived access only |

The API, worker, and migration job are separate components and separate security principals. Runtime components do not receive the migration-owner credential.

## Environment contract

Values marked secret are configured through encrypted App Platform environment variables and never committed.

| Variable | Components | Classification | Purpose |
|---|---|---|---|
| `APP_ENV` | All | General | `staging` or `production` |
| `DATABASE_URL` | API, worker | Secret | Private, least-privilege PostgreSQL connection; add a pooler after its staging limits are measured |
| `MIGRATION_DATABASE_URL` | Migration job only | Secret | Schema-owner connection used during controlled releases |
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
- an existing managed PostgreSQL 16 cluster attached through its private bindable URL and CA certificate;
- Bangalore App Platform region `blr`, Node.js 22 from the root engine declaration, and the root pnpm workspace build context.

The messaging worker is intentionally not present in the staging specification yet. Its runtime rejects the local provider in staging/production, so deploying it before a real provider adapter exists would create a permanently failing component. Add the worker only with the provider adapter and its encrypted credentials.

The generated `.do/app.yaml` is git-ignored because first submission contains plaintext values that App Platform encrypts. Render it only on an authorized operator machine:

```bash
export DO_GITHUB_REPOSITORY='owner/repository'
export DO_GITHUB_BRANCH='main'
export DO_DATABASE_CLUSTER='existing-managed-postgres-cluster-name'
export DO_DATABASE_NAME='platform_staging'
export DO_DATABASE_RUNTIME_USER='platform_runtime'

export MIGRATION_DATABASE_URL='postgresql://schema-owner:...@private-host:25060/platform_staging'
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

Do not enable deploy-on-push until database restore, rollback, authorization, and provider-delivery smoke tests have all passed in staging.

## Provisioning gate

Do not create paid staging resources yet. Provisioning starts after:

- [x] The production API and worker components exist and build as deployable artifacts.
- [ ] The repository is connected to a supported Git remote.
- [x] The initial schema, verification suite, and outbox concurrency test pass locally.
- [ ] The DigitalOcean team/project owner and access list are confirmed.
- [x] A secret-safe App Platform staging template and validated renderer exist.
- [ ] A real SMS provider adapter and staging credentials exist before enabling the worker or login smoke tests.

The local checkout currently has no Git remote and no authenticated `doctl` installation. The template can therefore be reviewed and tested locally, but it must not be submitted until the repository, project, managed database cluster, runtime database user, and migration-owner URL are confirmed.
