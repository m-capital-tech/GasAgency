do $$
begin
  if not exists (
    select 1 from app.schema_migrations where version = '0012_operations_dashboard'
  ) then
    raise exception 'operations dashboard migration is missing';
  end if;

  if not exists (
    select 1
      from pg_indexes
     where schemaname = 'app'
       and indexname = 'orders_agency_created_idx'
       and indexdef like '%(agency_id, created_at DESC, id DESC)%'
  ) then
    raise exception 'agency reporting-window order index is missing';
  end if;
end $$;
