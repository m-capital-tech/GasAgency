begin;

do $$
begin
  if to_regclass('app.platform_revenue_entries') is null
     or to_regclass('app.support_cases') is null
     or to_regclass('app.support_case_events') is null then
    raise exception 'dashboard coverage tables are missing';
  end if;

  if not exists (select 1 from app.schema_migrations where version = '0014_dashboard_data_coverage') then
    raise exception 'dashboard data coverage migration is missing';
  end if;

  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'platform_revenue_entries_occurred_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'support_cases_queue_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'support_case_events_case_occurred_idx') then
    raise exception 'dashboard coverage access-path index is missing';
  end if;

  if has_table_privilege('public', 'app.platform_revenue_entries', 'select')
     or has_table_privilege('public', 'app.support_cases', 'select') then
    raise exception 'PUBLIC must not read dashboard coverage data';
  end if;

  if not exists (select 1 from pg_trigger where tgrelid = 'app.platform_revenue_entries'::regclass and tgname = 'platform_revenue_entries_immutable')
     or not exists (select 1 from pg_trigger where tgrelid = 'app.support_case_events'::regclass and tgname = 'support_case_events_immutable') then
    raise exception 'append-only coverage ledger trigger is missing';
  end if;
end $$;

rollback;
