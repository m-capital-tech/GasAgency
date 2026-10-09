begin;

do $$
begin
  if to_regclass('app.mfa_factors') is null then raise exception 'mfa_factors missing'; end if;
  if to_regclass('app.mfa_login_tickets') is null then raise exception 'mfa_login_tickets missing'; end if;
  if to_regclass('app.mfa_recovery_codes') is null then raise exception 'mfa_recovery_codes missing'; end if;
  if not exists (select 1 from app.schema_migrations where version = '0008_privileged_mfa') then
    raise exception 'migration ledger entry 0008_privileged_mfa missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'mfa_factors_one_current_per_user_idx') then
    raise exception 'one-current-factor partial unique index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'mfa_login_tickets_active_expiry_idx') then
    raise exception 'active MFA ticket index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'mfa_recovery_codes_available_idx') then
    raise exception 'available recovery-code index missing';
  end if;
end $$;

rollback;
