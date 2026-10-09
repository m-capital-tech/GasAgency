begin;

alter table app.device_sessions
  add column auth_method text not null default 'otp',
  add column mfa_verified_at timestamptz,
  add column created_ip inet;

alter table app.device_sessions
  add constraint device_sessions_auth_method_check
  check (auth_method in ('otp', 'otp_mfa', 'bootstrap_test'));

alter table app.agency_assignments
  add column status text not null default 'proposed';

alter table app.agency_assignments
  add constraint agency_assignments_status_check
  check (status in ('proposed', 'active', 'ended'));

create index agency_assignments_status_idx on app.agency_assignments (status, created_at desc);

create table app.tenant_commercial_proposals (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  tenant_id bigint not null unique references app.tenants (id),
  requested_payment_mode text not null default 'prepaid',
  proposed_credit_limit numeric(14, 2),
  proposed_net_term_days smallint,
  proposal_note text,
  proposed_by_user_id bigint not null references app.users (id),
  decision_status text not null default 'not_required',
  decided_by_user_id bigint references app.users (id),
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_commercial_proposals_payment_mode_check check (requested_payment_mode in ('prepaid', 'credit')),
  constraint tenant_commercial_proposals_credit_fields_check check (
    (requested_payment_mode = 'prepaid' and proposed_credit_limit is null and proposed_net_term_days is null)
    or
    (requested_payment_mode = 'credit' and proposed_credit_limit > 0 and proposed_net_term_days in (7, 15, 30))
  ),
  constraint tenant_commercial_proposals_status_check check (decision_status in ('not_required', 'pending', 'approved', 'rejected')),
  constraint tenant_commercial_proposals_status_mode_check check (
    (requested_payment_mode = 'prepaid' and decision_status = 'not_required')
    or
    (requested_payment_mode = 'credit' and decision_status in ('pending', 'approved', 'rejected'))
  ),
  constraint tenant_commercial_proposals_decision_fields_check check (
    (decision_status in ('not_required', 'pending') and decided_by_user_id is null and decided_at is null)
    or
    (decision_status in ('approved', 'rejected') and decided_by_user_id is not null and decided_at is not null)
  )
);

create index tenant_commercial_proposals_proposed_by_user_id_idx on app.tenant_commercial_proposals (proposed_by_user_id);
create index tenant_commercial_proposals_decided_by_user_id_idx on app.tenant_commercial_proposals (decided_by_user_id);
create index tenant_commercial_proposals_pending_idx on app.tenant_commercial_proposals (created_at) where decision_status = 'pending';

insert into app.schema_migrations (version) values ('0002_auth_rbac_onboarding');

commit;
