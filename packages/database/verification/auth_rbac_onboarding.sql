begin;

do $$
begin
  if not exists (select 1 from app.schema_migrations where version = '0002_auth_rbac_onboarding') then
    raise exception 'migration ledger entry 0002_auth_rbac_onboarding is missing';
  end if;

  if to_regclass('app.tenant_commercial_proposals') is null then
    raise exception 'required table app.tenant_commercial_proposals is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'app' and table_name = 'device_sessions' and column_name = 'mfa_verified_at'
  ) then
    raise exception 'device_sessions.mfa_verified_at is missing';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'app' and table_name = 'agency_assignments' and column_name = 'status'
  ) then
    raise exception 'agency_assignments.status is missing';
  end if;
end;
$$;

rollback;
