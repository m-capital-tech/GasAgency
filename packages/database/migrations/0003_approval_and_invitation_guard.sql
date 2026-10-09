begin;

create table app.platform_user_invitations (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  user_id bigint not null references app.users (id),
  role_assignment_id bigint not null unique references app.role_assignments (id),
  status text not null default 'queued',
  idempotency_key text not null unique,
  sms_fallback_at timestamptz,
  completed_at timestamptz,
  created_by_user_id bigint not null references app.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_user_invitations_status_check check (
    status in ('queued', 'sms_sent', 'sms_delivered', 'whatsapp_queued', 'whatsapp_sent', 'whatsapp_delivered', 'manual_attention', 'cancelled')
  )
);

create index platform_user_invitations_user_id_idx on app.platform_user_invitations (user_id);
create index platform_user_invitations_created_by_user_id_idx on app.platform_user_invitations (created_by_user_id);
create index platform_user_invitations_queued_idx on app.platform_user_invitations (created_at, id)
where status = 'queued';
create index platform_user_invitations_fallback_due_idx on app.platform_user_invitations (sms_fallback_at)
where status = 'sms_sent';

create index invitations_queued_idx on app.invitations (created_at, id)
where status = 'queued';

create function app.ensure_invitation_tenant_is_active()
returns trigger
language plpgsql
as $$
declare
  tenant_status text;
begin
  select status into tenant_status from app.tenants where id = new.tenant_id;
  if tenant_status is distinct from 'active' then
    raise exception 'invitation requires an active tenant' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger invitations_require_active_tenant
before insert on app.invitations
for each row execute function app.ensure_invitation_tenant_is_active();

insert into app.schema_migrations (version) values ('0003_approval_and_invitation_guard');

commit;
