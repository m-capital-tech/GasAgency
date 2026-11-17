begin;

alter table app.outlets
  alter column latitude drop not null,
  alter column longitude drop not null;

insert into app.schema_migrations (version) values ('0019_optional_vendor_coordinates');

commit;
