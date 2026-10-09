begin;

do $$
begin
  if to_regclass('app.delivery_staff') is null then raise exception 'delivery_staff missing'; end if;
  if to_regclass('app.agency_inventory') is null then raise exception 'agency_inventory missing'; end if;
  if to_regclass('app.agency_inventory_events') is null then raise exception 'agency_inventory_events missing'; end if;
  if to_regclass('app.order_empty_collections') is null then raise exception 'order_empty_collections missing'; end if;
end $$;

do $$
declare
  event_id bigint;
  update_blocked boolean := false;
  delete_blocked boolean := false;
begin
  select id into event_id from app.agency_inventory_events limit 1;
  if event_id is not null then
    begin
      update app.agency_inventory_events set reason = 'must fail' where id = event_id;
    exception when sqlstate '55000' then
      update_blocked := true;
    end;
    begin
      delete from app.agency_inventory_events where id = event_id;
    exception when sqlstate '55000' then
      delete_blocked := true;
    end;
    if not update_blocked or not delete_blocked then
      raise exception 'inventory event immutability guard failed';
    end if;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'agency_inventory_low_stock_idx') then
    raise exception 'agency inventory low-stock partial index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'orders_assigned_delivery_staff_open_idx') then
    raise exception 'assigned delivery staff partial index missing';
  end if;
end $$;

rollback;
