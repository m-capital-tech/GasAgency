import { createHash } from "node:crypto";
import type pg from "pg";
import express, { Router } from "express";
import { withTransaction, type AuthPrincipal } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { assertPlatformWorkflowEnabled } from "../domain/platform-settings";
import { HttpError } from "../http/error";
import { assertFreshMfa, authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { assertAuthorized } from "../security/rbac";
import { ObjectStorageUnavailableError, type ObjectStorage } from "../storage/object-storage";

const publicId = z.string().uuid();
const documentType = z.enum(["gst_certificate", "fssai_certificate", "distributorship_letter", "owner_pan", "cancelled_cheque", "address_proof", "other"]);
const archiveSchema = z.object({ reason: z.string().trim().min(3).max(1_000) }).strict();
const dispositionSchema = z.object({ disposition: z.enum(["inline", "attachment"]).default("inline") });
const mediaTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
type EntityKind = "tenant" | "agency";
type AccessMode = "view" | "edit";

const tenantDocumentTypes = new Set(["gst_certificate", "fssai_certificate", "owner_pan", "cancelled_cheque", "address_proof", "other"]);
const agencyDocumentTypes = new Set(["gst_certificate", "distributorship_letter", "owner_pan", "cancelled_cheque", "address_proof", "other"]);
const extensionByMediaType: Record<(typeof mediaTypes)[number], string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

interface EntityContext { kind: EntityKind; id: string; publicId: string; city: string; stateCode: string; agencyPublicId?: string; }
interface DocumentRow {
  id: string; public_id: string; tenant_id: string | null; agency_id: string | null; tenant_public_id: string | null; agency_public_id: string | null;
  tenant_city: string | null; tenant_state_code: string | null; serving_agency_public_id: string | null; agency_city: string | null; agency_state_code: string | null;
  document_type: string; version: number; status: string; original_file_name: string; media_type: string; byte_size: string; sha256_digest: Buffer;
  storage_provider: "local" | "spaces"; storage_key: string; retention_class: string; legal_hold: boolean; uploader_name: string; created_at: Date; archived_at: Date | null;
}

function actorRoles(principal: AuthPrincipal) { return [...new Set(principal.assignments.map((assignment) => assignment.roleType))].join(",") || "tenant_member"; }
function headerValue(value: string | undefined, label: string): string {
  if (!value) throw new HttpError(400, "invalid_document_metadata", `${label} is required.`);
  try { return decodeURIComponent(value); } catch { throw new HttpError(400, "invalid_document_metadata", `${label} is invalid.`); }
}
function cleanFileName(value: string): string {
  const normalized = value.normalize("NFKC").replace(/[\u0000-\u001f\u007f/\\]/g, "_").trim();
  if (!normalized || normalized.length > 240) throw new HttpError(400, "invalid_file_name", "The file name must contain 1–240 safe characters.");
  return normalized;
}
function matchesSignature(body: Buffer, mediaType: (typeof mediaTypes)[number]): boolean {
  if (mediaType === "application/pdf") return body.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mediaType === "image/jpeg") return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (mediaType === "image/png") return body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return body.length >= 12 && body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP";
}
function documentBody(row: DocumentRow) {
  return { publicId: row.public_id, documentType: row.document_type, version: row.version, status: row.status, originalFileName: row.original_file_name, mediaType: row.media_type, byteSize: Number(row.byte_size), retentionClass: row.retention_class, legalHold: row.legal_hold, uploadedByName: row.uploader_name, createdAt: row.created_at.toISOString(), archivedAt: row.archived_at?.toISOString() ?? null };
}
function storageError(error: unknown): HttpError | unknown {
  return error instanceof ObjectStorageUnavailableError ? new HttpError(503, "document_storage_unavailable", error.message) : error;
}

