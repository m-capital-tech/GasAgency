begin;

create table app.platform_revenue_entries (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  revenue_type text not null,
  amount numeric(14, 2) not null,
  currency text not null default 'INR',
  source_type text not null,
  external_reference text,
  description text not null,
  agency_id bigint references app.agencies (id),
  tenant_id bigint references app.tenants (id),
  order_id bigint references app.orders (id),
  recorded_by_user_id bigint references app.users (id),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint platform_revenue_entries_type_check check (revenue_type in ('commission', 'facilitation', 'convenience', 'express', 'subscription', 'refund', 'reversal', 'other')),
  constraint platform_revenue_entries_amount_check check (
    (revenue_type in ('refund', 'reversal') and amount < 0)
    or (revenue_type not in ('refund', 'reversal') and amount > 0)
  ),
  constraint platform_revenue_entries_currency_check check (currency = 'INR'),
  constraint platform_revenue_entries_source_check check (source_type in ('manual', 'settlement', 'provider', 'subscription')),
  constraint platform_revenue_entries_description_check check (length(btrim(description)) >= 3),
  constraint platform_revenue_entries_reference_check check (external_reference is null or length(btrim(external_reference)) >= 3)
);

create unique index platform_revenue_entries_source_reference_uidx
on app.platform_revenue_entries (source_type, external_reference)
where external_reference is not null;
create index platform_revenue_entries_occurred_idx on app.platform_revenue_entries (occurred_at desc, id desc);
create index platform_revenue_entries_agency_occurred_idx on app.platform_revenue_entries (agency_id, occurred_at desc) where agency_id is not null;
create index platform_revenue_entries_tenant_occurred_idx on app.platform_revenue_entries (tenant_id, occurred_at desc) where tenant_id is not null;
create index platform_revenue_entries_order_id_idx on app.platform_revenue_entries (order_id) where order_id is not null;
create index platform_revenue_entries_recorded_by_user_id_idx on app.platform_revenue_entries (recorded_by_user_id) where recorded_by_user_id is not null;

create function app.prevent_platform_revenue_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'platform revenue ledger records are append-only' using errcode = '55000';
end;
$$;

create trigger platform_revenue_entries_immutable
before update or delete on app.platform_revenue_entries
for each row execute function app.prevent_platform_revenue_mutation();

create table app.support_cases (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  case_number text not null unique,
  tenant_id bigint references app.tenants (id),
  agency_id bigint references app.agencies (id),
  opened_by_user_id bigint not null references app.users (id),
  assigned_to_user_id bigint references app.users (id),
  category text not null,
  priority text not null,
  status text not null default 'open',
  subject text not null,
  description text not null,
  response_due_at timestamptz not null,
  first_response_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_cases_subject_check check (length(btrim(subject)) between 3 and 200),
  constraint support_cases_description_check check (length(btrim(description)) between 3 and 5000),
  constraint support_cases_category_check check (category in ('onboarding', 'ordering', 'delivery', 'billing', 'credit', 'agency', 'technical', 'other')),
  constraint support_cases_priority_check check (priority in ('low', 'normal', 'high', 'critical')),
  constraint support_cases_status_check check (status in ('open', 'acknowledged', 'in_progress', 'resolved', 'closed')),
  constraint support_cases_response_due_check check (response_due_at >= created_at),
  constraint support_cases_response_check check (first_response_at is null or first_response_at >= created_at),
  constraint support_cases_resolution_check check (
    (status not in ('resolved', 'closed'))
    or (resolved_at is not null and resolution is not null and length(btrim(resolution)) >= 3)
  ),
  constraint support_cases_closed_check check (closed_at is null or (resolved_at is not null and closed_at >= resolved_at))
);

create index support_cases_tenant_created_idx on app.support_cases (tenant_id, created_at desc) where tenant_id is not null;
create index support_cases_agency_created_idx on app.support_cases (agency_id, created_at desc) where agency_id is not null;
create index support_cases_opened_by_user_id_idx on app.support_cases (opened_by_user_id);
create index support_cases_assigned_status_idx on app.support_cases (assigned_to_user_id, status, updated_at desc) where assigned_to_user_id is not null;
create index support_cases_queue_idx on app.support_cases (status, priority, response_due_at, id) where status not in ('resolved', 'closed');

create table app.support_case_events (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  support_case_id bigint not null references app.support_cases (id),
  actor_user_id bigint not null references app.users (id),
  event_type text not null,
  from_status text,
  to_status text,
  note text not null,
  occurred_at timestamptz not null default now(),
  constraint support_case_events_type_check check (event_type in ('created', 'acknowledged', 'started', 'resolved', 'reopened', 'closed', 'commented', 'assigned')),
  constraint support_case_events_status_check check (
    (from_status is null or from_status in ('open', 'acknowledged', 'in_progress', 'resolved', 'closed'))
    and (to_status is null or to_status in ('open', 'acknowledged', 'in_progress', 'resolved', 'closed'))
  ),
  constraint support_case_events_note_check check (length(btrim(note)) between 3 and 2000)
);

create index support_case_events_case_occurred_idx on app.support_case_events (support_case_id, occurred_at, id);
create index support_case_events_actor_user_id_idx on app.support_case_events (actor_user_id);

create function app.prevent_support_case_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'support case events are append-only' using errcode = '55000';
end;
$$;

create trigger support_case_events_immutable
before update or delete on app.support_case_events
for each row execute function app.prevent_support_case_event_mutation();

insert into app.schema_migrations (version) values ('0014_dashboard_data_coverage');

commit;
