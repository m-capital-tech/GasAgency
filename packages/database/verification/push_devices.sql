begin;

do $$
declare
  timestamp_columns integer;
begin
  if to_regclass('app.push_devices') is null then raise exception 'push_devices missing'; end if;
  if not exists (select 1 from app.schema_migrations where version = '0010_push_devices') then
    raise exception 'migration ledger entry 0010_push_devices missing';
  end if;
  if not exists (
    select 1
      from pg_constraint constraint_row
     where constraint_row.conrelid = 'app.push_devices'::regclass
       and constraint_row.conname = 'push_devices_provider_digest_unique'
       and constraint_row.contype = 'u'
  ) then
    raise exception 'push-device provider/token uniqueness constraint missing';
  end if;
  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'app'
       and indexname = 'push_devices_active_delivery_idx'
       and indexdef like '%WHERE (status = ''active''::text)%'
  ) then
    raise exception 'active push-device partial index missing';
  end if;
  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'app'
       and indexname = 'push_devices_last_registered_session_id_idx'
  ) then
    raise exception 'push-device session foreign-key index missing';
  end if;
  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'app'
       and indexname = 'push_devices_user_id_idx'
  ) then
    raise exception 'push-device user foreign-key leading index missing';
  end if;

  select count(*)
    into timestamp_columns
    from information_schema.columns
   where table_schema = 'app'
     and table_name = 'push_devices'
     and column_name in ('first_registered_at', 'last_registered_at', 'stale_at', 'revoked_at', 'updated_at')
     and data_type = 'timestamp with time zone';
  if timestamp_columns <> 5 then raise exception 'push-device timestamps must all use timestamptz'; end if;

  if exists (
    select 1
      from information_schema.table_privileges
     where table_schema = 'app'
       and table_name = 'push_devices'
       and grantee = 'PUBLIC'
  ) then
    raise exception 'PUBLIC must not receive push-device table privileges';
  end if;
end $$;

rollback;