async function entityContext(client: pg.Pool | pg.PoolClient, kind: EntityKind, entityPublicId: string): Promise<EntityContext> {
  if (kind === "agency") {
    const row = (await client.query<{ id: string; public_id: string; city: string; state_code: string }>("select id::text,public_id::text,city,state_code from app.agencies where public_id=$1", [entityPublicId])).rows[0];
    if (!row) throw new HttpError(404, "agency_not_found", "The agency was not found.");
    return { kind, id: row.id, publicId: row.public_id, city: row.city, stateCode: row.state_code };
  }
  const row = (await client.query<{ id: string; public_id: string; city: string; state_code: string; agency_public_id: string | null }>(`select tenant.id::text,tenant.public_id::text,outlet.city,outlet.state_code,agency.public_id::text as agency_public_id
    from app.tenants tenant
    join lateral (select city,state_code from app.outlets where tenant_id=tenant.id order by id limit 1) outlet on true
    left join app.agency_assignments assignment on assignment.tenant_id=tenant.id and assignment.ends_at is null
    left join app.agencies agency on agency.id=assignment.agency_id
    where tenant.public_id=$1 order by assignment.id desc nulls last limit 1`, [entityPublicId])).rows[0];
  if (!row) throw new HttpError(404, "tenant_not_found", "The tenant was not found.");
  return { kind, id: row.id, publicId: row.public_id, city: row.city, stateCode: row.state_code, ...(row.agency_public_id ? { agencyPublicId: row.agency_public_id } : {}) };
}

function authorize(principal: AuthPrincipal, entity: EntityContext, mode: AccessMode): void {
  assertAuthorized(principal, `${entity.kind}.${mode}`, { tenantPublicId: entity.kind === "tenant" ? entity.publicId : undefined, agencyPublicId: entity.kind === "agency" ? entity.publicId : entity.agencyPublicId, city: entity.city, region: entity.stateCode });
}

async function documentRecord(client: pg.Pool | pg.PoolClient, documentPublicId: string): Promise<DocumentRow> {
  const row = (await client.query<DocumentRow>(`select document.id::text,document.public_id::text,document.tenant_id::text,document.agency_id::text,
      tenant.public_id::text as tenant_public_id,agency.public_id::text as agency_public_id,
      tenant_outlet.city as tenant_city,tenant_outlet.state_code as tenant_state_code,serving_agency.public_id::text as serving_agency_public_id,
      agency.city as agency_city,agency.state_code as agency_state_code,
      document.document_type,document.version,document.status,document.original_file_name,document.media_type,document.byte_size::text,document.sha256_digest,
      document.storage_provider,document.storage_key,document.retention_class,document.legal_hold,uploader.full_name as uploader_name,document.created_at,document.archived_at
    from app.business_documents document
    left join app.tenants tenant on tenant.id=document.tenant_id
    left join lateral (select city,state_code from app.outlets where tenant_id=tenant.id order by id limit 1) tenant_outlet on true
    left join app.agency_assignments serving_assignment on serving_assignment.tenant_id=tenant.id and serving_assignment.ends_at is null
    left join app.agencies serving_agency on serving_agency.id=serving_assignment.agency_id
    left join app.agencies agency on agency.id=document.agency_id
    join app.users uploader on uploader.id=document.uploaded_by_user_id
    where document.public_id=$1 order by serving_assignment.id desc nulls last limit 1`, [documentPublicId])).rows[0];
  if (!row) throw new HttpError(404, "document_not_found", "The document was not found.");
  return row;
}

function authorizeDocument(principal: AuthPrincipal, document: DocumentRow, mode: AccessMode): void {
  if (document.tenant_public_id) {
    assertAuthorized(principal, `tenant.${mode}`, { tenantPublicId: document.tenant_public_id, agencyPublicId: document.serving_agency_public_id ?? undefined, city: document.tenant_city ?? undefined, region: document.tenant_state_code ?? undefined });
    return;
  }
  assertAuthorized(principal, `agency.${mode}`, { agencyPublicId: document.agency_public_id ?? undefined, city: document.agency_city ?? undefined, region: document.agency_state_code ?? undefined });
}

async function activeTenantMember(client: pg.Pool | pg.PoolClient, userId: string, tenantPublicId: string): Promise<boolean> {
  const result = await client.query(`select 1 from app.tenant_memberships membership join app.tenants tenant on tenant.id=membership.tenant_id where membership.user_id=$1 and membership.status='active' and tenant.public_id=$2 and tenant.status='active' limit 1`, [userId, tenantPublicId]);
  return Boolean(result.rowCount);
}

