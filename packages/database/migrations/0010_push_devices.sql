begin;

create table app.push_devices (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  user_id bigint not null references app.users (id),
  last_registered_session_id bigint not null references app.device_sessions (id),
  provider text not null,
  token_digest bytea not null,
  token_envelope text not null,
  platform text not null,
  project_id uuid not null,
  app_version text,
  status text not null default 'active',
  status_reason text,
  first_registered_at timestamptz not null default now(),
  last_registered_at timestamptz not null default now(),
  stale_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint push_devices_provider_digest_unique unique (provider, token_digest),
  constraint push_devices_provider_check check (provider = 'expo'),
  constraint push_devices_token_digest_check check (octet_length(token_digest) = 32),
  constraint push_devices_token_envelope_check check (length(token_envelope) between 40 and 1024),
  constraint push_devices_platform_check check (platform in ('android', 'ios')),
  constraint push_devices_app_version_check check (app_version is null or length(btrim(app_version)) between 1 and 64),
  constraint push_devices_status_check check (status in ('active', 'stale', 'revoked')),
  constraint push_devices_status_reason_check check (status_reason is null or length(btrim(status_reason)) between 3 and 160),
  constraint push_devices_registration_period_check check (
    last_registered_at >= first_registered_at and updated_at >= first_registered_at
  ),
  constraint push_devices_state_check check (
    (status = 'active' and stale_at is null and revoked_at is null)
    or (status = 'stale' and stale_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create index push_devices_last_registered_session_id_idx
on app.push_devices (last_registered_session_id);

create index push_devices_user_id_idx
on app.push_devices (user_id);

create index push_devices_active_delivery_idx
on app.push_devices (provider, project_id, last_registered_at, id)
where status = 'active';

revoke all on app.push_devices from public;

insert into app.schema_migrations (version) values ('0010_push_devices');

commit;
