begin;

create table app.platform_settings (
  setting_key text primary key,
  category text not null,
  display_name text not null,
  description text not null,
  value jsonb not null,
  value_type text not null,
  version integer not null default 1,
  updated_by_user_id bigint references app.users (id),
  updated_at timestamptz not null default now(),
  constraint platform_settings_key_check check (setting_key ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$'),
  constraint platform_settings_category_check check (category in ('workflow', 'operations', 'feature')),
  constraint platform_settings_type_check check (value_type in ('boolean', 'number')),
  constraint platform_settings_value_type_check check (jsonb_typeof(value) = value_type),
  constraint platform_settings_version_check check (version > 0)
);

create index platform_settings_category_key_idx
on app.platform_settings (category, setting_key);

create index platform_settings_updated_by_user_id_idx
on app.platform_settings (updated_by_user_id)
where updated_by_user_id is not null;

insert into app.platform_settings (setting_key, category, display_name, description, value, value_type)
values
  ('workflows.tenant_onboarding', 'workflow', 'Tenant onboarding', 'Allow new tenant drafts and submissions.', 'true'::jsonb, 'boolean'),
  ('workflows.ordering', 'workflow', 'Tenant ordering', 'Allow tenants to request quotes and place new orders.', 'true'::jsonb, 'boolean'),
  ('workflows.cod_orders', 'workflow', 'Cash on delivery', 'Allow COD quotations and orders when the serving agency also permits COD.', 'true'::jsonb, 'boolean'),
  ('workflows.credit_orders', 'workflow', 'Credit ordering', 'Allow orders against approved credit accounts.', 'true'::jsonb, 'boolean'),
  ('workflows.agency_fulfillment', 'workflow', 'Agency fulfilment', 'Allow agency order acceptance, assignment, dispatch and delivery transitions.', 'true'::jsonb, 'boolean'),
  ('workflows.collection_recording', 'workflow', 'Collection recording', 'Allow agencies to record and allocate tenant payments.', 'true'::jsonb, 'boolean'),
  ('operations.approval_sla_hours', 'operations', 'Approval SLA', 'Hours before a submitted tenant approval is reported as overdue.', '24'::jsonb, 'number'),
  ('operations.default_low_stock_threshold', 'operations', 'Default low-stock threshold', 'Initial per-cylinder low-stock threshold for a newly approved agency.', '5'::jsonb, 'number'),
  ('features.push_registration', 'feature', 'Mobile push registration', 'Allow signed mobile builds to register Expo push installations.', 'false'::jsonb, 'boolean'),
  ('features.document_uploads', 'feature', 'Document uploads', 'Allow production document upload workflows after private storage is connected.', 'false'::jsonb, 'boolean');

insert into app.schema_migrations (version) values ('0013_platform_configuration');

commit;
