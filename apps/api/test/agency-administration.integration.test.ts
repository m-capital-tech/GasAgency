import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createDatabasePool } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { agencyAdministrationRouter } from "../src/routes/agency-administration";
import { gstinCheckDigit } from "../src/domain/gstin";
import { HttpError } from "../src/http/error";
import { hashSessionToken } from "../src/security/token";

const connectionString = process.env.TEST_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

integrationTest("agency registration, maker-checker approval, owner access, staff, inventory, and lifecycle are governed end to end", async () => {
  const tokenPepper = "agency-administration-test-pepper-32-characters";
  const pool = createDatabasePool({ connectionString: connectionString!, applicationName: "agency-administration-integration-test", maxConnections: 4, statementTimeoutMs: 30_000, sslMode: "disable" });
  const superAdmin = (await pool.query<{ id: string }>(`select assignment.user_id::text as id from app.role_assignments assignment join app.roles role_row on role_row.id=assignment.role_id where role_row.role_type='super_admin' and assignment.status='active' limit 1`)).rows[0];
  assert.ok(superAdmin, "test database requires the seeded Super Admin");
  const token = `agency-admin-${uuidV7()}-session-token`;
  await pool.query("insert into app.device_sessions (public_id,user_id,token_hash,expires_at,auth_method,mfa_verified_at) values ($1,$2,$3,now()+interval '1 hour','bootstrap_test',now())", [uuidV7(), superAdmin.id, hashSessionToken(token, tokenPepper)]);

  const app = express(); app.use(express.json()); app.use("/v1", agencyAdministrationRouter({ pool, tokenPepper }));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => { const known = error instanceof HttpError ? error : null; response.status(known?.status ?? 500).json({ error: { code: known?.code ?? "internal_error", message: known?.message ?? (error instanceof Error ? error.message : "failed") } }); });
  const server = app.listen(0, "127.0.0.1"); await new Promise<void>((resolve) => server.once("listening", resolve)); const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/v1`; const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" }; const suffix = Date.now().toString(36);
  const gstinPrefix = `27ABCDE${Date.now().toString().slice(-4)}F1Z`; const agencyGstin = `${gstinPrefix}${gstinCheckDigit(gstinPrefix)}`;
  const agencyPhone = `+9187${Date.now().toString().slice(-8)}`; const ownerPhone = `+9186${Date.now().toString().slice(-8)}`;

  try {
    const createdResponse = await fetch(`${base}/admin/agencies`, { method: "POST", headers: { ...headers, "idempotency-key": `agency-${suffix}` }, body: JSON.stringify({
      legalName: `Integration Gas Agency ${suffix} Private Limited`, displayName: `Integration Gas ${suffix}`, gstin: agencyGstin,
      distributorCode: `HP-${suffix.toUpperCase()}`, omc: "HP", phoneE164: agencyPhone,
      owner: { fullName: `Agency Owner ${suffix}`, phoneE164: ownerPhone, email: `agency-owner-${suffix}@example.test` },
      address: { addressLine1: "14 Integration Industrial Estate", city: "Mumbai", stateCode: "MH", pincode: "400001", latitude: 18.9388, longitude: 72.8354 },
      serviceArea: { pincodes: ["400001", "400002"], radiusKm: 8 }, reason: "Integration test agency registration",
    }) });
    assert.equal(createdResponse.status, 201); const agency = (await createdResponse.json() as { agency: { publicId: string; status: string } }).agency; assert.equal(agency.status, "pending");

    const replay = await fetch(`${base}/admin/agencies`, { method: "POST", headers: { ...headers, "idempotency-key": `agency-${suffix}` }, body: JSON.stringify({
      legalName: `Integration Gas Agency ${suffix} Private Limited`, displayName: `Integration Gas ${suffix}`, gstin: agencyGstin,
      distributorCode: `HP-${suffix.toUpperCase()}`, omc: "HP", phoneE164: agencyPhone,
      owner: { fullName: `Agency Owner ${suffix}`, phoneE164: ownerPhone, email: `agency-owner-${suffix}@example.test` },
      address: { addressLine1: "14 Integration Industrial Estate", city: "Mumbai", stateCode: "MH", pincode: "400001", latitude: 18.9388, longitude: 72.8354 },
      serviceArea: { pincodes: ["400001", "400002"], radiusKm: 8 }, reason: "Integration test agency registration",
    }) });
    assert.equal(replay.status, 201);

    const selfApproval = await fetch(`${base}/admin/agencies/${agency.publicId}/reviews`, { method: "POST", headers, body: JSON.stringify({ decision: "approved", reason: "Integration approval without override", override: false }) });
    assert.equal(selfApproval.status, 409); assert.equal((await selfApproval.json() as { error: { code: string } }).error.code, "maker_checker_required");
    const approved = await fetch(`${base}/admin/agencies/${agency.publicId}/reviews`, { method: "POST", headers, body: JSON.stringify({ decision: "approved", reason: "Integration Super Admin maker-checker override", override: true }) });
    const approvedBody = await approved.json() as { agency?: { status: string }; ownerAccess?: unknown; error?: { message: string } };
    assert.equal(approved.status, 200, approvedBody.error?.message); assert.equal(approvedBody.agency?.status, "approved");

    const registry = await fetch(`${base}/admin/agency-registry?status=approved`, { headers });
    const registryBody = await registry.json() as { agencies?: Array<{ publicId: string }>; error?: { message: string } };
    assert.equal(registry.status, 200, registryBody.error?.message);
    assert.equal(registryBody.agencies?.some((item) => item.publicId === agency.publicId), true);
    const detail = await fetch(`${base}/admin/agency-registry/${agency.publicId}`, { headers }); assert.equal(detail.status, 200);
    assert.deepEqual((await detail.json() as { agency: { serviceArea: { pincodes: string[] }; reviews: unknown[] } }).agency.serviceArea.pincodes, ["400001", "400002"]);

    const staffResponse = await fetch(`${base}/agencies/${agency.publicId}/delivery-staff`, { method: "POST", headers, body: JSON.stringify({ fullName: `Driver ${suffix}`, phoneE164: `+9185${Date.now().toString().slice(-8)}`, vehicleType: "Three-wheeler", vehicleNumber: "MH 01 AB 1234", reason: "Integration delivery capacity" }) });
    assert.equal(staffResponse.status, 201); const staff = (await staffResponse.json() as { staff: { publicId: string } }).staff;
    const inventoryResponse = await fetch(`${base}/agencies/${agency.publicId}/inventory/adjustments`, { method: "POST", headers, body: JSON.stringify({ cylinderTypeCode: "commercial_19kg", fullDelta: 50, emptyDelta: 4, lowStockThreshold: 12, reason: "Integration opening stock count" }) });
    assert.equal(inventoryResponse.status, 200); const inventoryBody = await inventoryResponse.json() as { inventory: { fullOnHand: number; emptyOnHand: number; availableFull: number } }; assert.deepEqual({ full: inventoryBody.inventory.fullOnHand, empty: inventoryBody.inventory.emptyOnHand, available: inventoryBody.inventory.availableFull }, { full: 50, empty: 4, available: 50 });
    const staffSuspended = await fetch(`${base}/agencies/${agency.publicId}/delivery-staff/${staff.publicId}/lifecycle`, { method: "POST", headers, body: JSON.stringify({ action: "suspend", reason: "Integration access suspension" }) }); assert.equal(staffSuspended.status, 200);
    const agencySuspended = await fetch(`${base}/admin/agencies/${agency.publicId}/lifecycle`, { method: "POST", headers, body: JSON.stringify({ action: "suspend", reason: "Integration compliance hold" }) }); assert.equal(agencySuspended.status, 200);
    const agencyReinstated = await fetch(`${base}/admin/agencies/${agency.publicId}/lifecycle`, { method: "POST", headers, body: JSON.stringify({ action: "reinstate", reason: "Integration compliance cleared" }) }); assert.equal(agencyReinstated.status, 200);

    const stored = (await pool.query<{ reviews: string; inventory_events: string; audits: string; owner_assignments: string }>(`select
      (select count(*) from app.agency_reviews review join app.agencies agency_row on agency_row.id=review.agency_id where agency_row.public_id=$1)::text as reviews,
      (select count(*) from app.agency_inventory_events event join app.agency_inventory inventory on inventory.id=event.agency_inventory_id join app.agencies agency_row on agency_row.id=inventory.agency_id where agency_row.public_id=$1)::text as inventory_events,
      (select count(*) from app.audit_events where entity_public_id=$1)::text as audits,
      (select count(*) from app.role_assignments assignment join app.roles role_row on role_row.id=assignment.role_id where assignment.scope_kind='agency' and assignment.scope_value=$1::text and role_row.role_type='agency_owner')::text as owner_assignments`, [agency.publicId])).rows[0]!;
    assert.deepEqual(stored, { reviews: "3", inventory_events: "1", audits: "4", owner_assignments: "1" });
  } finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); await pool.end(); }
});
