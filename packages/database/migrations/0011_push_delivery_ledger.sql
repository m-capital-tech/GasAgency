begin;

create table app.push_deliveries (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  outbox_event_id bigint not null references app.outbox_events (id),
  push_device_id bigint not null references app.push_devices (id),
  provider text not null,
  status text not null default 'queued',
  retryable boolean not null default false,
  provider_reference text,
  attempt_count integer not null default 0,
  last_error_code text,
  last_attempt_at timestamptz,
  accepted_at timestamptz,
  failed_at timestamptz,
  stale_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_deliveries_event_device_unique unique (outbox_event_id, push_device_id),
  constraint push_deliveries_provider_check check (provider = 'expo'),
  constraint push_deliveries_status_check check (status in ('queued', 'accepted', 'failed', 'stale')),
  constraint push_deliveries_attempt_count_check check (attempt_count >= 0),
  constraint push_deliveries_provider_reference_check check (
    provider_reference is null or length(btrim(provider_reference)) between 1 and 200
  ),
  constraint push_deliveries_error_code_check check (
    last_error_code is null or last_error_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,79}$'
  ),
  constraint push_deliveries_state_check check (
    (status = 'queued' and attempt_count = 0 and retryable = false and provider_reference is null
      and last_error_code is null and last_attempt_at is null and accepted_at is null and failed_at is null and stale_at is null)
    or
    (status = 'accepted' and attempt_count > 0 and retryable = false and provider_reference is not null
      and last_error_code is null and last_attempt_at is not null and accepted_at is not null and failed_at is null and stale_at is null)
    or
    (status = 'failed' and attempt_count > 0 and provider_reference is null
      and last_error_code is not null and last_attempt_at is not null and accepted_at is null and failed_at is not null and stale_at is null)
    or
    (status = 'stale' and attempt_count > 0 and retryable = false and provider_reference is null
      and last_error_code is not null and last_attempt_at is not null and accepted_at is null and failed_at is null and stale_at is not null)
  )
);

create index push_deliveries_push_device_id_idx
on app.push_deliveries (push_device_id);

create unique index push_deliveries_provider_reference_unique_idx
on app.push_deliveries (provider, provider_reference)
where provider_reference is not null;

create index push_deliveries_retryable_failed_idx
on app.push_deliveries (updated_at, id)
where status = 'failed' and retryable = true;

revoke all on app.push_deliveries from public;

insert into app.schema_migrations (version) values ('0011_push_delivery_ledger');

commit;
