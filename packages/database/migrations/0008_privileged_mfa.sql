begin;

create table app.mfa_factors (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  user_id bigint not null references app.users (id),
  factor_type text not null default 'totp',
  label text not null,
  secret_envelope text not null,
  status text not null default 'pending',
  verified_at timestamptz,
  last_used_step bigint,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mfa_factors_type_check check (factor_type = 'totp'),
  constraint mfa_factors_status_check check (status in ('pending', 'active', 'revoked')),
  constraint mfa_factors_label_check check (length(btrim(label)) between 2 and 120),
  constraint mfa_factors_secret_check check (length(secret_envelope) >= 40),
  constraint mfa_factors_state_check check (
    (status = 'pending' and verified_at is null and revoked_at is null)
    or (status = 'active' and verified_at is not null and revoked_at is null)
    or (status = 'revoked' and revoked_at is not null)
  )
);

create unique index mfa_factors_one_current_per_user_idx
on app.mfa_factors (user_id)
where status in ('pending', 'active');

create table app.mfa_login_tickets (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  user_id bigint not null references app.users (id),
  token_hash bytea not null unique,
  phone_verified_at timestamptz not null,
  expires_at timestamptz not null,
  attempts_remaining smallint not null default 5,
  consumed_at timestamptz,
  device_name text,
  device_identifier_hash bytea,
  created_ip inet,
  created_at timestamptz not null default now(),
  constraint mfa_login_tickets_expiry_check check (expires_at > phone_verified_at),
  constraint mfa_login_tickets_attempts_check check (attempts_remaining between 0 and 10),
  constraint mfa_login_tickets_device_name_check check (device_name is null or length(btrim(device_name)) between 1 and 120)
);

create index mfa_login_tickets_user_id_idx on app.mfa_login_tickets (user_id);
create index mfa_login_tickets_active_expiry_idx
on app.mfa_login_tickets (expires_at)
where consumed_at is null and attempts_remaining > 0;

create table app.mfa_recovery_codes (
  id bigint generated always as identity primary key,
  factor_id bigint not null references app.mfa_factors (id) on delete cascade,
  code_hash bytea not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mfa_recovery_codes_factor_hash_unique unique (factor_id, code_hash)
);

create index mfa_recovery_codes_available_idx
on app.mfa_recovery_codes (factor_id, id)
where consumed_at is null;

insert into app.schema_migrations (version) values ('0008_privileged_mfa');

commit;
