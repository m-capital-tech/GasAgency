# Production database foundation

This package owns forward-only PostgreSQL migrations for the production platform. It is deliberately separate from the in-memory demo engine.

It also exports the bounded PostgreSQL pool, short-transaction helper, readiness query, and concurrency-safe transactional-outbox operations used by the production API and worker.

## Current scope

`0001_foundation.sql` establishes the production primitives required before feature APIs are connected:

- person identities and revocable device sessions;
- Super Admin, Platform Admin, platform-team, agency, tenant, and delivery RBAC;
- tenant drafts, outlets, LPG requirements, maker-checker reviews, and explicit agency assignments;
- invitations, SMS/WhatsApp delivery attempts, and hashed OTP challenges;
- commercial and credit accounts with admin-owned credit decisions;
- idempotency records, a transactional outbox, and immutable audit events.

`0002_auth_rbac_onboarding.sql` adds MFA-aware session metadata, proposed agency-assignment state, and separately reviewable commercial proposals. `0003_approval_and_invitation_guard.sql` adds platform-team access invitations, queued-invitation indexes, and a database guard that forbids tenant invitations before activation.

`0004_messaging_and_otp_security.sql` adds hashed authentication rate events, OTP delivery state, generic provider delivery receipts, partial pending indexes, and the lookup index used for active phone/purpose challenges.

`0005_tenant_ordering.sql` adds agency and negotiated account prices, volume slabs, agency delivery policies, expiring quote snapshots, idempotent order records, append-only order status events, and invoice/exposure foundations. It also creates default delivery slots for existing and future agencies and indexes the hot credit and receivables paths.

`0006_agency_fulfillment.sql` adds agency delivery staff, per-cylinder inventory balances, open-order staff indexes, typed empty-cylinder receipts, order fulfillment timestamps, and an append-only inventory movement ledger. Its database triggers prevent inventory ledger mutation after insert.

`0007_admin_read_models.sql` adds the composite and partial indexes used by scoped Platform Control queues, keyset pagination, time-windowed order analytics, outstanding receivables, active team assignments, and approved-agency selection.

`0008_privileged_mfa.sql` adds encrypted TOTP factor records, short-lived hashed phone-to-MFA handoff tickets, replay state, and individually hashed one-time recovery codes. Partial indexes cover only current factors, live tickets, and unused recovery codes.

`0009_agency_commercial_controls.sql` adds an append-only agency payment collection ledger, invoice allocations, cross-account integrity guards, and timeline indexes. Agencies can record collections without receiving authority over platform-owned credit limits or net terms.

`0010_push_devices.sql` adds tenant-owned Expo push-device registrations. Raw provider tokens are never indexed or stored in plaintext: a SHA-256 digest provides installation uniqueness while an authenticated encryption envelope preserves the token for delivery. A token can belong to only one current user, preventing an account switch on the same installation from leaving notifications attached to the previous user. Explicit active, stale, and revoked states retain lifecycle state without broad deletes.

`0011_push_delivery_ledger.sql` adds an idempotent event/device delivery ledger for provider-neutral push processing. It records only bounded provider references and safe error codes, keeps accepted, retryable-failure, exhausted, and stale outcomes inspectable, and prevents the same outbox event from creating more than one delivery identity for a device.

Payment-provider records, agency replenishment/adjustment workflows, driver authentication and delivery proof, and durable analytics projections will be added in later migrations. They should not be inferred from the demo store.

## Identifier and data rules

- Internal joins use `bigint generated always as identity` keys.
- API-visible identifiers are application-generated UUIDv7 values stored as `public_id`.
- Timestamps use `timestamptz`; money uses exact `numeric` values.
- Domain states use text plus database check constraints so application and database rules remain inspectable.
- Every foreign-key access path has a leading-column index.
- Sensitive session/ticket tokens, OTP values, and recovery codes are stored only as hashes. TOTP seeds and push-provider tokens use dedicated authenticated encryption envelopes with domain-bound associated data; push tokens also have a one-way digest for lookup and uniqueness.

## Applying the migration

Do not point these commands at production until the migration has passed against a disposable database and staging restore has been tested.

```bash
pnpm --filter @platform/database build
MIGRATION_DATABASE_URL='postgresql://...' pnpm --filter @platform/database migrate
DATABASE_URL='postgresql://...' pnpm --filter @platform/database verify
```

Use the database-owner connection only for migrations. The runtime API and worker must use a separate least-privilege login with connection pooling. Secrets belong in DigitalOcean encrypted environment variables, never in this repository.

After migrations, apply the idempotent runtime privilege policy with the same schema-owner connection:

```bash
MIGRATION_DATABASE_URL='postgresql://schema-owner:...' \
DATABASE_RUNTIME_ROLE='platform_runtime' \
DATABASE_SSL_MODE='verify-full' \
DATABASE_CA_CERT='-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----' \
  pnpm --filter @platform/database grant:runtime
```

The command refuses missing, non-login, owner-equivalent, or elevated runtime roles. It grants schema usage; table `SELECT`, `INSERT`, and `UPDATE`; sequence usage; and `DELETE` only on bounded authentication rate events. It revokes runtime DDL, broad deletes, and function execution, applies equivalent default privileges for future migration-owned objects, then verifies the effective permissions.

Run the outbox concurrency test against a disposable or staging database:

```bash
DATABASE_URL='postgresql://...' DATABASE_SSL_MODE=disable \
  pnpm --filter @platform/database test:integration
```

The migration is intentionally forward-only and records itself in `app.schema_migrations`. Do not run the same file twice and do not edit an applied migration; add a new numbered migration instead.
