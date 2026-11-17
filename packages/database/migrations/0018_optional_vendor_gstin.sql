begin;

alter table app.tenants alter column gstin drop not null;

insert into app.schema_migrations (version) values ('0018_optional_vendor_gstin');

commit;
