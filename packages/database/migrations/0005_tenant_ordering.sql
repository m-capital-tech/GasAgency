begin;

alter table app.agencies
  add column cod_enabled boolean not null default true,
  add column max_cylinders_per_order integer not null default 20,
  add column delivery_fee numeric(12, 2) not null default 0,
  add column gst_rate numeric(5, 2) not null default 18.00;

alter table app.agencies
  add constraint agencies_order_policy_check check (
    max_cylinders_per_order between 1 and 500
    and delivery_fee >= 0
    and gst_rate between 0 and 100
  );

create table app.agency_delivery_slots (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  agency_id bigint not null references app.agencies (id),
  slot_code text not null,
  display_name text not null,
  surcharge numeric(12, 2) not null default 0,
  max_cylinders integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_delivery_slots_code_check check (slot_code in ('before_opening', 'standard', 'evening', 'express')),
  constraint agency_delivery_slots_surcharge_check check (surcharge >= 0),
  constraint agency_delivery_slots_max_check check (max_cylinders is null or max_cylinders > 0),
  constraint agency_delivery_slots_agency_code_unique unique (agency_id, slot_code)
);

create index agency_delivery_slots_active_idx on app.agency_delivery_slots (agency_id, slot_code) where active;

create function app.create_default_agency_delivery_slots()
returns trigger
language plpgsql
as $$
begin
  insert into app.agency_delivery_slots (public_id, agency_id, slot_code, display_name, surcharge)
  values
    (gen_random_uuid(), new.id, 'before_opening', 'Before opening', 0),
    (gen_random_uuid(), new.id, 'standard', 'Standard delivery', 0),
    (gen_random_uuid(), new.id, 'evening', 'Evening delivery', 0),
    (gen_random_uuid(), new.id, 'express', 'Express delivery', 99);
  return new;
end;
$$;

create trigger agencies_create_default_delivery_slots
after insert on app.agencies
for each row execute function app.create_default_agency_delivery_slots();

insert into app.agency_delivery_slots (public_id, agency_id, slot_code, display_name, surcharge)
select gen_random_uuid(), agency.id, slot.slot_code, slot.display_name, slot.surcharge
from app.agencies agency
cross join (values
  ('before_opening', 'Before opening', 0::numeric),
  ('standard', 'Standard delivery', 0::numeric),
  ('evening', 'Evening delivery', 0::numeric),
  ('express', 'Express delivery', 99::numeric)
) as slot(slot_code, display_name, surcharge);

