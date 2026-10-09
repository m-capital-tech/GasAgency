begin;

do $$
begin
  if to_regclass('app.agency_prices') is null then raise exception 'agency_prices missing'; end if;
  if to_regclass('app.commercial_account_prices') is null then raise exception 'commercial_account_prices missing'; end if;
  if to_regclass('app.order_quotes') is null then raise exception 'order_quotes missing'; end if;
  if to_regclass('app.orders') is null then raise exception 'orders missing'; end if;
  if to_regclass('app.order_items') is null then raise exception 'order_items missing'; end if;
  if to_regclass('app.order_status_events') is null then raise exception 'order_status_events missing'; end if;
  if to_regclass('app.invoices') is null then raise exception 'invoices missing'; end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'orders_commercial_account_credit_exposure_idx') then
    raise exception 'credit exposure partial index missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'invoices_commercial_account_outstanding_idx') then
    raise exception 'outstanding invoice partial index missing';
  end if;
end $$;

rollback;
