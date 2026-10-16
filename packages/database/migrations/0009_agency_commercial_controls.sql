begin;

create table app.payment_collections (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  commercial_account_id bigint not null references app.commercial_accounts (id),
  agency_id bigint not null references app.agencies (id),
  tenant_id bigint not null references app.tenants (id),
  amount numeric(14, 2) not null,
  payment_method text not null,
  reference text,
  note text,
  received_at timestamptz not null,
  recorded_by_user_id bigint not null references app.users (id),
  created_at timestamptz not null default now(),
  constraint payment_collections_amount_check check (amount > 0),
  constraint payment_collections_method_check check (payment_method in ('cash', 'upi', 'bank_transfer', 'cheque', 'other')),
  constraint payment_collections_reference_check check (reference is null or length(btrim(reference)) between 3 and 120),
  constraint payment_collections_note_check check (note is null or length(btrim(note)) between 3 and 500),
  constraint payment_collections_received_at_check check (received_at <= created_at + interval '5 minutes')
);

create index payment_collections_agency_received_idx
on app.payment_collections (agency_id, received_at desc, id desc);

create index payment_collections_account_received_idx
on app.payment_collections (commercial_account_id, received_at desc, id desc);

create index payment_collections_tenant_received_idx
on app.payment_collections (tenant_id, received_at desc, id desc);

create index payment_collections_recorded_by_user_id_idx
on app.payment_collections (recorded_by_user_id);

create table app.payment_allocations (
  id bigint generated always as identity primary key,
  payment_collection_id bigint not null references app.payment_collections (id),
  invoice_id bigint not null references app.invoices (id),
  amount numeric(14, 2) not null,
  created_at timestamptz not null default now(),
  constraint payment_allocations_amount_check check (amount > 0),
  constraint payment_allocations_payment_invoice_unique unique (payment_collection_id, invoice_id)
);

create index payment_allocations_invoice_id_idx on app.payment_allocations (invoice_id);

create function app.validate_payment_collection_account()
returns trigger
language plpgsql
as $$
declare
  account_agency_id bigint;
  account_tenant_id bigint;
begin
  select agency_id, tenant_id
    into account_agency_id, account_tenant_id
    from app.commercial_accounts
   where id = new.commercial_account_id;

  if not found or account_agency_id <> new.agency_id or account_tenant_id <> new.tenant_id then
    raise exception 'payment collection account, agency, and tenant do not match' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger payment_collections_validate_account
before insert on app.payment_collections
for each row execute function app.validate_payment_collection_account();

create function app.validate_payment_allocation_account()
returns trigger
language plpgsql
as $$
declare
  payment_account_id bigint;
  invoice_account_id bigint;
begin
  select commercial_account_id into payment_account_id
    from app.payment_collections where id = new.payment_collection_id;
  select commercial_account_id into invoice_account_id
    from app.invoices where id = new.invoice_id;

  if payment_account_id is null or invoice_account_id is null or payment_account_id <> invoice_account_id then
    raise exception 'payment allocation invoice belongs to another commercial account' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger payment_allocations_validate_account
before insert on app.payment_allocations
for each row execute function app.validate_payment_allocation_account();

create function app.prevent_payment_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'payment ledger records are append-only' using errcode = '55000';
end;
$$;

create trigger payment_collections_immutable
before update or delete on app.payment_collections
for each row execute function app.prevent_payment_ledger_mutation();

create trigger payment_allocations_immutable
before update or delete on app.payment_allocations
for each row execute function app.prevent_payment_ledger_mutation();

insert into app.schema_migrations (version) values ('0009_agency_commercial_controls');

commit;
