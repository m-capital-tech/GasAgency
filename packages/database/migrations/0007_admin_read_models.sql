begin;

create index tenants_status_created_public_idx
on app.tenants (status, created_at desc, public_id desc);

create index tenants_created_public_idx
on app.tenants (created_at desc, public_id desc);

create index orders_created_tenant_idx
on app.orders (created_at desc, tenant_id);

create index invoices_tenant_outstanding_due_idx
on app.invoices (tenant_id, due_at)
where status in ('open', 'overdue') and outstanding_amount > 0;

create index role_assignments_active_created_idx
on app.role_assignments (created_at desc, id)
where status = 'active';

create index agencies_status_display_name_idx
on app.agencies (status, display_name, public_id);

insert into app.schema_migrations (version) values ('0007_admin_read_models');

commit;
