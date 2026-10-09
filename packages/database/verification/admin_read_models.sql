begin;

do $$
begin
  if not exists (select 1 from app.schema_migrations where version = '0007_admin_read_models') then
    raise exception 'migration ledger entry 0007_admin_read_models missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'tenants_status_created_public_idx') then
    raise exception 'tenant keyset pagination index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'tenants_created_public_idx') then
    raise exception 'unfiltered tenant keyset pagination index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'orders_created_tenant_idx') then
    raise exception 'order analytics time index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'invoices_tenant_outstanding_due_idx') then
    raise exception 'scoped receivables index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'role_assignments_active_created_idx') then
    raise exception 'active team roster index missing';
  end if;
end $$;

rollback;
