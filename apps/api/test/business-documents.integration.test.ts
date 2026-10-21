import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import express from "express";
import { createDatabasePool } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { businessDocumentsRouter } from "../src/routes/business-documents";
import { gstinCheckDigit } from "../src/domain/gstin";
import { HttpError } from "../src/http/error";
import { hashSessionToken } from "../src/security/token";
import { LocalObjectStorage } from "../src/storage/object-storage";

const connectionString = process.env.TEST_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

integrationTest("private agency documents are gated, signature-checked, versioned, authorized, integrity-verified, and retained on archive", async () => {
  const tokenPepper = "business-document-test-pepper-32-characters";
  const token = `document-${uuidV7()}-session-token`;
  const storageRoot = await mkdtemp(path.join(tmpdir(), "commercial-lpg-documents-"));
  const storage = new LocalObjectStorage(storageRoot);
  const pool = createDatabasePool({ connectionString: connectionString!, applicationName: "business-documents-integration-test", maxConnections: 4, statementTimeoutMs: 30_000, sslMode: "disable" });
  const superAdmin = (await pool.query<{ id: string }>(`select assignment.user_id::text as id from app.role_assignments assignment join app.roles role_row on role_row.id=assignment.role_id where role_row.role_type='super_admin' and assignment.status='active' limit 1`)).rows[0];
  assert.ok(superAdmin, "test database requires the seeded Super Admin");
  await pool.query("insert into app.device_sessions (public_id,user_id,token_hash,expires_at,auth_method,mfa_verified_at) values ($1,$2,$3,now()+interval '1 hour','bootstrap_test',now())", [uuidV7(), superAdmin.id, hashSessionToken(token, tokenPepper)]);
  const outsiderToken = `document-outsider-${uuidV7()}-session-token`; const outsider = (await pool.query<{ id: string }>("insert into app.users (public_id,phone_e164,full_name,status) values ($1,$2,'Document Scope Outsider','active') returning id::text", [uuidV7(), `+9178${Date.now().toString().slice(-8)}`])).rows[0]!;
  await pool.query("insert into app.device_sessions (public_id,user_id,token_hash,expires_at,auth_method) values ($1,$2,$3,now()+interval '1 hour','bootstrap_test')", [uuidV7(), outsider.id, hashSessionToken(outsiderToken, tokenPepper)]);
  const suffix = Date.now().toString().slice(-4); const gstinPrefix = `27ABCDE${suffix}F1Z`; const agencyPublicId = uuidV7();
  await pool.query(`insert into app.agencies (public_id,legal_name,display_name,gstin,phone_e164,city,state_code,status,created_by_user_id,approved_by_user_id,approved_at) values ($1,$2,$3,$4,$5,'Mumbai','MH','approved',$6,$6,now())`, [agencyPublicId, `Document Test Agency ${suffix}`, `Document Test ${suffix}`, `${gstinPrefix}${gstinCheckDigit(gstinPrefix)}`, `+9179${Date.now().toString().slice(-8)}`, superAdmin.id]);

  const app = express(); app.use(express.json()); app.use("/v1", businessDocumentsRouter({ pool, tokenPepper, storage, appEnv: "test", maxBytes: 10 * 1024 * 1024 }));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => { const known = error instanceof HttpError ? error : null; response.status(known?.status ?? 500).json({ error: { code: known?.code ?? "internal_error", message: known?.message ?? (error instanceof Error ? error.message : "failed") } }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/v1`; const headers = { authorization: `Bearer ${token}`, "content-type": "application/pdf", "x-document-type": "gst_certificate", "x-file-name": encodeURIComponent("GST Certificate.pdf"), "x-upload-reason": encodeURIComponent("Verified onboarding evidence") };
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8");

  try {
    const gated = await fetch(`${base}/admin/agencies/${agencyPublicId}/documents`, { method: "POST", headers, body: pdf }); assert.equal(gated.status, 503); assert.equal((await gated.json() as { error: { code: string } }).error.code, "workflow_paused");
    await pool.query("update app.platform_settings set value='true'::jsonb,version=version+1,updated_by_user_id=$1,updated_at=now() where setting_key='features.document_uploads'", [superAdmin.id]);
    const spoofed = await fetch(`${base}/admin/agencies/${agencyPublicId}/documents`, { method: "POST", headers, body: Buffer.from("not a pdf") }); assert.equal(spoofed.status, 422); assert.equal((await spoofed.json() as { error: { code: string } }).error.code, "document_signature_mismatch");

    const uploaded = await fetch(`${base}/admin/agencies/${agencyPublicId}/documents`, { method: "POST", headers, body: pdf });
    const uploadedBody = await uploaded.json() as { document?: { publicId: string; version: number; status: string }; error?: { message: string } }; assert.equal(uploaded.status, 201, uploadedBody.error?.message); assert.equal(uploadedBody.document?.version, 1); assert.equal(uploadedBody.document?.status, "available"); const documentPublicId = uploadedBody.document!.publicId;
    const second = await fetch(`${base}/admin/agencies/${agencyPublicId}/documents`, { method: "POST", headers: { ...headers, "x-file-name": encodeURIComponent("GST Certificate renewed.pdf"), "x-upload-reason": encodeURIComponent("Renewed certificate received") }, body: pdf }); assert.equal(second.status, 201); assert.equal((await second.json() as { document: { version: number } }).document.version, 2);

    const list = await fetch(`${base}/admin/agencies/${agencyPublicId}/documents`, { headers: { authorization: `Bearer ${token}` } }); assert.equal(list.status, 200); assert.equal((await list.json() as { documents: unknown[] }).documents.length, 2);
    const forbidden = await fetch(`${base}/admin/agencies/${agencyPublicId}/documents`, { headers: { authorization: `Bearer ${outsiderToken}` } }); assert.equal(forbidden.status, 403);
    const content = await fetch(`${base}/documents/${documentPublicId}/content?disposition=attachment`, { headers: { authorization: `Bearer ${token}` } }); assert.equal(content.status, 200); assert.equal(content.headers.get("cache-control"), "private, no-store"); assert.deepEqual(Buffer.from(await content.arrayBuffer()), pdf);

    const archive = await fetch(`${base}/documents/${documentPublicId}/archive`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ reason: "Superseded by the renewed certificate" }) }); assert.equal(archive.status, 200); assert.equal((await archive.json() as { document: { status: string } }).document.status, "archived");
    const unavailable = await fetch(`${base}/documents/${documentPublicId}/content`, { headers: { authorization: `Bearer ${token}` } }); assert.equal(unavailable.status, 409);

    const stored = (await pool.query<{ storage_key: string; status: string; events: string; audits: string }>(`select document.storage_key,document.status,(select count(*) from app.business_document_events event where event.document_id=document.id)::text as events,(select count(*) from app.audit_events audit where audit.entity_type='business_document' and audit.entity_public_id=document.public_id)::text as audits from app.business_documents document where document.public_id=$1`, [documentPublicId])).rows[0]!;
    assert.deepEqual({ status: stored.status, events: stored.events, audits: stored.audits }, { status: "archived", events: "3", audits: "2" }); assert.deepEqual(await readFile(path.join(storageRoot, stored.storage_key)), pdf);
  } finally {
    await pool.query("update app.platform_settings set value='false'::jsonb,version=version+1,updated_by_user_id=$1,updated_at=now() where setting_key='features.document_uploads'", [superAdmin.id]).catch(() => undefined);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await pool.end(); await rm(storageRoot, { recursive: true, force: true });
  }
});
