begin;

do $$
begin
  if not exists (select 1 from app.schema_migrations where version = '0003_approval_and_invitation_guard') then
    raise exception 'migration ledger entry 0003_approval_and_invitation_guard is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'invitations_require_active_tenant'
      and tgrelid = 'app.invitations'::regclass
      and not tgisinternal
  ) then
    raise exception 'active-tenant invitation guard is missing';
  end if;

  if to_regclass('app.invitations_queued_idx') is null then
    raise exception 'queued invitation partial index is missing';
  end if;

  if to_regclass('app.platform_user_invitations') is null then
    raise exception 'platform user invitation table is missing';
  end if;
end;
$$;

do $$
declare
  verifier_user_id bigint;
  verifier_tenant_id bigint;
  blocked boolean := false;
begin
  insert into app.users (public_id, phone_e164, full_name)
  values ('00000000-0000-7000-8000-000000000030', '+919999999930', 'Invitation verifier')
  returning id into verifier_user_id;

  insert into app.tenants (
    public_id, legal_name, display_name, business_type, gstin, status, created_by_user_id
  ) values (
    '00000000-0000-7000-8000-000000000031',
    'Draft Invitation Verification Private Limited',
    'Draft Invitation Verification',
    'restaurant',
    '29ABCDE1234F1Z5',
    'draft',
    verifier_user_id
  ) returning id into verifier_tenant_id;

  begin
    insert into app.invitations (
      public_id, tenant_id, user_id, status, idempotency_key, created_by_user_id
    ) values (
      '00000000-0000-7000-8000-000000000032',
      verifier_tenant_id,
      verifier_user_id,
      'queued',
      'verification-inactive-tenant',
      verifier_user_id
    );
  exception when check_violation then
    blocked := true;
  end;

  if not blocked then
    raise exception 'invitation for a non-active tenant was not blocked';
  end if;
end;
$$;

rollback;
