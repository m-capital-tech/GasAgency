begin;

do $$
begin
  if to_regclass('app.payment_collections') is null then raise exception 'payment_collections missing'; end if;
  if to_regclass('app.payment_allocations') is null then raise exception 'payment_allocations missing'; end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'payment_collections_agency_received_idx') then
    raise exception 'agency payment timeline index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'payment_collections_account_received_idx') then
    raise exception 'account payment timeline index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'payment_allocations_invoice_id_idx') then
    raise exception 'invoice payment allocation index missing';
  end if;
  if not exists (
    select 1 from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'app' and table_row.relname = 'payment_collections'
      and trigger_row.tgname = 'payment_collections_immutable' and not trigger_row.tgisinternal
  ) then
    raise exception 'payment collection immutability trigger missing';
  end if;
  if not exists (
    select 1 from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace namespace_row on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'app' and table_row.relname = 'payment_allocations'
      and trigger_row.tgname = 'payment_allocations_validate_account' and not trigger_row.tgisinternal
  ) then
    raise exception 'payment allocation account-integrity trigger missing';
  end if;
end $$;

do $$
declare
  payment_id bigint;
  update_blocked boolean := false;
  delete_blocked boolean := false;
begin
  select id into payment_id from app.payment_collections limit 1;
  if payment_id is not null then
    begin
      update app.payment_collections set note = 'must fail' where id = payment_id;
    exception when sqlstate '55000' then
      update_blocked := true;
    end;
    begin
      delete from app.payment_collections where id = payment_id;
    exception when sqlstate '55000' then
      delete_blocked := true;
    end;
    if not update_blocked or not delete_blocked then
      raise exception 'payment collection immutability guard failed';
    end if;
  end if;
end $$;

rollback;
