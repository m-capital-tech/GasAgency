begin;

create table app.delivery_staff (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  agency_id bigint not null references app.agencies (id),
  user_id bigint not null unique references app.users (id),
  status text not null default 'active',
  vehicle_type text not null,
  vehicle_number text not null,
  created_by_user_id bigint not null references app.users (id),
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_staff_status_check check (status in ('active', 'suspended', 'archived')),
  constraint delivery_staff_vehicle_type_check check (length(btrim(vehicle_type)) between 2 and 80),
  constraint delivery_staff_vehicle_number_check check (length(btrim(vehicle_number)) between 4 and 32),
  constraint delivery_staff_agency_user_unique unique (agency_id, user_id)
);

create index delivery_staff_agency_status_idx on app.delivery_staff (agency_id, status, id);
create index delivery_staff_created_by_user_id_idx on app.delivery_staff (created_by_user_id);

create table app.agency_inventory (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  agency_id bigint not null references app.agencies (id),
  cylinder_type_id bigint not null references app.cylinder_types (id),
  full_on_hand integer not null default 0,
  empty_on_hand integer not null default 0,
  reserved_full integer not null default 0,
  with_accounts integer not null default 0,
  low_stock_threshold integer not null default 10,
  updated_by_user_id bigint references app.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_inventory_counts_check check (
    full_on_hand >= 0 and empty_on_hand >= 0 and reserved_full >= 0
    and with_accounts >= 0 and low_stock_threshold >= 0
    and reserved_full <= full_on_hand
  ),
  constraint agency_inventory_agency_cylinder_unique unique (agency_id, cylinder_type_id)
);

create index agency_inventory_cylinder_type_id_idx on app.agency_inventory (cylinder_type_id);
create index agency_inventory_updated_by_user_id_idx on app.agency_inventory (updated_by_user_id);
create index agency_inventory_low_stock_idx
on app.agency_inventory (agency_id, full_on_hand)
where full_on_hand - reserved_full <= low_stock_threshold;

alter table app.orders
  add column assigned_delivery_staff_id bigint references app.delivery_staff (id),
  add column empties_collected integer not null default 0,
  add column accepted_at timestamptz,
  add column assigned_at timestamptz,
  add column dispatched_at timestamptz,
  add column failure_reason text;

alter table app.orders
  add constraint orders_empties_collected_check check (empties_collected >= 0),
  add constraint orders_failure_reason_check check (failure_reason is null or length(btrim(failure_reason)) >= 3);

alter table app.orders drop constraint orders_payment_status_check;
alter table app.orders
  add constraint orders_payment_status_check check (
    payment_status in ('pending', 'paid', 'failed', 'cod_pending', 'cod_collected', 'credit_reserved', 'credit_due', 'refunded', 'voided')
  );

create index orders_assigned_delivery_staff_open_idx
on app.orders (assigned_delivery_staff_id, status, created_at)
where assigned_delivery_staff_id is not null and status in ('assigned', 'out_for_delivery', 'delivery_failed');

create table app.order_empty_collections (
  order_id bigint not null references app.orders (id),
  cylinder_type_id bigint not null references app.cylinder_types (id),
  quantity integer not null,
  created_at timestamptz not null default now(),
  primary key (order_id, cylinder_type_id),
  constraint order_empty_collections_quantity_check check (quantity > 0)
);

create index order_empty_collections_cylinder_type_id_idx on app.order_empty_collections (cylinder_type_id);

create table app.agency_inventory_events (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  agency_inventory_id bigint not null references app.agency_inventory (id),
  order_id bigint references app.orders (id),
  actor_user_id bigint references app.users (id),
  event_type text not null,
  full_delta integer not null default 0,
  empty_delta integer not null default 0,
  reserved_delta integer not null default 0,
  with_accounts_delta integer not null default 0,
  full_balance integer not null,
  empty_balance integer not null,
  reserved_balance integer not null,
  with_accounts_balance integer not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  constraint agency_inventory_events_type_check check (event_type in ('opening_balance', 'reservation', 'reservation_release', 'dispatch', 'dispatch_return', 'delivery', 'empty_return', 'adjustment')),
  constraint agency_inventory_events_balances_check check (
    full_balance >= 0 and empty_balance >= 0 and reserved_balance >= 0
    and with_accounts_balance >= 0 and reserved_balance <= full_balance
  ),
  constraint agency_inventory_events_reason_check check (length(btrim(reason)) >= 3),
  constraint agency_inventory_events_delta_check check (
    full_delta <> 0 or empty_delta <> 0 or reserved_delta <> 0 or with_accounts_delta <> 0
  )
);

create index agency_inventory_events_inventory_occurred_idx on app.agency_inventory_events (agency_inventory_id, occurred_at, id);
create index agency_inventory_events_order_id_idx on app.agency_inventory_events (order_id);
create index agency_inventory_events_actor_user_id_idx on app.agency_inventory_events (actor_user_id);

create function app.prevent_inventory_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'inventory events are append-only' using errcode = '55000';
end;
$$;

create trigger agency_inventory_events_no_update
before update on app.agency_inventory_events
for each row execute function app.prevent_inventory_event_mutation();

create trigger agency_inventory_events_no_delete
before delete on app.agency_inventory_events
for each row execute function app.prevent_inventory_event_mutation();

insert into app.schema_migrations (version) values ('0006_agency_fulfillment');

commit;
