begin;

do $$
begin
  if not exists (select 1 from app.schema_migrations where version = '0004_messaging_and_otp_security') then
    raise exception 'migration ledger entry 0004_messaging_and_otp_security is missing';
  end if;
  if to_regclass('app.auth_rate_events') is null then
    raise exception 'auth rate event table is missing';
  end if;
  if to_regclass('app.message_deliveries') is null then
    raise exception 'message delivery table is missing';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'app' and table_name = 'otp_challenges' and column_name = 'delivery_status'
  ) then
    raise exception 'otp challenge delivery status is missing';
  end if;
end;
$$;

rollback;
