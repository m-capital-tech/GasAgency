begin;

do $$
begin
  if not exists (select 1 from app.schema_migrations where version = '0017_notification_reminders') then
    raise exception 'notification reminder migration is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'app'
       and indexname = 'invoices_notification_schedule_idx'
       and lower(indexdef) like '%where%status%outstanding_amount%0%due_at%is not null%'
  ) then
    raise exception 'invoice notification schedule partial index is missing';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'app'
       and indexname = 'tenant_requirements_weekly_days_idx'
       and lower(indexdef) like '%using gin%preferred_delivery_days%'
  ) then
    raise exception 'weekly tenant requirement schedule index is missing';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'app.outbox_events'::regclass
       and conname = 'outbox_events_dedupe_key_key'
       and contype = 'u'
  ) then
    raise exception 'scheduled notification dedupe constraint is missing';
  end if;
end $$;

rollback;
