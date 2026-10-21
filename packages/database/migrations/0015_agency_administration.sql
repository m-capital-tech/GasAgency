begin;

alter table app.agencies
  drop constraint agencies_status_check,
  add column owner_user_id bigint references app.users (id),
  add column address_line_1 text,
  add column address_line_2 text,
  add column pincode text,
  add column latitude numeric(9, 6),
  add column longitude numeric(9, 6),
  add column service_radius_km numeric(6, 2),
  add column submitted_at timestamptz,
  add column suspended_at timestamptz,
  add column archived_at timestamptz,
  add constraint agencies_status_check check (status in ('pending', 'changes_requested', 'rejected', 'approved', 'suspended', 'archived')),
  add constraint agencies_pincode_check check (pincode is null or pincode ~ '^[1-9][0-9]{5}$'),
  add constraint agencies_latitude_check check (latitude is null or latitude between -90 and 90),
  add constraint agencies_longitude_check check (longitude is null or longitude between -180 and 180),
  add constraint agencies_service_radius_check check (service_radius_km is null or service_radius_km > 0),
  add constraint agencies_address_check check (address_line_1 is null or length(btrim(address_line_1)) >= 3),
  add constraint agencies_geography_complete_check check (
    (latitude is null and longitude is null and service_radius_km is null)
    or (latitude is not null and longitude is not null and service_radius_km is not null)
  );

create index agencies_owner_user_id_idx on app.agencies (owner_user_id) where owner_user_id is not null;
create index agencies_status_submitted_idx on app.agencies (status, submitted_at, id);

create table app.agency_service_pincodes (
  agency_id bigint not null references app.agencies (id),
  pincode text not null,
  created_at timestamptz not null default now(),
  primary key (agency_id, pincode),
  constraint agency_service_pincodes_format_check check (pincode ~ '^[1-9][0-9]{5}$')
);

create index agency_service_pincodes_pincode_idx on app.agency_service_pincodes (pincode, agency_id);

create table app.agency_reviews (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  agency_id bigint not null references app.agencies (id),
  reviewer_user_id bigint not null references app.users (id),
  decision text not null,
  from_status text not null,
  to_status text not null,
  reason text not null,
  override_used boolean not null default false,
  created_at timestamptz not null default now(),
  constraint agency_reviews_decision_check check (decision in ('changes_requested', 'rejected', 'approved', 'suspended', 'reinstated', 'archived')),
  constraint agency_reviews_status_check check (
    from_status in ('pending', 'changes_requested', 'rejected', 'approved', 'suspended', 'archived')
    and to_status in ('pending', 'changes_requested', 'rejected', 'approved', 'suspended', 'archived')
  ),
  constraint agency_reviews_reason_check check (length(btrim(reason)) between 3 and 1000)
);

create index agency_reviews_agency_created_idx on app.agency_reviews (agency_id, created_at desc, id desc);
create index agency_reviews_reviewer_user_id_idx on app.agency_reviews (reviewer_user_id);

create function app.prevent_agency_self_approval()
returns trigger
language plpgsql
as $$
declare
  creator_id bigint;
begin
  if new.decision = 'approved' and not new.override_used then
    select created_by_user_id into creator_id from app.agencies where id = new.agency_id;
    if creator_id = new.reviewer_user_id then
      raise exception 'agency creator cannot approve their own submission' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger agency_reviews_prevent_self_approval
before insert on app.agency_reviews
for each row execute function app.prevent_agency_self_approval();

create function app.prevent_agency_review_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'agency reviews are append-only' using errcode = '55000';
end;
$$;

create trigger agency_reviews_immutable
before update or delete on app.agency_reviews
for each row execute function app.prevent_agency_review_mutation();

insert into app.schema_migrations (version) values ('0015_agency_administration');

commit;
