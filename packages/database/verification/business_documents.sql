begin;

do $$
begin
  if to_regclass('app.business_documents') is null or to_regclass('app.business_document_events') is null then
    raise exception 'business document tables are missing';
  end if;
  if not exists (select 1 from app.schema_migrations where version = '0016_business_documents') then
    raise exception 'business document migration is missing';
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'business_documents_tenant_status_created_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'business_documents_agency_status_created_idx')
     or not exists (select 1 from pg_indexes where schemaname = 'app' and indexname = 'business_document_events_document_created_idx') then
    raise exception 'business document access-path index is missing';
  end if;
  if has_table_privilege('public', 'app.business_documents', 'select')
     or has_table_privilege('public', 'app.business_document_events', 'select') then
    raise exception 'PUBLIC must not read business document data';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'app.business_documents'::regclass and tgname = 'business_documents_no_delete')
     or not exists (select 1 from pg_trigger where tgrelid = 'app.business_documents'::regclass and tgname = 'business_documents_protect_identity')
     or not exists (select 1 from pg_trigger where tgrelid = 'app.business_document_events'::regclass and tgname = 'business_document_events_immutable') then
    raise exception 'business document immutability protections are missing';
  end if;
end $$;

rollback;
