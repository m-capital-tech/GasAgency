begin;

create schema app;

create table app.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table app.users (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  phone_e164 text not null unique,
  full_name text not null,
  email text,
  preferred_language text not null default 'en',
  status text not null default 'active',
  mfa_required boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_phone_e164_check check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint users_preferred_language_check check (preferred_language in ('en', 'hi', 'te')),
  constraint users_status_check check (status in ('invited', 'active', 'suspended', 'archived')),
  constraint users_full_name_check check (length(btrim(full_name)) >= 2)
);

create unique index users_email_unique_idx on app.users (lower(email)) where email is not null;
create index users_status_idx on app.users (status);

create table app.agencies (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  legal_name text not null,
  display_name text not null,
  gstin text not null unique,
  distributor_code text,
  omc text,
  phone_e164 text not null,
  city text not null,
  state_code text not null,
  status text not null default 'pending',
  credit_enabled boolean not null default true,
  created_by_user_id bigint references app.users (id),
  approved_by_user_id bigint references app.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agencies_gstin_check check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  constraint agencies_phone_e164_check check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint agencies_omc_check check (omc is null or omc in ('HP', 'IOCL', 'BPCL')),
  constraint agencies_status_check check (status in ('pending', 'approved', 'suspended', 'archived')),
  constraint agencies_state_code_check check (state_code ~ '^[A-Z]{2}$')
);

create index agencies_created_by_user_id_idx on app.agencies (created_by_user_id);
create index agencies_approved_by_user_id_idx on app.agencies (approved_by_user_id);
create index agencies_city_status_idx on app.agencies (city, status);

