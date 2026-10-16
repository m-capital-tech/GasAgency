begin;

do $$
declare
  timestamp_columns integer;
begin
  if to_regclass('app.push_deliveries') is null then raise exception 'push_deliveries missing'; end if;
  if not exists (select 1 from app.schema_migrations where version = '0011_push_delivery_ledger') then
    raise exception 'migration ledger entry 0011_push_delivery_ledger missing';
  end if;
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'app.push_deliveries'::regclass
       and conname = 'push_deliveries_event_device_unique'
       and contype = 'u'
  ) then
    raise exception 'event/device push-delivery idempotency constraint missing';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'app' and indexname = 'push_deliveries_push_device_id_idx'
  ) then
    raise exception 'push-delivery device foreign-key index missing';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'app' and indexname = 'push_deliveries_provider_reference_unique_idx'
       and lower(indexdef) like '%where%provider_reference%is not null%'
  ) then
    raise exception 'push-delivery provider-reference uniqueness index missing';
  end if;
  if not exists (
    select 1 from pg_indexes
     where schemaname = 'app' and indexname = 'push_deliveries_retryable_failed_idx'
       and lower(indexdef) like '%where%status%failed%retryable%'
  ) then
    raise exception 'retryable push-delivery partial index missing';
  end if;

  select count(*) into timestamp_columns
    from information_schema.columns
   where table_schema = 'app' and table_name = 'push_deliveries'
     and column_name in ('last_attempt_at', 'accepted_at', 'failed_at', 'stale_at', 'created_at', 'updated_at')
     and data_type = 'timestamp with time zone';
  if timestamp_columns <> 6 then raise exception 'push-delivery timestamps must all use timestamptz'; end if;

  if exists (
    select 1 from information_schema.table_privileges
     where table_schema = 'app' and table_name = 'push_deliveries' and grantee = 'PUBLIC'
  ) then
    raise exception 'PUBLIC must not receive push-delivery table privileges';
  end if;
end $$;

rollback;
