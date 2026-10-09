begin;

alter table app.otp_challenges
  add column delivery_status text not null default 'queued';

alter table app.otp_challenges
  add constraint otp_challenges_delivery_status_check
  check (delivery_status in ('queued', 'sent', 'delivered', 'failed'));

create index otp_challenges_active_phone_purpose_idx
on app.otp_challenges (phone_e164, purpose, created_at desc)
where consumed_at is null and invalidated_at is null;

create table app.auth_rate_events (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  event_type text not null,
  key_hash bytea not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint auth_rate_events_type_check check (event_type in ('otp_request_phone', 'otp_request_ip', 'otp_verify_failure')),
  constraint auth_rate_events_expiry_check check (expires_at > created_at)
);

create index auth_rate_events_key_window_idx on app.auth_rate_events (event_type, key_hash, created_at desc);
create index auth_rate_events_expiry_idx on app.auth_rate_events (expires_at);

create table app.message_deliveries (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  message_kind text not null,
  aggregate_public_id uuid not null,
  channel text not null,
  provider text not null,
  template_name text not null,
  template_version text not null,
  destination_e164 text not null,
  idempotency_key text not null unique,
  status text not null default 'queued',
  provider_reference text,
  attempt_count integer not null default 0,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint message_deliveries_kind_check check (message_kind in ('tenant_invitation', 'platform_user_invitation', 'login_otp')),
  constraint message_deliveries_channel_check check (channel in ('sms', 'whatsapp')),
  constraint message_deliveries_destination_check check (destination_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint message_deliveries_status_check check (status in ('queued', 'sent', 'delivered', 'failed')),
  constraint message_deliveries_attempt_count_check check (attempt_count >= 0)
);

create unique index message_deliveries_provider_reference_unique_idx
on app.message_deliveries (provider, provider_reference)
where provider_reference is not null;
create index message_deliveries_aggregate_idx on app.message_deliveries (message_kind, aggregate_public_id, created_at desc);
create index message_deliveries_pending_idx on app.message_deliveries (created_at, id)
where status in ('queued', 'failed');

insert into app.schema_migrations (version) values ('0004_messaging_and_otp_security');

commit;
