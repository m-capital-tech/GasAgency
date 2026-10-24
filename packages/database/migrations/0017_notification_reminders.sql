begin;

create index invoices_notification_schedule_idx
on app.invoices (due_at, id)
include (public_id, tenant_id, invoice_number, outstanding_amount)
where status in ('open', 'overdue') and outstanding_amount > 0 and due_at is not null;

create index tenant_requirements_weekly_days_idx
on app.tenant_requirements using gin (preferred_delivery_days)
where period = 'week' and cardinality(preferred_delivery_days) > 0;

insert into app.schema_migrations (version) values ('0017_notification_reminders');

commit;
