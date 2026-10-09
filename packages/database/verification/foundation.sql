begin;

do $$
declare
  required_table text;
  missing_fk_indexes text;
begin
  foreach required_table in array array[
    'users',
    'agencies',
    'tenants',
    'outlets',
    'tenant_memberships',
    'roles',
    'permissions',
    'role_assignments',
    'agency_assignments',
    'tenant_reviews',
    'invitations',
    'platform_user_invitations',
    'message_attempts',
    'otp_challenges',
    'auth_rate_events',
    'device_sessions',
    'message_deliveries',
    'agency_prices',
    'agency_inventory',
    'delivery_staff',
    'order_quotes',
    'orders',
    'invoices',
    'commercial_accounts',
    'credit_accounts',
    'credit_decisions',
    'idempotency_keys',
    'outbox_events',
    'audit_events'
  ]
  loop
    if to_regclass('app.' || required_table) is null then
      raise exception 'required table app.% is missing', required_table;
    end if;
  end loop;

  select string_agg(format('%s.%s', conrelid::regclass, attribute.attname), ', ' order by conrelid::regclass::text, attribute.attname)
    into missing_fk_indexes
  from pg_constraint constraint_row
  cross join lateral unnest(constraint_row.conkey) as key_column(attnum)
  join pg_attribute attribute
    on attribute.attrelid = constraint_row.conrelid
   and attribute.attnum = key_column.attnum
  where constraint_row.contype = 'f'
    and constraint_row.connamespace = 'app'::regnamespace
    and not exists (
      select 1
      from pg_index index_row
      where index_row.indrelid = constraint_row.conrelid
        and index_row.indisvalid
        and index_row.indisready
        and index_row.indkey[0] = key_column.attnum
    );

  if missing_fk_indexes is not null then
    raise exception 'foreign-key columns missing a leading index: %', missing_fk_indexes;
  end if;

  if not exists (
    select 1 from app.schema_migrations where version = '0001_foundation'
  ) then
    raise exception 'migration ledger entry 0001_foundation is missing';
  end if;
end;
$$;

do $$
declare
  test_id bigint;
  update_blocked boolean := false;
  delete_blocked boolean := false;
begin
  insert into app.audit_events (
    public_id,
    action,
    entity_type,
    before_values,
    request_id,
    correlation_id
  ) values (
    '00000000-0000-7000-8000-000000000001',
    'verification.insert',
    'verification',
    '{}'::jsonb,
    '00000000-0000-7000-8000-000000000002',
    '00000000-0000-7000-8000-000000000003'
  ) returning id into test_id;

  begin
    update app.audit_events set reason = 'must fail' where id = test_id;
  exception when sqlstate '55000' then
    update_blocked := true;
  end;

  begin
    delete from app.audit_events where id = test_id;
  exception when sqlstate '55000' then
    delete_blocked := true;
  end;

  if not update_blocked then
    raise exception 'audit event update was not blocked';
  end if;

  if not delete_blocked then
    raise exception 'audit event delete was not blocked';
  end if;
end;
$$;

do $$
declare
  creator_id bigint;
  tenant_id bigint;
  self_approval_blocked boolean := false;
begin
  insert into app.users (public_id, phone_e164, full_name)
  values ('00000000-0000-7000-8000-000000000010', '+919999999999', 'Migration verifier')
  returning id into creator_id;

  insert into app.tenants (
    public_id,
    legal_name,
    display_name,
    business_type,
    gstin,
    status,
    created_by_user_id,
    submitted_at
  ) values (
    '00000000-0000-7000-8000-000000000011',
    'Verification Restaurant Private Limited',
    'Verification Restaurant',
    'restaurant',
    '36ABCDE1234F1Z5',
    'pending_approval',
    creator_id,
    now()
  ) returning id into tenant_id;

  begin
    insert into app.tenant_reviews (
      public_id,
      tenant_id,
      reviewer_user_id,
      decision,
      from_status,
      to_status
    ) values (
      '00000000-0000-7000-8000-000000000012',
      tenant_id,
      creator_id,
      'approved',
      'pending_approval',
      'active'
    );
  exception when sqlstate '42501' then
    self_approval_blocked := true;
  end;

  if not self_approval_blocked then
    raise exception 'maker-checker self-approval was not blocked';
  end if;
end;
$$;

rollback;