create table app.agency_prices (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  agency_id bigint not null references app.agencies (id),
  cylinder_type_id bigint not null references app.cylinder_types (id),
  base_unit_price numeric(12, 2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_prices_amount_check check (base_unit_price > 0),
  constraint agency_prices_agency_cylinder_unique unique (agency_id, cylinder_type_id)
);

create index agency_prices_active_catalog_idx on app.agency_prices (agency_id, cylinder_type_id) where active;
create index agency_prices_cylinder_type_id_idx on app.agency_prices (cylinder_type_id);

create table app.agency_price_slabs (
  id bigint generated always as identity primary key,
  agency_price_id bigint not null references app.agency_prices (id) on delete cascade,
  min_quantity integer not null,
  unit_price numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  constraint agency_price_slabs_quantity_check check (min_quantity >= 2),
  constraint agency_price_slabs_amount_check check (unit_price > 0),
  constraint agency_price_slabs_price_quantity_unique unique (agency_price_id, min_quantity)
);

create table app.commercial_account_prices (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  commercial_account_id bigint not null references app.commercial_accounts (id),
  cylinder_type_id bigint not null references app.cylinder_types (id),
  unit_price numeric(12, 2) not null,
  active boolean not null default true,
  set_by_user_id bigint references app.users (id),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_account_prices_amount_check check (unit_price > 0),
  constraint commercial_account_prices_reason_check check (reason is null or length(btrim(reason)) >= 3),
  constraint commercial_account_prices_account_cylinder_unique unique (commercial_account_id, cylinder_type_id)
);

create index commercial_account_prices_active_idx on app.commercial_account_prices (commercial_account_id, cylinder_type_id) where active;
create index commercial_account_prices_cylinder_type_id_idx on app.commercial_account_prices (cylinder_type_id);
create index commercial_account_prices_set_by_user_id_idx on app.commercial_account_prices (set_by_user_id);

create table app.order_quotes (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  tenant_id bigint not null references app.tenants (id),
  outlet_id bigint not null references app.outlets (id),
  agency_id bigint not null references app.agencies (id),
  commercial_account_id bigint not null references app.commercial_accounts (id),
  quoted_by_user_id bigint not null references app.users (id),
  delivery_slot text not null,
  payment_method text not null,
  subtotal numeric(14, 2) not null,
  delivery_fee numeric(12, 2) not null,
  slot_surcharge numeric(12, 2) not null,
  taxable_amount numeric(14, 2) not null,
  gst_rate numeric(5, 2) not null,
  gst_amount numeric(14, 2) not null,
  total_amount numeric(14, 2) not null,
  pricing_signature bytea not null,
  credit_snapshot jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint order_quotes_slot_check check (delivery_slot in ('before_opening', 'standard', 'evening', 'express')),
  constraint order_quotes_payment_check check (payment_method in ('upi', 'card', 'netbanking', 'cod', 'credit')),
  constraint order_quotes_amounts_check check (
    subtotal > 0 and delivery_fee >= 0 and slot_surcharge >= 0
    and taxable_amount > 0 and gst_rate between 0 and 100 and gst_amount >= 0 and total_amount > 0
  ),
  constraint order_quotes_expiry_check check (expires_at > created_at),
  constraint order_quotes_consumed_check check (consumed_at is null or consumed_at >= created_at)
);

create index order_quotes_user_active_idx on app.order_quotes (quoted_by_user_id, expires_at desc) where consumed_at is null;
create index order_quotes_tenant_created_idx on app.order_quotes (tenant_id, created_at desc);
create index order_quotes_outlet_id_idx on app.order_quotes (outlet_id);
create index order_quotes_agency_id_idx on app.order_quotes (agency_id);
create index order_quotes_commercial_account_id_idx on app.order_quotes (commercial_account_id);

create table app.order_quote_items (
  order_quote_id bigint not null references app.order_quotes (id) on delete cascade,
  cylinder_type_id bigint not null references app.cylinder_types (id),
  quantity integer not null,
  base_unit_price numeric(12, 2) not null,
  effective_unit_price numeric(12, 2) not null,
  price_source text not null,
  line_subtotal numeric(14, 2) not null,
  primary key (order_quote_id, cylinder_type_id),
  constraint order_quote_items_quantity_check check (quantity > 0),
  constraint order_quote_items_amounts_check check (base_unit_price > 0 and effective_unit_price > 0 and line_subtotal > 0),
  constraint order_quote_items_source_check check (price_source in ('base', 'slab', 'negotiated'))
);

create index order_quote_items_cylinder_type_id_idx on app.order_quote_items (cylinder_type_id);

create table app.orders (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  order_number text not null unique,
  tenant_id bigint not null references app.tenants (id),
  outlet_id bigint not null references app.outlets (id),
  agency_id bigint not null references app.agencies (id),
  commercial_account_id bigint not null references app.commercial_accounts (id),
  placed_by_user_id bigint not null references app.users (id),
  source_quote_id bigint not null unique references app.order_quotes (id),
  status text not null,
  payment_method text not null,
  payment_status text not null,
  delivery_slot text not null,
  requested_delivery_date date,
  empties_expected integer not null default 0,
  delivery_instructions text,
  subtotal numeric(14, 2) not null,
  delivery_fee numeric(12, 2) not null,
  slot_surcharge numeric(12, 2) not null,
  taxable_amount numeric(14, 2) not null,
  gst_rate numeric(5, 2) not null,
  gst_amount numeric(14, 2) not null,
  total_amount numeric(14, 2) not null,
  placed_at timestamptz,
  cancelled_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_status_check check (status in ('pending_payment', 'payment_failed', 'placed', 'accepted', 'assigned', 'out_for_delivery', 'delivery_failed', 'delivered', 'rejected', 'cancelled')),
  constraint orders_payment_method_check check (payment_method in ('upi', 'card', 'netbanking', 'cod', 'credit')),
  constraint orders_payment_status_check check (payment_status in ('pending', 'paid', 'failed', 'cod_pending', 'credit_reserved', 'refunded')),
  constraint orders_delivery_slot_check check (delivery_slot in ('before_opening', 'standard', 'evening', 'express')),
  constraint orders_empties_check check (empties_expected >= 0),
  constraint orders_amounts_check check (
    subtotal > 0 and delivery_fee >= 0 and slot_surcharge >= 0
    and taxable_amount > 0 and gst_rate between 0 and 100 and gst_amount >= 0 and total_amount > 0
  )
);

create index orders_tenant_created_idx on app.orders (tenant_id, created_at desc);
create index orders_agency_status_created_idx on app.orders (agency_id, status, created_at);
create index orders_outlet_created_idx on app.orders (outlet_id, created_at desc);
create index orders_commercial_account_credit_exposure_idx
on app.orders (commercial_account_id, created_at)
where payment_method = 'credit' and status not in ('delivered', 'rejected', 'cancelled');
create index orders_placed_by_user_id_idx on app.orders (placed_by_user_id);

create table app.order_items (
  order_id bigint not null references app.orders (id),
  cylinder_type_id bigint not null references app.cylinder_types (id),
  cylinder_code text not null,
  cylinder_display_name text not null,
  quantity integer not null,
  unit_price numeric(12, 2) not null,
  price_source text not null,
  line_subtotal numeric(14, 2) not null,
  primary key (order_id, cylinder_type_id),
  constraint order_items_quantity_check check (quantity > 0),
  constraint order_items_amounts_check check (unit_price > 0 and line_subtotal > 0),
  constraint order_items_source_check check (price_source in ('base', 'slab', 'negotiated'))
);

create index order_items_cylinder_type_id_idx on app.order_items (cylinder_type_id);

create table app.order_status_events (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  order_id bigint not null references app.orders (id),
  from_status text,
  to_status text not null,
  actor_user_id bigint references app.users (id),
  reason text,
  occurred_at timestamptz not null default now(),
  constraint order_status_events_from_check check (from_status is null or from_status in ('pending_payment', 'payment_failed', 'placed', 'accepted', 'assigned', 'out_for_delivery', 'delivery_failed', 'delivered', 'rejected', 'cancelled')),
  constraint order_status_events_to_check check (to_status in ('pending_payment', 'payment_failed', 'placed', 'accepted', 'assigned', 'out_for_delivery', 'delivery_failed', 'delivered', 'rejected', 'cancelled')),
  constraint order_status_events_reason_check check (reason is null or length(btrim(reason)) >= 3)
);

create index order_status_events_order_occurred_idx on app.order_status_events (order_id, occurred_at, id);
create index order_status_events_actor_user_id_idx on app.order_status_events (actor_user_id);

create table app.invoices (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  invoice_number text not null unique,
  order_id bigint not null unique references app.orders (id),
  tenant_id bigint not null references app.tenants (id),
  commercial_account_id bigint not null references app.commercial_accounts (id),
  status text not null,
  taxable_amount numeric(14, 2) not null,
  gst_amount numeric(14, 2) not null,
  total_amount numeric(14, 2) not null,
  outstanding_amount numeric(14, 2) not null,
  issued_at timestamptz not null,
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invoices_status_check check (status in ('open', 'overdue', 'paid', 'void')),
  constraint invoices_amounts_check check (
    taxable_amount > 0 and gst_amount >= 0 and total_amount > 0
    and outstanding_amount >= 0 and outstanding_amount <= total_amount
  ),
  constraint invoices_due_check check (due_at is null or due_at >= issued_at),
  constraint invoices_paid_check check (paid_at is null or paid_at >= issued_at)
);

create index invoices_tenant_issued_idx on app.invoices (tenant_id, issued_at desc);
create index invoices_commercial_account_outstanding_idx
on app.invoices (commercial_account_id, due_at)
where status in ('open', 'overdue') and outstanding_amount > 0;

insert into app.schema_migrations (version) values ('0005_tenant_ordering');

commit;