create table app.tenants (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  legal_name text not null,
  display_name text not null,
  business_type text not null,
  gstin text not null unique,
  fssai_number text,
  alternate_phone_e164 text,
  internal_notes text,
  status text not null default 'draft',
  created_by_user_id bigint not null references app.users (id),
  submitted_at timestamptz,
  approved_by_user_id bigint references app.users (id),
  approved_at timestamptz,
  suspended_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenants_gstin_check check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  constraint tenants_alternate_phone_check check (alternate_phone_e164 is null or alternate_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint tenants_business_type_check check (business_type in ('restaurant', 'hotel', 'tiffin_centre', 'cloud_kitchen', 'canteen', 'bakery', 'tea_stall', 'hospital', 'hostel', 'other')),
  constraint tenants_status_check check (status in ('draft', 'pending_approval', 'changes_requested', 'rejected', 'active', 'suspended', 'archived')),
  constraint tenants_approval_fields_check check (
    (status not in ('active', 'suspended', 'archived'))
    or (approved_by_user_id is not null and approved_at is not null)
  )
);

create index tenants_created_by_user_id_idx on app.tenants (created_by_user_id);
create index tenants_approved_by_user_id_idx on app.tenants (approved_by_user_id);
create index tenants_status_created_at_idx on app.tenants (status, created_at desc);
create index tenants_pending_review_idx on app.tenants (submitted_at) where status = 'pending_approval';

create table app.outlets (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  tenant_id bigint not null references app.tenants (id),
  label text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  state_code text not null,
  pincode text not null,
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  contact_name text,
  contact_phone_e164 text,
  delivery_instructions text,
  in_use_count integer not null default 0,
  spare_full_count integer not null default 0,
  empty_count integer not null default 0,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outlets_state_code_check check (state_code ~ '^[A-Z]{2}$'),
  constraint outlets_pincode_check check (pincode ~ '^[1-9][0-9]{5}$'),
  constraint outlets_latitude_check check (latitude between -90 and 90),
  constraint outlets_longitude_check check (longitude between -180 and 180),
  constraint outlets_contact_phone_check check (contact_phone_e164 is null or contact_phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint outlets_stock_counts_check check (in_use_count >= 0 and spare_full_count >= 0 and empty_count >= 0),
  constraint outlets_status_check check (status in ('active', 'suspended', 'archived')),
  constraint outlets_label_per_tenant_unique unique (tenant_id, label)
);

create index outlets_tenant_id_idx on app.outlets (tenant_id);
create index outlets_city_status_idx on app.outlets (city, status);

create table app.tenant_memberships (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  tenant_id bigint not null references app.tenants (id),
  user_id bigint not null references app.users (id),
  membership_type text not null,
  status text not null default 'invited',
  created_by_user_id bigint not null references app.users (id),
  activated_at timestamptz,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_memberships_type_check check (membership_type in ('owner', 'manager', 'staff')),
  constraint tenant_memberships_status_check check (status in ('invited', 'active', 'suspended', 'revoked')),
  constraint tenant_memberships_tenant_user_unique unique (tenant_id, user_id)
);

create index tenant_memberships_tenant_id_idx on app.tenant_memberships (tenant_id);
create index tenant_memberships_user_id_status_idx on app.tenant_memberships (user_id, status);
create index tenant_memberships_created_by_user_id_idx on app.tenant_memberships (created_by_user_id);

create table app.roles (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  name text not null,
  role_type text not null,
  is_system boolean not null default false,
  is_reserved boolean not null default false,
  managed_by_user_id bigint references app.users (id),
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint roles_type_check check (role_type in ('super_admin', 'platform_admin', 'platform_team', 'agency_owner', 'agency_staff', 'tenant_owner', 'tenant_staff', 'delivery')),
  constraint roles_status_check check (status in ('active', 'suspended', 'archived')),
  constraint roles_name_check check (length(btrim(name)) >= 2)
);

create index roles_managed_by_user_id_idx on app.roles (managed_by_user_id);
create unique index roles_system_name_unique_idx on app.roles (role_type, lower(name)) where is_system;
create unique index roles_managed_name_unique_idx on app.roles (managed_by_user_id, lower(name)) where managed_by_user_id is not null;

create table app.permissions (
  id bigint generated always as identity primary key,
  resource text not null,
  action text not null,
  description text not null,
  reserved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint permissions_resource_action_unique unique (resource, action),
  constraint permissions_resource_check check (resource in ('tenant', 'agency', 'order', 'credit', 'payment', 'report', 'support_case', 'message', 'configuration', 'user', 'role', 'audit', 'system')),
  constraint permissions_action_check check (action in ('view', 'create', 'edit', 'submit', 'approve', 'reject', 'suspend', 'export', 'execute', 'manage'))
);

insert into app.permissions (resource, action, description, reserved)
values
  ('tenant', 'view', 'View tenants within the assigned scope', false),
  ('tenant', 'create', 'Create tenant drafts', false),
  ('tenant', 'edit', 'Edit tenant drafts and permitted fields', false),
  ('tenant', 'submit', 'Submit tenant drafts for approval', false),
  ('tenant', 'approve', 'Approve tenant submissions', true),
  ('tenant', 'reject', 'Reject or request changes to tenant submissions', true),
  ('tenant', 'suspend', 'Suspend or reinstate tenants', true),
  ('tenant', 'export', 'Export tenant data within the assigned scope', true),
  ('agency', 'view', 'View agencies within the assigned scope', false),
  ('agency', 'create', 'Create agency records', true),
  ('agency', 'edit', 'Edit agency records', true),
  ('agency', 'approve', 'Approve agencies', true),
  ('agency', 'suspend', 'Suspend or reinstate agencies', true),
  ('order', 'view', 'View orders within the assigned scope', false),
  ('order', 'create', 'Place an audited support order', true),
  ('order', 'edit', 'Perform permitted order operations', false),
  ('order', 'execute', 'Execute privileged order actions', true),
  ('credit', 'view', 'View credit accounts and exposure', false),
  ('credit', 'edit', 'Prepare credit recommendations', false),
  ('credit', 'approve', 'Approve credit limits and net terms', true),
  ('credit', 'suspend', 'Suspend or reinstate credit', true),
  ('credit', 'export', 'Export credit and aging data', true),
  ('payment', 'view', 'View payments and reconciliations', false),
  ('payment', 'create', 'Record permitted collections', false),
  ('payment', 'edit', 'Correct payments through an audited workflow', true),
  ('payment', 'export', 'Export payment and reconciliation data', true),
  ('report', 'view', 'View reports allowed by role and scope', false),
  ('report', 'export', 'Export reports allowed by role and scope', true),
  ('support_case', 'view', 'View support cases within the assigned scope', false),
  ('support_case', 'create', 'Create support cases', false),
  ('support_case', 'edit', 'Work and resolve support cases', false),
  ('message', 'view', 'View messaging status and permitted content', false),
  ('message', 'execute', 'Resend or execute messaging operations', true),
  ('configuration', 'view', 'View permitted platform configuration', true),
  ('configuration', 'manage', 'Change platform configuration', true),
  ('user', 'view', 'View users within the assigned scope', false),
  ('user', 'create', 'Invite or add users within the assigned scope', false),
  ('user', 'edit', 'Edit or suspend scoped users', false),
  ('role', 'view', 'View roles and permission assignments', false),
  ('role', 'create', 'Create delegable roles below the actor ceiling', true),
  ('role', 'edit', 'Edit delegable roles below the actor ceiling', true),
  ('role', 'manage', 'Assign roles and manage permission ceilings', true),
  ('audit', 'view', 'View audit events within the assigned scope', true),
  ('audit', 'export', 'Export permitted audit events', true),
  ('system', 'view', 'View system health and operational status', true),
  ('system', 'execute', 'Execute privileged system operations', true),
  ('system', 'manage', 'Manage global system settings and access', true);

create table app.role_permissions (
  role_id bigint not null references app.roles (id),
  permission_id bigint not null references app.permissions (id),
  granted_by_user_id bigint not null references app.users (id),
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create index role_permissions_permission_id_idx on app.role_permissions (permission_id);
create index role_permissions_granted_by_user_id_idx on app.role_permissions (granted_by_user_id);

create table app.role_assignments (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  user_id bigint not null references app.users (id),
  role_id bigint not null references app.roles (id),
  scope_kind text not null,
  scope_value text,
  assigned_by_user_id bigint not null references app.users (id),
  status text not null default 'active',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint role_assignments_scope_kind_check check (scope_kind in ('global', 'region', 'city', 'selected_agencies', 'tenant', 'agency')),
  constraint role_assignments_scope_value_check check (
    (scope_kind in ('global', 'selected_agencies') and scope_value is null)
    or (scope_kind in ('region', 'city', 'tenant', 'agency') and scope_value is not null)
  ),
  constraint role_assignments_status_check check (status in ('active', 'suspended', 'revoked'))
);

create index role_assignments_user_id_status_idx on app.role_assignments (user_id, status);
create index role_assignments_role_id_idx on app.role_assignments (role_id);
create index role_assignments_assigned_by_user_id_idx on app.role_assignments (assigned_by_user_id);
create unique index role_assignments_active_unique_idx on app.role_assignments (user_id, role_id, scope_kind, coalesce(scope_value, '')) where status = 'active';

create table app.role_assignment_agencies (
  role_assignment_id bigint not null references app.role_assignments (id) on delete cascade,
  agency_id bigint not null references app.agencies (id),
  primary key (role_assignment_id, agency_id)
);

create index role_assignment_agencies_agency_id_idx on app.role_assignment_agencies (agency_id);

create table app.cylinder_types (
  id bigint generated always as identity primary key,
  code text not null unique,
  display_name text not null,
  weight_kg numeric(5, 2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint cylinder_types_weight_check check (weight_kg > 0)
);

insert into app.cylinder_types (code, display_name, weight_kg)
values
  ('commercial_19kg', '19 kg commercial cylinder', 19.00),
  ('commercial_47_5kg', '47.5 kg commercial cylinder', 47.50);

create table app.tenant_requirements (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  tenant_id bigint not null references app.tenants (id),
  outlet_id bigint not null references app.outlets (id),
  period text not null,
  preferred_delivery_days smallint[] not null default '{}',
  preferred_slot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tenant_requirements_period_check check (period in ('week', 'month')),
  constraint tenant_requirements_slot_check check (preferred_slot is null or preferred_slot in ('before_opening', 'standard', 'evening', 'express')),
  constraint tenant_requirements_days_check check (preferred_delivery_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  constraint tenant_requirements_tenant_outlet_unique unique (tenant_id, outlet_id)
);

create index tenant_requirements_tenant_id_idx on app.tenant_requirements (tenant_id);
create index tenant_requirements_outlet_id_idx on app.tenant_requirements (outlet_id);

create table app.tenant_requirement_items (
  tenant_requirement_id bigint not null references app.tenant_requirements (id) on delete cascade,
  cylinder_type_id bigint not null references app.cylinder_types (id),
  expected_quantity integer not null,
  created_at timestamptz not null default now(),
  primary key (tenant_requirement_id, cylinder_type_id),
  constraint tenant_requirement_items_quantity_check check (expected_quantity > 0)
);

create index tenant_requirement_items_cylinder_type_id_idx on app.tenant_requirement_items (cylinder_type_id);

create table app.agency_assignments (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  tenant_id bigint not null references app.tenants (id),
  agency_id bigint not null references app.agencies (id),
  assigned_by_user_id bigint not null references app.users (id),
  reason text not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  constraint agency_assignments_period_check check (ends_at is null or ends_at > starts_at),
  constraint agency_assignments_reason_check check (length(btrim(reason)) >= 3)
);

create unique index agency_assignments_one_active_per_tenant_idx on app.agency_assignments (tenant_id) where ends_at is null;
create index agency_assignments_agency_id_active_idx on app.agency_assignments (agency_id, tenant_id) where ends_at is null;
create index agency_assignments_assigned_by_user_id_idx on app.agency_assignments (assigned_by_user_id);

create table app.tenant_reviews (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  tenant_id bigint not null references app.tenants (id),
  reviewer_user_id bigint not null references app.users (id),
  decision text not null,
  from_status text not null,
  to_status text not null,
  reason text,
  override_used boolean not null default false,
  created_at timestamptz not null default now(),
  constraint tenant_reviews_decision_check check (decision in ('changes_requested', 'rejected', 'approved', 'suspended', 'reinstated', 'archived')),
  constraint tenant_reviews_reason_format_check check (reason is null or length(btrim(reason)) >= 3),
  constraint tenant_reviews_reason_required_check check (decision in ('approved', 'reinstated') or reason is not null),
  constraint tenant_reviews_override_reason_check check (not override_used or reason is not null)
);

create index tenant_reviews_tenant_id_created_at_idx on app.tenant_reviews (tenant_id, created_at desc);
create index tenant_reviews_reviewer_user_id_idx on app.tenant_reviews (reviewer_user_id);

create function app.prevent_tenant_self_approval()
returns trigger
language plpgsql
as $$
declare
  creator_id bigint;
begin
  if new.decision = 'approved' and not new.override_used then
    select created_by_user_id into creator_id from app.tenants where id = new.tenant_id;
    if creator_id = new.reviewer_user_id then
      raise exception 'tenant creator cannot approve their own submission' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger tenant_reviews_prevent_self_approval
before insert on app.tenant_reviews
for each row execute function app.prevent_tenant_self_approval();

create table app.invitations (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  tenant_id bigint not null references app.tenants (id),
  user_id bigint not null references app.users (id),
  status text not null default 'queued',
  idempotency_key text not null unique,
  sms_fallback_at timestamptz,
  completed_at timestamptz,
  created_by_user_id bigint not null references app.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_status_check check (status in ('queued', 'sms_sent', 'sms_delivered', 'whatsapp_queued', 'whatsapp_sent', 'whatsapp_delivered', 'manual_attention', 'cancelled'))
);

create index invitations_tenant_id_idx on app.invitations (tenant_id);
create index invitations_user_id_idx on app.invitations (user_id);
create index invitations_created_by_user_id_idx on app.invitations (created_by_user_id);
create index invitations_fallback_due_idx on app.invitations (sms_fallback_at) where status = 'sms_sent';

create table app.message_attempts (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  invitation_id bigint not null references app.invitations (id),
  channel text not null,
  provider text not null,
  template_name text not null,
  template_version text not null,
  destination_e164 text not null,
  status text not null default 'queued',
  provider_reference text,
  failure_code text,
  failure_reason text,
  queued_at timestamptz not null default now(),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint message_attempts_channel_check check (channel in ('sms', 'whatsapp')),
  constraint message_attempts_destination_check check (destination_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint message_attempts_status_check check (status in ('queued', 'sent', 'delivered', 'failed', 'undelivered'))
);

create index message_attempts_invitation_id_created_at_idx on app.message_attempts (invitation_id, created_at desc);
create unique index message_attempts_provider_reference_unique_idx on app.message_attempts (provider, provider_reference) where provider_reference is not null;
create index message_attempts_pending_idx on app.message_attempts (queued_at) where status = 'queued';

create table app.otp_challenges (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  user_id bigint references app.users (id),
  phone_e164 text not null,
  purpose text not null default 'login',
  code_hash bytea not null,
  request_ip_hash bytea,
  attempt_count smallint not null default 0,
  max_attempts smallint not null default 5,
  expires_at timestamptz not null,
  resend_available_at timestamptz not null,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  constraint otp_challenges_phone_check check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  constraint otp_challenges_purpose_check check (purpose in ('login', 'step_up')),
  constraint otp_challenges_attempts_check check (attempt_count >= 0 and max_attempts between 1 and 10 and attempt_count <= max_attempts),
  constraint otp_challenges_expiry_check check (expires_at > created_at),
  constraint otp_challenges_resend_check check (resend_available_at >= created_at)
);

create index otp_challenges_user_id_idx on app.otp_challenges (user_id);
create index otp_challenges_phone_created_at_idx on app.otp_challenges (phone_e164, created_at desc);
create index otp_challenges_active_expiry_idx on app.otp_challenges (expires_at) where consumed_at is null and invalidated_at is null;

create table app.device_sessions (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  user_id bigint not null references app.users (id),
  token_hash bytea not null unique,
  device_identifier_hash bytea,
  device_name text,
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now(),
  constraint device_sessions_expiry_check check (expires_at > created_at)
);

create index device_sessions_user_id_idx on app.device_sessions (user_id);
create index device_sessions_active_expiry_idx on app.device_sessions (expires_at) where revoked_at is null;

create table app.commercial_accounts (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  tenant_id bigint not null references app.tenants (id),
  agency_id bigint not null references app.agencies (id),
  payment_mode text not null default 'prepaid',
  status text not null default 'open',
  opened_by_user_id bigint not null references app.users (id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commercial_accounts_payment_mode_check check (payment_mode in ('prepaid', 'credit')),
  constraint commercial_accounts_status_check check (status in ('open', 'suspended', 'closed')),
  constraint commercial_accounts_period_check check (closed_at is null or closed_at >= opened_at)
);

create unique index commercial_accounts_one_open_per_tenant_idx on app.commercial_accounts (tenant_id) where status in ('open', 'suspended');
create index commercial_accounts_agency_id_status_idx on app.commercial_accounts (agency_id, status);
create index commercial_accounts_opened_by_user_id_idx on app.commercial_accounts (opened_by_user_id);

create table app.credit_accounts (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  commercial_account_id bigint not null unique references app.commercial_accounts (id),
  status text not null,
  credit_limit numeric(14, 2) not null,
  net_term_days smallint not null,
  approved_by_user_id bigint not null references app.users (id),
  approved_at timestamptz not null,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credit_accounts_status_check check (status in ('approved', 'suspended', 'closed')),
  constraint credit_accounts_limit_check check (credit_limit > 0),
  constraint credit_accounts_net_term_check check (net_term_days in (7, 15, 30))
);

create index credit_accounts_approved_by_user_id_idx on app.credit_accounts (approved_by_user_id);
create index credit_accounts_status_idx on app.credit_accounts (status);

create table app.credit_decisions (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  credit_account_id bigint not null references app.credit_accounts (id),
  decision text not null,
  previous_limit numeric(14, 2),
  new_limit numeric(14, 2),
  previous_net_term_days smallint,
  new_net_term_days smallint,
  reason text not null,
  decided_by_user_id bigint not null references app.users (id),
  override_used boolean not null default false,
  created_at timestamptz not null default now(),
  constraint credit_decisions_decision_check check (decision in ('approved', 'limit_changed', 'terms_changed', 'suspended', 'reinstated', 'closed')),
  constraint credit_decisions_reason_check check (length(btrim(reason)) >= 3),
  constraint credit_decisions_previous_limit_check check (previous_limit is null or previous_limit > 0),
  constraint credit_decisions_new_limit_check check (new_limit is null or new_limit > 0),
  constraint credit_decisions_previous_term_check check (previous_net_term_days is null or previous_net_term_days in (7, 15, 30)),
  constraint credit_decisions_new_term_check check (new_net_term_days is null or new_net_term_days in (7, 15, 30))
);

create index credit_decisions_credit_account_id_created_at_idx on app.credit_decisions (credit_account_id, created_at desc);
create index credit_decisions_decided_by_user_id_idx on app.credit_decisions (decided_by_user_id);

create table app.idempotency_keys (
  id bigint generated always as identity primary key,
  scope text not null,
  idempotency_key text not null,
  request_hash bytea not null,
  response_status integer,
  response_body jsonb,
  locked_until timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint idempotency_keys_scope_key_unique unique (scope, idempotency_key),
  constraint idempotency_keys_response_status_check check (response_status is null or response_status between 100 and 599),
  constraint idempotency_keys_expiry_check check (expires_at > created_at)
);

create index idempotency_keys_expiry_idx on app.idempotency_keys (expires_at);

create table app.outbox_events (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  event_type text not null,
  aggregate_type text not null,
  aggregate_public_id uuid not null,
  payload jsonb not null,
  dedupe_key text unique,
  available_at timestamptz not null default now(),
  attempt_count integer not null default 0,
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint outbox_events_attempt_count_check check (attempt_count >= 0)
);

create index outbox_events_ready_idx on app.outbox_events (available_at, id) where processed_at is null;
create index outbox_events_locked_at_idx on app.outbox_events (locked_at) where processed_at is null and locked_at is not null;

create table app.audit_events (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  actor_user_id bigint references app.users (id),
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_public_id uuid,
  reason text,
  before_values jsonb,
  after_values jsonb,
  request_id uuid not null,
  correlation_id uuid not null,
  source_ip inet,
  user_agent text,
  occurred_at timestamptz not null default now(),
  constraint audit_events_change_check check (before_values is not null or after_values is not null)
);

create index audit_events_actor_user_id_occurred_at_idx on app.audit_events (actor_user_id, occurred_at desc);
create index audit_events_entity_idx on app.audit_events (entity_type, entity_public_id, occurred_at desc);
create index audit_events_request_id_idx on app.audit_events (request_id);
create index audit_events_occurred_at_idx on app.audit_events (occurred_at desc);

create function app.prevent_audit_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit events are append-only' using errcode = '55000';
end;
$$;

create trigger audit_events_no_update
before update on app.audit_events
for each row execute function app.prevent_audit_event_mutation();

create trigger audit_events_no_delete
before delete on app.audit_events
for each row execute function app.prevent_audit_event_mutation();

insert into app.schema_migrations (version) values ('0001_foundation');

commit;
