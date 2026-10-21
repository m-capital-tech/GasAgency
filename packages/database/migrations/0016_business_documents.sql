begin;

create table app.business_documents (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  tenant_id bigint references app.tenants (id),
  agency_id bigint references app.agencies (id),
  document_type text not null,
  version integer not null,
  status text not null default 'available',
  original_file_name text not null,
  media_type text not null,
  byte_size bigint not null,
  sha256_digest bytea not null,
  storage_provider text not null,
  storage_key text not null unique,
  uploaded_by_user_id bigint not null references app.users (id),
  replaces_document_id bigint references app.business_documents (id),
  retention_class text not null,
  legal_hold boolean not null default false,
  archived_at timestamptz,
  archived_by_user_id bigint references app.users (id),
  archive_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_documents_owner_check check (num_nonnulls(tenant_id, agency_id) = 1),
  constraint business_documents_type_check check (document_type in (
    'gst_certificate', 'fssai_certificate', 'distributorship_letter', 'owner_pan',
    'cancelled_cheque', 'address_proof', 'other'
  )),
  constraint business_documents_status_check check (status in ('available', 'quarantined', 'archived', 'failed')),
  constraint business_documents_file_name_check check (length(btrim(original_file_name)) between 1 and 240),
  constraint business_documents_media_type_check check (media_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  constraint business_documents_byte_size_check check (byte_size between 1 and 10485760),
  constraint business_documents_digest_check check (octet_length(sha256_digest) = 32),
  constraint business_documents_storage_provider_check check (storage_provider in ('local', 'spaces')),
  constraint business_documents_storage_key_check check (
    storage_key ~ '^[a-z0-9][a-z0-9/_.-]+$'
    and length(storage_key) between 11 and 501
    and storage_key !~ '(^|/)\.\.(/|$)'
  ),
  constraint business_documents_version_check check (version > 0),
  constraint business_documents_retention_class_check check (retention_class in ('kyc', 'financial', 'operations', 'temporary')),
  constraint business_documents_archive_check check (
    (status = 'archived' and archived_at is not null and archived_by_user_id is not null and length(btrim(archive_reason)) >= 3)
    or (status <> 'archived' and archived_at is null and archived_by_user_id is null and archive_reason is null)
  )
);

create unique index business_documents_tenant_type_version_idx
on app.business_documents (tenant_id, document_type, version)
where tenant_id is not null;

create unique index business_documents_agency_type_version_idx
on app.business_documents (agency_id, document_type, version)
where agency_id is not null;

create index business_documents_tenant_status_created_idx
on app.business_documents (tenant_id, status, created_at desc, id desc)
where tenant_id is not null;

create index business_documents_agency_status_created_idx
on app.business_documents (agency_id, status, created_at desc, id desc)
where agency_id is not null;

create index business_documents_uploaded_by_user_id_idx on app.business_documents (uploaded_by_user_id);
create index business_documents_replaces_document_id_idx on app.business_documents (replaces_document_id) where replaces_document_id is not null;
create index business_documents_archived_by_user_id_idx on app.business_documents (archived_by_user_id) where archived_by_user_id is not null;

create table app.business_document_events (
  id bigint generated always as identity primary key,
  public_id uuid not null unique,
  document_id bigint not null references app.business_documents (id),
  actor_user_id bigint not null references app.users (id),
  action text not null,
  reason text,
  request_id text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint business_document_events_action_check check (action in ('uploaded', 'viewed', 'downloaded', 'archived', 'quarantined', 'restored')),
  constraint business_document_events_reason_check check (reason is null or length(btrim(reason)) between 3 and 1000),
  constraint business_document_events_request_id_check check (length(btrim(request_id)) between 8 and 128),
  constraint business_document_events_details_check check (jsonb_typeof(details) = 'object')
);

create index business_document_events_document_created_idx on app.business_document_events (document_id, created_at desc, id desc);
create index business_document_events_actor_created_idx on app.business_document_events (actor_user_id, created_at desc, id desc);

create function app.protect_business_document_identity()
returns trigger
language plpgsql
as $$
begin
  if old.public_id is distinct from new.public_id
     or old.tenant_id is distinct from new.tenant_id
     or old.agency_id is distinct from new.agency_id
     or old.document_type is distinct from new.document_type
     or old.version is distinct from new.version
     or old.original_file_name is distinct from new.original_file_name
     or old.media_type is distinct from new.media_type
     or old.byte_size is distinct from new.byte_size
     or old.sha256_digest is distinct from new.sha256_digest
     or old.storage_provider is distinct from new.storage_provider
     or old.storage_key is distinct from new.storage_key
     or old.uploaded_by_user_id is distinct from new.uploaded_by_user_id
     or old.replaces_document_id is distinct from new.replaces_document_id
     or old.retention_class is distinct from new.retention_class
     or old.created_at is distinct from new.created_at then
    raise exception 'business document identity and content metadata are immutable' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger business_documents_protect_identity
before update on app.business_documents
for each row execute function app.protect_business_document_identity();

create function app.prevent_business_document_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'business document records cannot be deleted' using errcode = '55000';
end;
$$;

create trigger business_documents_no_delete
before delete on app.business_documents
for each row execute function app.prevent_business_document_delete();

create function app.prevent_business_document_event_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'business document events are append-only' using errcode = '55000';
end;
$$;

create trigger business_document_events_immutable
before update or delete on app.business_document_events
for each row execute function app.prevent_business_document_event_mutation();

insert into app.schema_migrations (version) values ('0016_business_documents');

commit;
