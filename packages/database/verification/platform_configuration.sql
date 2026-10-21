begin;

do $$
declare
  setting_count integer;
begin
  if to_regclass('app.platform_settings') is null then
    raise exception 'platform settings table is missing';
  end if;

  if not exists (select 1 from app.schema_migrations where version = '0013_platform_configuration') then
    raise exception 'platform configuration migration is missing';
  end if;

  select count(*) into setting_count from app.platform_settings;
  if setting_count <> 10 then
    raise exception 'expected 10 governed platform settings, found %', setting_count;
  end if;

  if exists (
    select 1 from app.platform_settings where jsonb_typeof(value) <> value_type
  ) then
    raise exception 'platform setting value types are inconsistent';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'app' and indexname = 'platform_settings_category_key_idx'
  ) then
    raise exception 'platform settings category index is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'app' and indexname = 'platform_settings_updated_by_user_id_idx'
  ) then
    raise exception 'platform settings actor index is missing';
  end if;

  if has_table_privilege('public', 'app.platform_settings', 'select') then
    raise exception 'PUBLIC must not read platform configuration';
  end if;
end $$;

rollback;
