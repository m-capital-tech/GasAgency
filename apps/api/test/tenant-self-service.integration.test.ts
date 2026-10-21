import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createDatabasePool } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { gstinCheckDigit } from "../src/domain/gstin";
import { HttpError } from "../src/http/error";
import { tenantSelfServiceRouter } from "../src/routes/tenant-self-service";
import { hashSessionToken } from "../src/security/token";

const connectionString = process.env.TEST_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

function phone(suffix: string, prefix: string): string {
  const digits = String(Number.parseInt(suffix, 16) % 100_000_000).padStart(8, "0");
  return `+91${prefix}${digits}`;
}

integrationTest("tenant self-service is membership-scoped, owner-managed, auditable, and analytics-bounded", async () => {
  const pool = createDatabasePool({ connectionString: connectionString!, applicationName: "tenant-self-service-integration-test", maxConnections: 4, sslMode: "disable" });
  const tokenPepper = "tenant-self-service-test-pepper-32-chars";
  const ownerToken = `owner-${uuidV7()}-tenant-session`;
  const staffToken = `staff-${uuidV7()}-tenant-session`;
  const outsiderToken = `outsider-${uuidV7()}-tenant-session`;
  const suffix = uuidV7().replaceAll("-", "").slice(-8);
  const registrationNumber = String(Number.parseInt(suffix, 16) % 10_000).padStart(4, "0");
  const agencyPrefix = `29ABCDE${registrationNumber}F1Z`;
  const tenantPrefix = `27FGHIJ${registrationNumber}G1Z`;
  const agencyPublicId = uuidV7();
  const tenantPublicId = uuidV7();
  const outletPublicId = uuidV7();

  const superAdmin = (await pool.query<{ id: string }>(
    `select assignment.user_id::text as id from app.role_assignments assignment
      join app.roles role_row on role_row.id = assignment.role_id
     where role_row.role_type = 'super_admin' and assignment.status = 'active' limit 1`,
  )).rows[0];
  assert.ok(superAdmin, "bootstrap a Super Admin before this test");

  const agency = (await pool.query<{ id: string }>(
    `insert into app.agencies (
       public_id, legal_name, display_name, gstin, phone_e164, city, state_code,
       status, created_by_user_id, approved_by_user_id, approved_at
     ) values ($1,$2,$2,$3,$4,'Bengaluru','KA','approved',$5,$5,now()) returning id::text`,
    [agencyPublicId, `Tenant App Agency ${suffix}`, `${agencyPrefix}${gstinCheckDigit(agencyPrefix)}`, phone(suffix, "70"), superAdmin.id],
  )).rows[0]!;
  const owner = (await pool.query<{ id: string }>(
    "insert into app.users (public_id,phone_e164,full_name,status) values ($1,$2,$3,'active') returning id::text",
    [uuidV7(), phone(suffix, "71"), `Tenant Owner ${suffix}`],
  )).rows[0]!;
  const staff = (await pool.query<{ id: string }>(
    "insert into app.users (public_id,phone_e164,full_name,status) values ($1,$2,$3,'active') returning id::text",
    [uuidV7(), phone(suffix, "72"), `Tenant Staff ${suffix}`],
  )).rows[0]!;
  const outsider = (await pool.query<{ id: string }>(
    "insert into app.users (public_id,phone_e164,full_name,status) values ($1,$2,$3,'active') returning id::text",
    [uuidV7(), phone(suffix, "73"), `Tenant Outsider ${suffix}`],
  )).rows[0]!;
  const tenant = (await pool.query<{ id: string }>(
    `insert into app.tenants (
       public_id, legal_name, display_name, business_type, gstin, fssai_number, status,
       created_by_user_id, approved_by_user_id, approved_at
     ) values ($1,$2,$2,'restaurant',$3,'11223344556677','active',$4,$4,now()) returning id::text`,
    [tenantPublicId, `Tenant App Restaurant ${suffix}`, `${tenantPrefix}${gstinCheckDigit(tenantPrefix)}`, superAdmin.id],
  )).rows[0]!;
  const outlet = (await pool.query<{ id: string }>(
    `insert into app.outlets (
       public_id,tenant_id,label,address_line_1,city,state_code,pincode,latitude,longitude,
       in_use_count,spare_full_count,empty_count
     ) values ($1,$2,'Main kitchen','10 Tenant App Road','Bengaluru','KA','560001',12.9716,77.5946,2,4,3) returning id::text`,
    [outletPublicId, tenant.id],
  )).rows[0]!;
  await pool.query(
    `insert into app.agency_assignments (public_id,tenant_id,agency_id,assigned_by_user_id,reason,status)
     values ($1,$2,$3,$4,'Explicit tenant app assignment','active')`,
    [uuidV7(), tenant.id, agency.id, superAdmin.id],
  );
  await pool.query(
    `insert into app.tenant_memberships (public_id,tenant_id,user_id,membership_type,status,created_by_user_id,activated_at)
     values ($1,$2,$3,'owner','active',$5,now()),($4,$2,$6,'staff','active',$5,now())`,
    [uuidV7(), tenant.id, owner.id, uuidV7(), superAdmin.id, staff.id],
  );
  await pool.query(
    `insert into app.commercial_accounts (public_id,tenant_id,agency_id,payment_mode,status,opened_by_user_id)
     values ($1,$2,$3,'prepaid','open',$4)`,
    [uuidV7(), tenant.id, agency.id, superAdmin.id],
  );
  await pool.query(
    `insert into app.device_sessions (public_id,user_id,token_hash,expires_at,auth_method)
     values ($1,$2,$3,now()+interval '1 hour','otp'),($4,$5,$6,now()+interval '1 hour','otp'),($7,$8,$9,now()+interval '1 hour','otp')`,
    [uuidV7(), owner.id, hashSessionToken(ownerToken, tokenPepper), uuidV7(), staff.id, hashSessionToken(staffToken, tokenPepper), uuidV7(), outsider.id, hashSessionToken(outsiderToken, tokenPepper)],
  );

  const app = express();
  app.use(express.json());
  app.use("/v1", tenantSelfServiceRouter({ pool, tokenPepper }));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const known = error instanceof HttpError ? error : null;
    response.status(known?.status ?? 500).json({ error: { code: known?.code ?? "internal_error", message: known?.message ?? (error instanceof Error ? error.message : "failed") } });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/v1/tenants/${tenantPublicId}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

  try {
    const profile = await fetch(`${base}/profile`, { headers: headers(ownerToken) });
    assert.equal(profile.status, 200);
    const profileBody = await profile.json() as { user: { membershipType: string; canManage: boolean }; outlets: Array<{ publicId: string }> };
    assert.deepEqual({ membershipType: profileBody.user.membershipType, canManage: profileBody.user.canManage, outlet: profileBody.outlets[0]?.publicId }, { membershipType: "owner", canManage: true, outlet: outletPublicId });

    const staffDenied = await fetch(`${base}/outlets/${outletPublicId}`, {
      method: "POST", headers: headers(staffToken), body: JSON.stringify({ stock: { inUse: 2, spareFull: 5, empty: 3 } }),
    });
    assert.equal(staffDenied.status, 403);
    assert.equal((await staffDenied.json() as { error: { code: string } }).error.code, "tenant_management_required");

    const updated = await fetch(`${base}/outlets/${outletPublicId}`, {
      method: "POST", headers: headers(ownerToken), body: JSON.stringify({
        contactName: "Kitchen Manager", contactPhoneE164: phone(suffix, "74"), deliveryInstructions: "Use the rear loading entrance",
        stock: { inUse: 2, spareFull: 4, empty: 3 },
        requirement: { period: "week", preferredDeliveryDays: [1, 4], preferredSlot: "before_opening", items: [{ cylinderTypeCode: "commercial_19kg", expectedQuantity: 7 }] },
      }),
    });
    assert.equal(updated.status, 200, JSON.stringify(await updated.clone().json()));

    const dashboard = await fetch(`${base}/dashboard?period=weekly`, { headers: headers(ownerToken) });
    assert.equal(dashboard.status, 200, JSON.stringify(await dashboard.clone().json()));
    const dashboardBody = await dashboard.json() as { period: string; current: { orders: number }; outlets: Array<{ estimatedDaysRemaining: number | null }> };
    assert.deepEqual({ period: dashboardBody.period, orders: dashboardBody.current.orders, estimatedDaysRemaining: dashboardBody.outlets[0]?.estimatedDaysRemaining }, { period: "weekly", orders: 0, estimatedDaysRemaining: 5 });

    const support = await fetch(`${base}/support-cases`, {
      method: "POST", headers: headers(ownerToken), body: JSON.stringify({ kind: "support", category: "technical", priority: "high", subject: "Cannot update one device", description: "The second kitchen device cannot refresh the order list." }),
    });
    assert.equal(support.status, 201, JSON.stringify(await support.clone().json()));
    const change = await fetch(`${base}/support-cases`, {
      method: "POST", headers: headers(ownerToken), body: JSON.stringify({ kind: "change_request", changeField: "serving_agency", subject: "Review serving agency", description: "Please review the serving assignment for our new operating area." }),
    });
    assert.equal(change.status, 201, JSON.stringify(await change.clone().json()));

    const cases = await fetch(`${base}/support-cases`, { headers: headers(ownerToken) });
    assert.equal(cases.status, 200);
    const casesBody = await cases.json() as { cases: Array<{ category: string; events: unknown[] }> };
    assert.equal(casesBody.cases.length, 2);
    assert.deepEqual(new Set(casesBody.cases.map((item) => item.category)), new Set(["technical", "agency"]));
    assert.ok(casesBody.cases.every((item) => item.events.length === 1));

    const outsiderDenied = await fetch(`${base}/profile`, { headers: headers(outsiderToken) });
    assert.equal(outsiderDenied.status, 404);
    const persisted = (await pool.query<{ contact_name: string; expected_quantity: number; audits: string; cases: string }>(
      `select outlet.contact_name,
              (select sum(item.expected_quantity)::int from app.tenant_requirement_items item join app.tenant_requirements requirement on requirement.id=item.tenant_requirement_id where requirement.outlet_id=outlet.id) as expected_quantity,
              (select count(*) from app.audit_events audit where audit.actor_user_id=$2 and audit.entity_public_id in (outlet.public_id,$3,$4))::text as audits,
              (select count(*) from app.support_cases support where support.tenant_id=$1)::text as cases
         from app.outlets outlet where outlet.id=$5`,
      [tenant.id, owner.id, (await support.clone().json().catch(() => ({})) as { case?: { publicId?: string } }).case?.publicId ?? uuidV7(), (await change.clone().json().catch(() => ({})) as { case?: { publicId?: string } }).case?.publicId ?? uuidV7(), outlet.id],
    )).rows[0]!;
    assert.equal(persisted.contact_name, "Kitchen Manager");
    assert.equal(persisted.expected_quantity, 7);
    assert.equal(Number(persisted.audits), 3);
    assert.equal(Number(persisted.cases), 2);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
