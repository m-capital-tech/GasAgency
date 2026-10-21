begin;

do $$
begin
  if to_regclass('app.agency_service_pincodes') is null or to_regclass('app.agency_reviews') is null then
    raise exception 'agency administration tables are missing';
  end if;
  if not exists (select 1 from app.schema_migrations where version = '0015_agency_administration') then
    raise exception 'agency administration migration is missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'agencies_status_submitted_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'agency_service_pincodes_pincode_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'agency_reviews_agency_created_idx') then
    raise exception 'agency administration access-path index is missing';
  end if;
  if has_table_privilege('public', 'app.agency_reviews', 'select')
     or has_table_privilege('public', 'app.agency_service_pincodes', 'select') then
    raise exception 'PUBLIC must not read agency administration data';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'app.agency_reviews'::regclass and tgname = 'agency_reviews_immutable')
     or not exists (select 1 from pg_trigger where tgrelid = 'app.agency_reviews'::regclass and tgname = 'agency_reviews_prevent_self_approval') then
    raise exception 'agency review protections are missing';
  end if;
end $$;

rollback;
