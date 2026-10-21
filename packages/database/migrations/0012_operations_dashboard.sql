begin;

-- Agency dashboards filter the order fact table by agency and reporting window.
-- The existing (agency_id, status, created_at) index cannot efficiently serve a
-- time-window scan when every status is included.
create index orders_agency_created_idx
on app.orders (agency_id, created_at desc, id desc);

insert into app.schema_migrations (version) values ('0012_operations_dashboard');

commit;