async function addEvent(client: pg.Pool | pg.PoolClient, input: { documentId: string; actorUserId: string; action: string; reason?: string; requestId: string; details?: Record<string, unknown> }) {
  await client.query("insert into app.business_document_events (public_id,document_id,actor_user_id,action,reason,request_id,details) values ($1,$2,$3,$4,$5,$6,$7::jsonb)", [uuidV7(), input.documentId, input.actorUserId, input.action, input.reason ?? null, input.requestId, JSON.stringify(input.details ?? {})]);
}

async function addAudit(client: pg.PoolClient, principal: AuthPrincipal, input: { action: string; entityPublicId: string; reason: string; after: Record<string, unknown>; requestId: string }) {
  await client.query(`insert into app.audit_events (public_id,actor_user_id,actor_role,action,entity_type,entity_public_id,reason,after_values,request_id,correlation_id) values ($1,$2,$3,$4,'business_document',$5,$6,$7::jsonb,$8,$9)`, [uuidV7(), principal.userId, actorRoles(principal), input.action, input.entityPublicId, input.reason, JSON.stringify(input.after), input.requestId, uuidV7()]);
}

export function businessDocumentsRouter(options: { pool: pg.Pool; tokenPepper: string; storage: ObjectStorage; appEnv: string; maxBytes: number }): Router {
  const router = Router();
  router.use(requireAuthentication(options));
  const rawUpload = express.raw({ type: [...mediaTypes], limit: options.maxBytes });

  const list = (kind: EntityKind, tenantSelf = false) => async (request: express.Request, response: express.Response, next: express.NextFunction) => {
    try {
      const parsed = publicId.safeParse(request.params.entityPublicId); if (!parsed.success) throw new HttpError(400, "invalid_entity_id", "The document owner identifier is invalid.");
      const principal = authenticatedPrincipal(response); const entity = await entityContext(options.pool, kind, parsed.data);
      if (tenantSelf) { if (!(await activeTenantMember(options.pool, principal.userId, entity.publicId))) throw new HttpError(404, "tenant_not_found", "The tenant is unavailable."); } else authorize(principal, entity, "view");
      const ownerColumn = kind === "tenant" ? "tenant_id" : "agency_id";
      const result = await options.pool.query<DocumentRow>(`select document.id::text,document.public_id::text,document.tenant_id::text,document.agency_id::text,null::text as tenant_public_id,null::text as agency_public_id,null::text as tenant_city,null::text as tenant_state_code,null::text as serving_agency_public_id,null::text as agency_city,null::text as agency_state_code,document.document_type,document.version,document.status,document.original_file_name,document.media_type,document.byte_size::text,document.sha256_digest,document.storage_provider,document.storage_key,document.retention_class,document.legal_hold,uploader.full_name as uploader_name,document.created_at,document.archived_at from app.business_documents document join app.users uploader on uploader.id=document.uploaded_by_user_id where document.${ownerColumn}=$1 order by document.document_type,document.version desc,document.id desc`, [entity.id]);
      response.status(200).json({ documents: result.rows.map(documentBody) });
    } catch (error) { next(error); }
  };

  const upload = (kind: EntityKind) => async (request: express.Request, response: express.Response, next: express.NextFunction) => {
    let storedKey: string | null = null;
    try {
      const parsed = publicId.safeParse(request.params.entityPublicId); if (!parsed.success) throw new HttpError(400, "invalid_entity_id", "The document owner identifier is invalid.");
      const principal = authenticatedPrincipal(response); const entity = await entityContext(options.pool, kind, parsed.data); authorize(principal, entity, "edit");
      await assertPlatformWorkflowEnabled(options.pool, "features.document_uploads", "Document uploads are paused until private storage is enabled.");
      if (options.storage.provider === "disabled") throw new HttpError(503, "document_storage_unavailable", "Private document storage is not connected.");
      const parsedType = documentType.safeParse(request.header("x-document-type")); if (!parsedType.success) throw new HttpError(400, "invalid_document_type", "The document type is invalid.");
      if (!(kind === "tenant" ? tenantDocumentTypes : agencyDocumentTypes).has(parsedType.data)) throw new HttpError(422, "document_type_not_allowed", `This document type is not allowed for an ${kind}.`);
      const reason = headerValue(request.header("x-upload-reason"), "Upload reason").trim(); if (reason.length < 3 || reason.length > 1_000) throw new HttpError(400, "invalid_upload_reason", "Upload reason must contain 3–1,000 characters.");
      const originalFileName = cleanFileName(headerValue(request.header("x-file-name"), "File name"));
      const contentType = (request.header("content-type") ?? "").split(";", 1)[0] as (typeof mediaTypes)[number];
      if (!mediaTypes.includes(contentType)) throw new HttpError(415, "unsupported_document_type", "Upload a PDF, JPEG, PNG, or WebP file.");
      if (!Buffer.isBuffer(request.body) || request.body.byteLength < 1 || request.body.byteLength > options.maxBytes) throw new HttpError(413, "invalid_document_size", `Document size must be between 1 byte and ${options.maxBytes} bytes.`);
      if (!matchesSignature(request.body, contentType)) throw new HttpError(422, "document_signature_mismatch", "The file content does not match its declared media type.");
      const digest = createHash("sha256").update(request.body).digest(); const digestHex = digest.toString("hex"); const documentPublicId = uuidV7();
      storedKey = `${options.appEnv}/${kind}/${entity.publicId}/${documentPublicId}.${extensionByMediaType[contentType]}`;
      await options.storage.put({ key: storedKey, body: request.body, contentType, sha256Hex: digestHex });
      const saved = await withTransaction(options.pool, async (client) => {
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [`business-document:${kind}:${entity.publicId}:${parsedType.data}`]);
        const ownerColumn = kind === "tenant" ? "tenant_id" : "agency_id"; const nextVersion = Number((await client.query<{ version: string }>(`select (coalesce(max(version),0)+1)::text as version from app.business_documents where ${ownerColumn}=$1 and document_type=$2`, [entity.id, parsedType.data])).rows[0]!.version);
        const row = (await client.query<DocumentRow>(`insert into app.business_documents (public_id,${ownerColumn},document_type,version,original_file_name,media_type,byte_size,sha256_digest,storage_provider,storage_key,uploaded_by_user_id,retention_class) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'kyc') returning id::text,public_id::text,tenant_id::text,agency_id::text,null::text as tenant_public_id,null::text as agency_public_id,null::text as tenant_city,null::text as tenant_state_code,null::text as serving_agency_public_id,null::text as agency_city,null::text as agency_state_code,document_type,version,status,original_file_name,media_type,byte_size::text,sha256_digest,storage_provider,storage_key,retention_class,legal_hold,$12::text as uploader_name,created_at,archived_at`, [documentPublicId, entity.id, parsedType.data, nextVersion, originalFileName, contentType, request.body.byteLength, digest, options.storage.provider, storedKey, principal.userId, principal.fullName])).rows[0]!;
        const requestId = response.locals.requestId ?? uuidV7(); await addEvent(client, { documentId: row.id, actorUserId: principal.userId, action: "uploaded", reason, requestId, details: { entityKind: kind, entityPublicId: entity.publicId, sha256: digestHex } });
        await addAudit(client, principal, { action: "document.uploaded", entityPublicId: row.public_id, reason, after: { entityKind: kind, entityPublicId: entity.publicId, documentType: parsedType.data, version: nextVersion, byteSize: request.body.byteLength, storageProvider: options.storage.provider }, requestId });
        return row;
      });
      storedKey = null; response.status(201).json({ document: documentBody(saved) });
    } catch (error) {
      if (storedKey) await options.storage.delete(storedKey).catch(() => undefined);
      next(storageError(error));
    }
  };

  router.get("/admin/tenants/:entityPublicId/documents", list("tenant"));
  router.post("/admin/tenants/:entityPublicId/documents", rawUpload, upload("tenant"));
  router.get("/admin/agencies/:entityPublicId/documents", list("agency"));
  router.post("/admin/agencies/:entityPublicId/documents", rawUpload, upload("agency"));
  router.get("/agencies/:entityPublicId/documents", list("agency"));
  router.post("/agencies/:entityPublicId/documents", rawUpload, upload("agency"));
  router.get("/tenants/:entityPublicId/documents", list("tenant", true));

  router.get("/documents/:documentPublicId/content", async (request, response, next) => {
    try {
      const id = publicId.safeParse(request.params.documentPublicId); const disposition = dispositionSchema.safeParse(request.query); if (!id.success || !disposition.success) throw new HttpError(400, "invalid_request", "The document request is invalid.");
      const principal = authenticatedPrincipal(response); const document = await documentRecord(options.pool, id.data);
      const selfMember = document.tenant_public_id ? await activeTenantMember(options.pool, principal.userId, document.tenant_public_id) : false;
      if (!selfMember) authorizeDocument(principal, document, "view");
      if (document.status !== "available") throw new HttpError(409, "document_unavailable", "The document is not available for access.");
      const stored = await options.storage.get(document.storage_key); const actualDigest = createHash("sha256").update(stored.body).digest();
      if (stored.body.byteLength !== Number(document.byte_size) || !actualDigest.equals(document.sha256_digest)) {
        await withTransaction(options.pool, async (client) => { await client.query("update app.business_documents set status='quarantined',updated_at=now() where id=$1 and status='available'", [document.id]); await addEvent(client, { documentId: document.id, actorUserId: principal.userId, action: "quarantined", reason: "Stored object failed integrity verification", requestId: response.locals.requestId ?? uuidV7() }); });
        throw new HttpError(503, "document_integrity_failure", "The document failed integrity verification and has been quarantined.");
      }
      const action = disposition.data.disposition === "attachment" ? "downloaded" : "viewed"; await addEvent(options.pool, { documentId: document.id, actorUserId: principal.userId, action, requestId: response.locals.requestId ?? uuidV7(), details: { byteSize: stored.body.byteLength } });
      const safeName = document.original_file_name.replace(/["\r\n]/g, "_"); response.setHeader("content-type", document.media_type); response.setHeader("content-length", stored.body.byteLength); response.setHeader("content-disposition", `${disposition.data.disposition}; filename*=UTF-8''${encodeURIComponent(safeName)}`); response.setHeader("cache-control", "private, no-store"); response.setHeader("x-content-type-options", "nosniff"); response.status(200).send(stored.body);
    } catch (error) { next(storageError(error)); }
  });

  router.post("/documents/:documentPublicId/archive", async (request, response, next) => {
    try {
      const id = publicId.safeParse(request.params.documentPublicId); const parsed = archiveSchema.safeParse(request.body); if (!id.success || !parsed.success) throw new HttpError(400, "invalid_request", "The document archive request is invalid.");
      const principal = authenticatedPrincipal(response); assertFreshMfa(principal);
      const result = await withTransaction(options.pool, async (client) => {
        const document = await documentRecord(client, id.data); authorizeDocument(principal, document, "edit"); if (document.status === "archived") throw new HttpError(409, "document_already_archived", "The document is already archived."); if (document.legal_hold) throw new HttpError(409, "document_legal_hold", "The document is on legal hold and cannot be archived.");
        const row = (await client.query<DocumentRow>(`update app.business_documents set status='archived',archived_at=now(),archived_by_user_id=$2,archive_reason=$3,updated_at=now() where id=$1 returning id::text,public_id::text,tenant_id::text,agency_id::text,null::text as tenant_public_id,null::text as agency_public_id,null::text as tenant_city,null::text as tenant_state_code,null::text as serving_agency_public_id,null::text as agency_city,null::text as agency_state_code,document_type,version,status,original_file_name,media_type,byte_size::text,sha256_digest,storage_provider,storage_key,retention_class,legal_hold,$4::text as uploader_name,created_at,archived_at`, [document.id, principal.userId, parsed.data.reason, document.uploader_name])).rows[0]!;
        const requestId = response.locals.requestId ?? uuidV7(); await addEvent(client, { documentId: document.id, actorUserId: principal.userId, action: "archived", reason: parsed.data.reason, requestId }); await addAudit(client, principal, { action: "document.archived", entityPublicId: document.public_id, reason: parsed.data.reason, after: { status: "archived", storageRetained: true }, requestId }); return row;
      });
      response.status(200).json({ document: documentBody(result) });
    } catch (error) { next(error); }
  });

  return router;
}
