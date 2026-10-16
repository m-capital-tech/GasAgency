import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { createDatabasePool } from "@platform/database";
import { uuidV7, type Logger } from "@platform/runtime";
import { createApp } from "../src/app";
import type { ApiConfig } from "../src/config";
import { gstinCheckDigit } from "../src/domain/gstin";
import { totpCode } from "../src/security/mfa";
import { hashSessionToken } from "../src/security/token";

const connectionString = process.env.TEST_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

integrationTest("delegated creator submits and a separate administrator activates one tenant", async () => {
  const tokenPepper = "integration-test-pepper-at-least-32-characters";
  const superToken = "integration-super-session-token-more-than-32-characters";
  const platformAdminToken = "integration-platform-admin-session-token-more-than-32-characters";
  const creatorToken = "integration-creator-session-token-more-than-32-characters";
  const agencyOperatorToken = "integration-agency-session-token-more-than-32-characters";
  const pool = createDatabasePool({ connectionString: connectionString!, applicationName: "tenant-onboarding-integration-test", maxConnections: 4, sslMode: "disable" });
  const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
  const config: ApiConfig = {
    appEnv: "test", port: 0, databaseUrl: connectionString!, databaseSslMode: "disable",
    databasePoolMax: 4, databaseStatementTimeoutMs: 15_000,
    corsOrigins: ["http://localhost:3000"], logLevel: "error", shutdownTimeoutMs: 5_000,
    sessionTokenPepper: tokenPepper,
    otpHashPepper: "integration-test-otp-hash-pepper-more-than-32-characters",
    otpDeliveryKey: Buffer.alloc(32, 7).toString("base64"),
    mfaEncryptionKey: Buffer.alloc(32, 11).toString("base64"),
    mfaTicketPepper: "integration-test-mfa-ticket-pepper-more-than-32-characters",
    mfaIssuer: "Commercial LPG Platform",
    mfaTicketTtlSeconds: 600,
    mfaMaxAttempts: 5,
    privilegedSessionTtlSeconds: 28_800,
    otpLocalCode: "123456",
    otpLocalExposeCode: true,
    otpTtlSeconds: 300,
    otpResendSeconds: 60,
    otpMaxAttempts: 5,
    sessionTtlSeconds: 2_592_000,
  };
  const superAdmin = (
    await pool.query<{ id: string }>(
      `select assignment.user_id::text as id
         from app.role_assignments assignment
         join app.roles role_row on role_row.id = assignment.role_id
        where role_row.role_type = 'super_admin' and assignment.scope_kind = 'global'
          and assignment.status = 'active' limit 1`,
    )
  ).rows[0];
  assert.ok(superAdmin, "bootstrap a Super Admin before this test");

  const agencyPrefix = "29ABCDE1234F1Z";
  const agencyPublicId = uuidV7();
  await pool.query(
    `insert into app.agencies (
       public_id, legal_name, display_name, gstin, phone_e164, city, state_code,
       status, created_by_user_id, approved_by_user_id, approved_at
     ) values ($1, 'Integration LPG Agency', 'Integration Agency', $2, '+919900000001', 'Bengaluru', 'KA', 'approved', $3, $3, now())`,
    [agencyPublicId, `${agencyPrefix}${gstinCheckDigit(agencyPrefix)}`, superAdmin.id],
  );
  const agencyPrice = (
    await pool.query<{ id: string }>(
      `insert into app.agency_prices (public_id, agency_id, cylinder_type_id, base_unit_price)
       select $1, agency.id, cylinder.id, 1800
         from app.agencies agency
         join app.cylinder_types cylinder on cylinder.code = 'commercial_19kg'
        where agency.public_id = $2
       returning id::text`,
      [uuidV7(), agencyPublicId],
    )
  ).rows[0]!;
  await pool.query(
    "insert into app.agency_price_slabs (agency_price_id, min_quantity, unit_price) values ($1, 5, 1750)",
    [agencyPrice.id],
  );
  await pool.query(
    `insert into app.device_sessions (public_id, user_id, token_hash, expires_at, auth_method, mfa_verified_at)
     values ($1, $2, $3, now() + interval '1 hour', 'bootstrap_test', now())`,
    [uuidV7(), superAdmin.id, hashSessionToken(superToken, tokenPepper)],
  );
  const agencyOperator = (
    await pool.query<{ id: string; public_id: string }>(
      `insert into app.users (public_id, phone_e164, full_name, status)
       values ($1, '+919900000004', 'Integration Agency Operator', 'active')
       returning id::text, public_id::text`,
      [uuidV7()],
    )
  ).rows[0]!;
  const agencyRole = (
    await pool.query<{ id: string }>(
      `insert into app.roles (public_id, name, role_type, managed_by_user_id)
       values ($1, 'Integration Agency Operations', 'agency_owner', $2)
       returning id::text`,
      [uuidV7(), superAdmin.id],
    )
  ).rows[0]!;
  await pool.query(
    `insert into app.role_permissions (role_id, permission_id, granted_by_user_id)
     select $1, permission.id, $2
       from app.permissions permission
      where permission.resource || '.' || permission.action = any($3::text[])`,
    [agencyRole.id, superAdmin.id, ["agency.view", "agency.edit", "order.view", "order.edit", "order.execute", "payment.view", "payment.create"]],
  );
  await pool.query(
    `insert into app.role_assignments (
       public_id, user_id, role_id, scope_kind, scope_value, assigned_by_user_id
     ) values ($1, $2, $3, 'agency', $4, $5)`,
    [uuidV7(), agencyOperator.id, agencyRole.id, agencyPublicId, superAdmin.id],
  );
  await pool.query(
    `insert into app.device_sessions (public_id, user_id, token_hash, expires_at, auth_method, mfa_verified_at)
     values ($1, $2, $3, now() + interval '1 hour', 'bootstrap_test', now())`,
    [uuidV7(), agencyOperator.id, hashSessionToken(agencyOperatorToken, tokenPepper)],
  );
  const deliveryUser = (
    await pool.query<{ id: string }>(
      `insert into app.users (public_id, phone_e164, full_name, status)
       values ($1, '+919900000005', 'Integration Delivery Partner', 'active')
       returning id::text`,
      [uuidV7()],
    )
  ).rows[0]!;
  const deliveryStaffPublicId = uuidV7();
  await pool.query(
    `insert into app.delivery_staff (
       public_id, agency_id, user_id, vehicle_type, vehicle_number, created_by_user_id
     ) select $1, agency.id, $2, 'Three-wheeler', 'KA01AB1234', $3
         from app.agencies agency where agency.public_id = $4`,
    [deliveryStaffPublicId, deliveryUser.id, agencyOperator.id, agencyPublicId],
  );
  await pool.query(
    `insert into app.agency_inventory (
       public_id, agency_id, cylinder_type_id, full_on_hand, empty_on_hand,
       reserved_full, with_accounts, low_stock_threshold, updated_by_user_id
     ) select $1, agency.id, cylinder.id, 20, 0, 0, 0, 5, $2
         from app.agencies agency
         join app.cylinder_types cylinder on cylinder.code = 'commercial_19kg'
        where agency.public_id = $3`,
    [uuidV7(), agencyOperator.id, agencyPublicId],
  );

  const server = createServer(createApp({ config, pool, logger }));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}/v1`;
  const jsonHeaders = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

  try {
    const platformAdminRoleResponse = await fetch(`${origin}/admin/roles`, {
      method: "POST", headers: jsonHeaders(superToken),
      body: JSON.stringify({
        name: "Integration Platform Administrator",
        roleType: "platform_admin",
        permissionKeys: [
          "tenant.view", "tenant.create", "tenant.edit", "tenant.submit", "tenant.approve", "tenant.reject",
          "agency.view", "credit.approve", "report.view", "user.view", "user.create", "role.view", "role.create", "role.manage",
        ],
        reason: "Delegated global platform administration for integration verification",
      }),
    });
    assert.equal(platformAdminRoleResponse.status, 201);
    const platformAdminRole = (await platformAdminRoleResponse.json() as { role: { publicId: string } }).role;

    const platformAdminResponse = await fetch(`${origin}/admin/team-members`, {
      method: "POST", headers: jsonHeaders(superToken),
      body: JSON.stringify({
        fullName: "Integration Platform Administrator", phoneE164: "+919900000006", email: "platform-admin@example.test",
        rolePublicId: platformAdminRole.publicId, scope: { kind: "global" },
        reason: "Assigned to administer the end-to-end integration workflow",
      }),
    });
    assert.equal(platformAdminResponse.status, 201);
    const platformAdminBody = await platformAdminResponse.json() as { user: { publicId: string }; invitation: { status: string; channel: string } };
    assert.deepEqual(
      { status: platformAdminBody.invitation.status, channel: platformAdminBody.invitation.channel },
      { status: "queued", channel: "sms" },
    );
    const platformAdmin = (
      await pool.query<{ id: string }>("update app.users set status = 'active' where public_id = $1 returning id::text", [platformAdminBody.user.publicId])
    ).rows[0]!;
    await pool.query(
      `insert into app.device_sessions (public_id, user_id, token_hash, expires_at, auth_method, mfa_verified_at)
       values ($1, $2, $3, now() + interval '1 hour', 'bootstrap_test', now())`,
      [uuidV7(), platformAdmin.id, hashSessionToken(platformAdminToken, tokenPepper)],
    );

    const nestedPlatformAdminRole = await fetch(`${origin}/admin/roles`, {
      method: "POST", headers: jsonHeaders(platformAdminToken),
      body: JSON.stringify({ name: "Forbidden Nested Platform Admin", roleType: "platform_admin", permissionKeys: ["tenant.view"], reason: "Must be rejected" }),
    });
    assert.equal(nestedPlatformAdminRole.status, 403);

    const reservedRole = await fetch(`${origin}/admin/roles`, {
      method: "POST", headers: jsonHeaders(platformAdminToken),
      body: JSON.stringify({ name: "Invalid Approver", roleType: "platform_team", permissionKeys: ["tenant.create", "tenant.approve"], reason: "Must reject reserved delegation" }),
    });
    assert.equal(reservedRole.status, 403);
    assert.equal((await reservedRole.json() as { error: { code: string } }).error.code, "reserved_permission");

    const roleResponse = await fetch(`${origin}/admin/roles`, {
      method: "POST", headers: jsonHeaders(platformAdminToken),
      body: JSON.stringify({ name: "Integration Onboarding Executive", roleType: "platform_team", permissionKeys: ["tenant.view", "tenant.create", "tenant.edit", "tenant.submit"], reason: "Delegated integration onboarding role" }),
    });
    assert.equal(roleResponse.status, 201);
    const role = (await roleResponse.json() as { role: { publicId: string } }).role;

    const memberResponse = await fetch(`${origin}/admin/team-members`, {
      method: "POST", headers: jsonHeaders(platformAdminToken),
      body: JSON.stringify({
        fullName: "Integration Onboarding Creator", phoneE164: "+919900000003", email: "creator@example.test",
        rolePublicId: role.publicId, scope: { kind: "city", value: "Bengaluru" },
        reason: "Assigned to Bengaluru onboarding operations",
      }),
    });
    assert.equal(memberResponse.status, 201);
    const memberBody = await memberResponse.json() as { user: { publicId: string }; invitation: { publicId: string; status: string; channel: string } };
    assert.match(memberBody.invitation.publicId, /^[0-9a-f-]{36}$/);
    assert.deepEqual({ status: memberBody.invitation.status, channel: memberBody.invitation.channel }, { status: "queued", channel: "sms" });
    const member = memberBody.user;
    const activatedMember = (
      await pool.query<{ id: string }>("update app.users set status = 'active' where public_id = $1 returning id::text", [member.publicId])
    ).rows[0]!;
    await pool.query(
      `insert into app.device_sessions (public_id, user_id, token_hash, expires_at, auth_method, mfa_verified_at)
       values ($1, $2, $3, now() + interval '1 hour', 'bootstrap_test', now())`,
      [uuidV7(), activatedMember.id, hashSessionToken(creatorToken, tokenPepper)],
    );

    const payload = {
      legalName: "Integration Restaurant Private Limited", displayName: "Integration Restaurant",
      businessType: "restaurant", gstin: "27AAPFU0939F1ZV", fssaiNumber: "11223344556677",
      owner: { fullName: "Integration Owner", phoneE164: "+919900000002", email: "owner@example.test" },
      outlet: {
        label: "Main kitchen", addressLine1: "100 Test Market Road", city: "Bengaluru", stateCode: "KA", pincode: "560001",
        latitude: 12.9716, longitude: 77.5946, stock: { inUse: 2, spareFull: 1, empty: 1 },
      },
      requirement: {
        period: "week", preferredDeliveryDays: [1, 4], preferredSlot: "before_opening",
        items: [{ cylinderTypeCode: "commercial_19kg", expectedQuantity: 6 }],
      },
      agencyPublicId,
      assignmentReason: "Selected by the onboarding operator for local service coverage",
      commercial: {
        requestedPaymentMode: "credit", proposedCreditLimit: 50_000, proposedNetTermDays: 15,
        proposalNote: "Requested by the tenant; requires Platform Admin approval",
      },
    };
    const creatorHeaders = { ...jsonHeaders(creatorToken), "idempotency-key": "tenant-integration-0001" };
    const endpoint = `${origin}/admin/tenants`;
    const unauthenticated = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": "tenant-integration-unauth" }, body: JSON.stringify(payload) });
    assert.equal(unauthenticated.status, 401);

    const missingRequiredFieldCases: Array<[string, Record<string, unknown>]> = [
      ["gstin", { ...payload, gstin: undefined }],
      ["address", { ...payload, outlet: { ...payload.outlet, addressLine1: undefined } }],
      ["requirement", { ...payload, requirement: undefined }],
      ["serving-agency", { ...payload, agencyPublicId: undefined }],
    ];
    for (const [field, invalidPayload] of missingRequiredFieldCases) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { ...jsonHeaders(creatorToken), "idempotency-key": `tenant-integration-missing-${field}` },
        body: JSON.stringify(invalidPayload),
      });
      assert.equal(response.status, 400, `tenant creation must reject a missing ${field}`);
      assert.equal((await response.json() as { error: { code: string } }).error.code, "invalid_request");
    }

    const created = await fetch(endpoint, { method: "POST", headers: creatorHeaders, body: JSON.stringify(payload) });
    assert.equal(created.status, 201);
    const createdBody = await created.json() as { tenant: { publicId: string; status: string } };
    assert.equal(createdBody.tenant.status, "draft");
    const replayed = await fetch(endpoint, { method: "POST", headers: creatorHeaders, body: JSON.stringify(payload) });
    assert.equal(replayed.status, 201);
    assert.equal(replayed.headers.get("idempotent-replayed"), "true");
    assert.deepEqual(await replayed.json(), createdBody);
    const reused = await fetch(endpoint, { method: "POST", headers: creatorHeaders, body: JSON.stringify({ ...payload, displayName: "Changed name" }) });
    assert.equal(reused.status, 409);

    const submitted = await fetch(`${endpoint}/${createdBody.tenant.publicId}/submit`, { method: "POST", headers: jsonHeaders(creatorToken) });
    assert.equal(submitted.status, 200);
    assert.equal((await submitted.json() as { tenant: { status: string } }).tenant.status, "pending_approval");
    const submittedAgain = await fetch(`${endpoint}/${createdBody.tenant.publicId}/submit`, { method: "POST", headers: jsonHeaders(creatorToken) });
    assert.equal((await submittedAgain.json() as { alreadySubmitted: boolean }).alreadySubmitted, true);

    const pendingQueue = await fetch(`${origin}/admin/tenants?status=pending_approval&limit=10`, { headers: { authorization: `Bearer ${superToken}` } });
    assert.equal(pendingQueue.status, 200);
    const pendingQueueBody = await pendingQueue.json() as { tenants: Array<{ publicId: string; status: string; agency: { publicId: string } }>; nextCursor: string | null };
    assert.deepEqual(pendingQueueBody.tenants.map((tenant) => ({ publicId: tenant.publicId, status: tenant.status, agencyPublicId: tenant.agency.publicId })), [{ publicId: createdBody.tenant.publicId, status: "pending_approval", agencyPublicId }]);
    assert.equal(pendingQueueBody.nextCursor, null);
    const creatorScopedAgencies = await fetch(`${origin}/admin/agencies`, { headers: { authorization: `Bearer ${creatorToken}` } });
    assert.equal(creatorScopedAgencies.status, 200);
    assert.deepEqual((await creatorScopedAgencies.json() as { agencies: Array<{ publicId: string }> }).agencies.map((agency) => agency.publicId), [agencyPublicId]);
    const creatorRoleAccess = await fetch(`${origin}/admin/roles`, { headers: { authorization: `Bearer ${creatorToken}` } });
    assert.equal(creatorRoleAccess.status, 403);

    const creatorApproval = await fetch(`${endpoint}/${createdBody.tenant.publicId}/reviews`, {
      method: "POST", headers: jsonHeaders(creatorToken),
      body: JSON.stringify({ decision: "approved", reason: "Creator must not approve" }),
    });
    assert.equal(creatorApproval.status, 403);

    const approved = await fetch(`${endpoint}/${createdBody.tenant.publicId}/reviews`, {
      method: "POST", headers: jsonHeaders(platformAdminToken),
      body: JSON.stringify({
        decision: "approved", reason: "Business, GSTIN, requirement, and agency assignment reviewed",
        commercialDecision: { decision: "approved", creditLimit: 50_000, netTermDays: 15, note: "Approved after commercial review" },
      }),
    });
    assert.equal(approved.status, 200);
    const approvedBody = await approved.json() as { tenant: { status: string }; invitation: { status: string; channel: string }; commercialAccount: { publicId: string; paymentMode: string } };
    assert.equal(approvedBody.tenant.status, "active");
    assert.deepEqual({ status: approvedBody.invitation.status, channel: approvedBody.invitation.channel }, { status: "queued", channel: "sms" });
    assert.equal(approvedBody.commercialAccount.paymentMode, "credit");
    await pool.query(
      `insert into app.commercial_account_prices (public_id, commercial_account_id, cylinder_type_id, unit_price, set_by_user_id, reason)
       select $1, account.id, cylinder.id, 1700, $3, 'Integration negotiated tenant price'
         from app.commercial_accounts account
         join app.tenants tenant on tenant.id = account.tenant_id
         join app.cylinder_types cylinder on cylinder.code = 'commercial_19kg'
        where tenant.public_id = $2 and account.status = 'open'`,
      [uuidV7(), createdBody.tenant.publicId, superAdmin.id],
    );

    const tenantOtpRequest = await fetch(`${origin}/auth/otp/request`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneE164: payload.owner.phoneE164 }),
    });
    assert.equal(tenantOtpRequest.status, 202);
    const tenantChallenge = await tenantOtpRequest.json() as { challengePublicId: string; localDebugCode: string };
    assert.equal(tenantChallenge.localDebugCode, "123456");
    const repeatedRequest = await fetch(`${origin}/auth/otp/request`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneE164: payload.owner.phoneE164 }),
    });
    assert.equal((await repeatedRequest.json() as { challengePublicId: string }).challengePublicId, tenantChallenge.challengePublicId);

    const wrongOtp = await fetch(`${origin}/auth/otp/verify`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengePublicId: tenantChallenge.challengePublicId, code: "000000", deviceName: "Integration phone" }),
    });
    assert.equal(wrongOtp.status, 422);
    const verifiedOtp = await fetch(`${origin}/auth/otp/verify`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengePublicId: tenantChallenge.challengePublicId, code: tenantChallenge.localDebugCode, deviceName: "Integration phone", deviceIdentifier: "integration-device-0001" }),
    });
    assert.equal(verifiedOtp.status, 200);
    const authenticated = await verifiedOtp.json() as { status: string; accessToken: string; tenants: Array<{ publicId: string }> };
    assert.equal(authenticated.status, "authenticated");
    assert.ok(authenticated.accessToken.length >= 32);
    assert.deepEqual(authenticated.tenants.map((tenant) => tenant.publicId), [createdBody.tenant.publicId]);
    const restoredSession = await fetch(`${origin}/auth/session`, {
      headers: { authorization: `Bearer ${authenticated.accessToken}` },
    });
    assert.equal(restoredSession.status, 200);
    const restoredSessionBody = await restoredSession.json() as {
      user: { fullName: string; phoneE164: string };
      session: { authMethod: string };
      tenants: Array<{ publicId: string; displayName: string }>;
    };
    assert.equal(restoredSessionBody.user.fullName, payload.owner.fullName);
    assert.equal(restoredSessionBody.user.phoneE164, payload.owner.phoneE164);
    assert.equal(restoredSessionBody.session.authMethod, "otp");
    assert.deepEqual(restoredSessionBody.tenants, [{ publicId: createdBody.tenant.publicId, displayName: payload.displayName, membershipType: "owner" }]);

    const tenantAuthorization = { authorization: `Bearer ${authenticated.accessToken}` };
    const tenantJsonHeaders = { ...tenantAuthorization, "content-type": "application/json" };
    const homeResponse = await fetch(`${origin}/tenants/${createdBody.tenant.publicId}/home`, { headers: tenantAuthorization });
    assert.equal(homeResponse.status, 200);
    const home = await homeResponse.json() as {
      outlets: Array<{ publicId: string; stock: { inUse: number; spareFull: number; empty: number } }>;
      catalog: Array<{ cylinderTypeCode: string; baseUnitPrice: string; negotiatedUnitPrice: string | null }>;
      paymentMethods: string[];
      credit: { limit: string; available: string; netTermDays: number; eligible: boolean };
      deliverySlots: Array<{ code: string }>;
    };
    assert.deepEqual(home.outlets[0]?.stock, { inUse: 2, spareFull: 1, empty: 1 });
    assert.deepEqual(home.catalog[0], { cylinderTypeCode: "commercial_19kg", displayName: "19 kg commercial cylinder", weightKg: 19, baseUnitPrice: "1800.00", negotiatedUnitPrice: "1700.00", slabs: [{ minQuantity: 5, unitPrice: "1750.00" }] });
    assert.deepEqual(home.paymentMethods, ["cod", "credit"]);
    assert.deepEqual(home.credit, { status: "approved", limit: "50000.00", used: "0.00", available: "50000.00", netTermDays: 15, overdue: false, eligible: true });
    assert.deepEqual(home.deliverySlots.map((slot) => slot.code), ["before_opening", "standard", "evening", "express"]);

    const quoteResponse = await fetch(`${origin}/tenants/${createdBody.tenant.publicId}/quotes`, {
      method: "POST",
      headers: tenantJsonHeaders,
      body: JSON.stringify({
        outletPublicId: home.outlets[0]!.publicId,
        deliverySlot: "standard",
        paymentMethod: "credit",
        items: [{ cylinderTypeCode: "commercial_19kg", quantity: 5 }],
      }),
    });
    assert.equal(quoteResponse.status, 201);
    const quote = (await quoteResponse.json() as { quote: { publicId: string; subtotal: string; gstAmount: string; totalAmount: string; items: Array<{ unitPrice: string; priceSource: string }> } }).quote;
    assert.deepEqual({ subtotal: quote.subtotal, gstAmount: quote.gstAmount, totalAmount: quote.totalAmount }, { subtotal: "8500.00", gstAmount: "1530.00", totalAmount: "10030.00" });
    assert.deepEqual(quote.items.map((item) => ({ unitPrice: item.unitPrice, priceSource: item.priceSource })), [{ unitPrice: "1700.00", priceSource: "negotiated" }]);

    const orderEndpoint = `${origin}/tenants/${createdBody.tenant.publicId}/orders`;
    const orderHeaders = { ...tenantJsonHeaders, "idempotency-key": "tenant-order-integration-0001" };
    const orderPayload = { quotePublicId: quote.publicId, emptiesExpected: 3, deliveryInstructions: "Deliver at the main kitchen receiving gate" };
    const placedOrder = await fetch(orderEndpoint, { method: "POST", headers: orderHeaders, body: JSON.stringify(orderPayload) });
    const placedBody = await placedOrder.json() as { order: { publicId: string; orderNumber: string; status: string; paymentStatus: string; totalAmount: string } };
    assert.equal(placedOrder.status, 201, JSON.stringify(placedBody));
    assert.equal(placedBody.order.status, "placed");
    assert.equal(placedBody.order.paymentStatus, "credit_reserved");
    assert.equal(placedBody.order.totalAmount, "10030.00");
    assert.match(placedBody.order.orderNumber, /^ORD-[0-9]{8}-[A-F0-9]{8}$/);
    const replayedOrder = await fetch(orderEndpoint, { method: "POST", headers: orderHeaders, body: JSON.stringify(orderPayload) });
    assert.equal(replayedOrder.status, 201);
    assert.equal(replayedOrder.headers.get("idempotent-replayed"), "true");
    assert.deepEqual(await replayedOrder.json(), placedBody);

    const agencyAuthorization = { authorization: `Bearer ${agencyOperatorToken}` };
    const agencyJsonHeaders = { ...agencyAuthorization, "content-type": "application/json" };
    const agencySession = await fetch(`${origin}/auth/session`, { headers: agencyAuthorization });
    assert.equal(agencySession.status, 200);
    const agencySessionBody = await agencySession.json() as { agencies: Array<{ publicId: string; displayName: string; roleTypes: string[] }> };
    assert.deepEqual(agencySessionBody.agencies, [{ publicId: agencyPublicId, displayName: "Integration Agency", roleTypes: ["agency_owner"] }]);

    const agencyOrdersEndpoint = `${origin}/agencies/${agencyPublicId}/orders`;
    const tenantAgencyAccess = await fetch(agencyOrdersEndpoint, { headers: tenantAuthorization });
    assert.equal(tenantAgencyAccess.status, 403);
    const agencyOrderList = await fetch(agencyOrdersEndpoint, { headers: agencyAuthorization });
    assert.equal(agencyOrderList.status, 200);
    const listedOrders = (await agencyOrderList.json() as { orders: Array<{ publicId: string; status: string }> }).orders;
    assert.deepEqual(listedOrders.map((order) => ({ publicId: order.publicId, status: order.status })), [{ publicId: placedBody.order.publicId, status: "placed" }]);

    const initialInventoryResponse = await fetch(`${origin}/agencies/${agencyPublicId}/inventory`, { headers: agencyAuthorization });
    assert.equal(initialInventoryResponse.status, 200);
    const initialInventory = (await initialInventoryResponse.json() as { inventory: Array<{ publicId: string; cylinderTypeCode: string; displayName: string; fullOnHand: number; reservedFull: number; availableFull: number; emptyOnHand: number; withAccounts: number; lowStockThreshold: number }> }).inventory[0]!;
    assert.deepEqual(initialInventory, { publicId: initialInventory.publicId, cylinderTypeCode: "commercial_19kg", displayName: "19 kg commercial cylinder", fullOnHand: 20, reservedFull: 0, availableFull: 20, emptyOnHand: 0, withAccounts: 0, lowStockThreshold: 5 });

    const transitionEndpoint = `${agencyOrdersEndpoint}/${placedBody.order.publicId}/transitions`;
    const transition = async (key: string, body: Record<string, unknown>) => fetch(transitionEndpoint, {
      method: "POST", headers: { ...agencyJsonHeaders, "idempotency-key": key }, body: JSON.stringify(body),
    });
    const accepted = await transition("agency-order-accept-0001", { action: "accept" });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json() as { order: { status: string } }).order.status, "accepted");
    const reservedInventory = (await (await fetch(`${origin}/agencies/${agencyPublicId}/inventory`, { headers: agencyAuthorization })).json() as { inventory: Array<{ fullOnHand: number; reservedFull: number; availableFull: number }> }).inventory[0]!;
    assert.deepEqual({ fullOnHand: reservedInventory.fullOnHand, reservedFull: reservedInventory.reservedFull, availableFull: reservedInventory.availableFull }, { fullOnHand: 20, reservedFull: 5, availableFull: 15 });

    const assigned = await transition("agency-order-assign-0001", { action: "assign", deliveryStaffPublicId });
    assert.equal(assigned.status, 200);
    const assignedOrder = (await assigned.json() as { order: { status: string; deliveryStaff: { publicId: string; fullName: string } } }).order;
    assert.deepEqual({ status: assignedOrder.status, publicId: assignedOrder.deliveryStaff.publicId, fullName: assignedOrder.deliveryStaff.fullName }, { status: "assigned", publicId: deliveryStaffPublicId, fullName: "Integration Delivery Partner" });

    const dispatched = await transition("agency-order-dispatch-0001", { action: "dispatch" });
    assert.equal(dispatched.status, 200);
    assert.equal((await dispatched.json() as { order: { status: string } }).order.status, "out_for_delivery");
    const dispatchedInventory = (await (await fetch(`${origin}/agencies/${agencyPublicId}/inventory`, { headers: agencyAuthorization })).json() as { inventory: Array<{ fullOnHand: number; reservedFull: number }> }).inventory[0]!;
    assert.deepEqual({ fullOnHand: dispatchedInventory.fullOnHand, reservedFull: dispatchedInventory.reservedFull }, { fullOnHand: 15, reservedFull: 0 });

    const deliveryPayload = { action: "deliver", cashCollected: false, emptiesCollected: [{ cylinderTypeCode: "commercial_19kg", quantity: 1 }] };
    const delivered = await transition("agency-order-deliver-0001", deliveryPayload);
    assert.equal(delivered.status, 200);
    const deliveredBody = await delivered.json() as { order: { status: string; payment: { status: string }; delivery: { emptiesCollected: number }; invoice: { status: string; outstandingAmount: string; dueAt: string } } };
    assert.equal(deliveredBody.order.status, "delivered");
    assert.equal(deliveredBody.order.payment.status, "credit_due");
    assert.equal(deliveredBody.order.delivery.emptiesCollected, 1);
    assert.equal(deliveredBody.order.invoice.status, "open");
    assert.equal(deliveredBody.order.invoice.outstandingAmount, "10030.00");
    assert.ok(deliveredBody.order.invoice.dueAt);
    const replayedDelivery = await transition("agency-order-deliver-0001", deliveryPayload);
    assert.equal(replayedDelivery.status, 200);
    assert.equal(replayedDelivery.headers.get("idempotent-replayed"), "true");
    assert.deepEqual(await replayedDelivery.json(), deliveredBody);

    const completedInventory = (await (await fetch(`${origin}/agencies/${agencyPublicId}/inventory`, { headers: agencyAuthorization })).json() as { inventory: Array<{ fullOnHand: number; emptyOnHand: number; reservedFull: number; withAccounts: number }> }).inventory[0]!;
    assert.deepEqual({ fullOnHand: completedInventory.fullOnHand, emptyOnHand: completedInventory.emptyOnHand, reservedFull: completedInventory.reservedFull, withAccounts: completedInventory.withAccounts }, { fullOnHand: 15, emptyOnHand: 1, reservedFull: 0, withAccounts: 4 });
    const updatedHome = await fetch(`${origin}/tenants/${createdBody.tenant.publicId}/home`, { headers: tenantAuthorization });
    assert.equal(updatedHome.status, 200);
    const updatedHomeBody = await updatedHome.json() as { outlets: Array<{ stock: { inUse: number; spareFull: number; empty: number } }>; credit: { used: string; available: string } };
    assert.deepEqual(updatedHomeBody.outlets[0]!.stock, { inUse: 2, spareFull: 6, empty: 0 });
    assert.deepEqual({ used: updatedHomeBody.credit.used, available: updatedHomeBody.credit.available }, { used: "10030.00", available: "39970.00" });

    const accountsEndpoint = `${origin}/agencies/${agencyPublicId}/accounts`;
    const tenantAccountAccess = await fetch(accountsEndpoint, { headers: tenantAuthorization });
    assert.equal(tenantAccountAccess.status, 403);
    const accountsResponse = await fetch(accountsEndpoint, { headers: agencyAuthorization });
    assert.equal(accountsResponse.status, 200);
    const accountsBody = await accountsResponse.json() as {
      agency: { creditEnabled: boolean };
      accounts: Array<{
        publicId: string;
        credit: { limit: string; netTermDays: number };
        receivables: { outstanding: string; overdue: string; openInvoiceCount: number };
        collections: { total: string };
        prices: Array<{ cylinderTypeCode: string; negotiatedUnitPrice: string; negotiatedActive: boolean }>;
      }>;
    };
    assert.equal(accountsBody.agency.creditEnabled, true);
    assert.equal(accountsBody.accounts.length, 1);
    assert.equal(accountsBody.accounts[0]!.publicId, approvedBody.commercialAccount.publicId);
    assert.deepEqual(accountsBody.accounts[0]!.credit, { status: "approved", limit: "50000.00", netTermDays: 15 });
    assert.deepEqual(accountsBody.accounts[0]!.receivables, { outstanding: "10030.00", overdue: "0.00", openInvoiceCount: 1 });
    assert.deepEqual(accountsBody.accounts[0]!.prices, [{ cylinderTypeCode: "commercial_19kg", displayName: "19 kg commercial cylinder", baseUnitPrice: "1800.00", negotiatedUnitPrice: "1700.00", negotiatedActive: true }]);

    const priceEndpoint = `${accountsEndpoint}/${approvedBody.commercialAccount.publicId}/prices`;
    const priceHeaders = { ...agencyJsonHeaders, "idempotency-key": "agency-price-update-0001" };
    const pricePayload = { cylinderTypeCode: "commercial_19kg", active: true, unitPrice: "1600.00", reason: "Renewed annual volume agreement" };
    const updatedPrice = await fetch(priceEndpoint, { method: "POST", headers: priceHeaders, body: JSON.stringify(pricePayload) });
    assert.equal(updatedPrice.status, 200);
    assert.equal((await updatedPrice.json() as { price: { unitPrice: string; active: boolean } }).price.unitPrice, "1600.00");
    const replayedPrice = await fetch(priceEndpoint, { method: "POST", headers: priceHeaders, body: JSON.stringify(pricePayload) });
    assert.equal(replayedPrice.status, 200);
    assert.equal(replayedPrice.headers.get("idempotent-replayed"), "true");

    const creditPolicyEndpoint = `${origin}/agencies/${agencyPublicId}/credit-policy`;
    const pausedCredit = await fetch(creditPolicyEndpoint, {
      method: "POST", headers: { ...agencyJsonHeaders, "idempotency-key": "agency-credit-pause-0001" },
      body: JSON.stringify({ creditEnabled: false, reason: "Temporary agency-wide credit pause for reconciliation" }),
    });
    assert.equal(pausedCredit.status, 200);
    assert.equal((await pausedCredit.json() as { agency: { creditEnabled: boolean } }).agency.creditEnabled, false);
    const pausedQuote = await fetch(`${origin}/tenants/${createdBody.tenant.publicId}/quotes`, {
      method: "POST", headers: tenantJsonHeaders,
      body: JSON.stringify({ outletPublicId: home.outlets[0]!.publicId, deliverySlot: "standard", paymentMethod: "credit", items: [{ cylinderTypeCode: "commercial_19kg", quantity: 1 }] }),
    });
    assert.equal(pausedQuote.status, 422);
    const restoredCredit = await fetch(creditPolicyEndpoint, {
      method: "POST", headers: { ...agencyJsonHeaders, "idempotency-key": "agency-credit-restore-0001" },
      body: JSON.stringify({ creditEnabled: true, reason: "Agency reconciliation completed" }),
    });
    assert.equal(restoredCredit.status, 200);

    const paymentEndpoint = `${accountsEndpoint}/${approvedBody.commercialAccount.publicId}/payments`;
    const paymentHeaders = { ...agencyJsonHeaders, "idempotency-key": "agency-payment-record-0001" };
    const paymentPayload = { amount: "4000.00", paymentMethod: "bank_transfer", reference: "UTR-INTEGRATION-0001", note: "Part settlement received from tenant" };
    const recordedPayment = await fetch(paymentEndpoint, { method: "POST", headers: paymentHeaders, body: JSON.stringify(paymentPayload) });
    assert.equal(recordedPayment.status, 201);
    const recordedPaymentBody = await recordedPayment.json() as { payment: { amount: string; allocations: Array<{ invoiceNumber: string; amount: string }> } };
    assert.equal(recordedPaymentBody.payment.amount, "4000.00");
    assert.equal(recordedPaymentBody.payment.allocations.length, 1);
    assert.equal(recordedPaymentBody.payment.allocations[0]!.amount, "4000.00");
    const replayedPayment = await fetch(paymentEndpoint, { method: "POST", headers: paymentHeaders, body: JSON.stringify(paymentPayload) });
    assert.equal(replayedPayment.status, 201);
    assert.equal(replayedPayment.headers.get("idempotent-replayed"), "true");
    assert.deepEqual(await replayedPayment.json(), recordedPaymentBody);
    await assert.rejects(
      pool.query("update app.payment_collections set note = 'Mutation must fail' where public_id = (select public_id from app.payment_collections order by id limit 1)"),
      (error: unknown) => typeof error === "object" && error !== null && "code" in error && error.code === "55000",
    );
    const paymentsResponse = await fetch(`${origin}/agencies/${agencyPublicId}/payments`, { headers: agencyAuthorization });
    assert.equal(paymentsResponse.status, 200);
    assert.equal((await paymentsResponse.json() as { payments: Array<{ amount: string }> }).payments[0]!.amount, "4000.00");
    const accountsAfterPayment = await fetch(accountsEndpoint, { headers: agencyAuthorization });
    const accountAfterPayment = (await accountsAfterPayment.json() as { accounts: Array<{ receivables: { outstanding: string }; collections: { total: string }; prices: Array<{ negotiatedUnitPrice: string }> }> }).accounts[0]!;
    assert.deepEqual({ outstanding: accountAfterPayment.receivables.outstanding, collected: accountAfterPayment.collections.total, negotiatedUnitPrice: accountAfterPayment.prices[0]!.negotiatedUnitPrice }, { outstanding: "6030.00", collected: "4000.00", negotiatedUnitPrice: "1600.00" });
    const unchangedAdminCredit = await pool.query<{ credit_limit: string; net_term_days: number }>(
      `select credit.credit_limit::text, credit.net_term_days
         from app.credit_accounts credit
         join app.commercial_accounts account on account.id = credit.commercial_account_id
        where account.public_id = $1`,
      [approvedBody.commercialAccount.publicId],
    );
    assert.deepEqual(unchangedAdminCredit.rows[0], { credit_limit: "50000.00", net_term_days: 15 });

    const tenantOrdersResponse = await fetch(`${origin}/tenants/${createdBody.tenant.publicId}/orders`, { headers: tenantAuthorization });
    assert.equal(tenantOrdersResponse.status, 200);
    const tenantOrders = (await tenantOrdersResponse.json() as { orders: Array<{ publicId: string; status: string; invoice: { publicId: string; outstandingAmount: string } }> }).orders;
    assert.equal(tenantOrders.length, 1);
    assert.deepEqual(
      { publicId: tenantOrders[0]!.publicId, status: tenantOrders[0]!.status, outstandingAmount: tenantOrders[0]!.invoice.outstandingAmount },
      { publicId: placedBody.order.publicId, status: "delivered", outstandingAmount: "6030.00" },
    );
    const tenantOrderDetailResponse = await fetch(`${origin}/tenants/${createdBody.tenant.publicId}/orders/${placedBody.order.publicId}`, { headers: tenantAuthorization });
    assert.equal(tenantOrderDetailResponse.status, 200);
    const tenantOrderDetail = (await tenantOrderDetailResponse.json() as { order: { timeline: Array<{ toStatus: string }> } }).order;
    assert.deepEqual(tenantOrderDetail.timeline.map((event) => event.toStatus), ["placed", "accepted", "assigned", "out_for_delivery", "delivered"]);
    const billingResponse = await fetch(`${origin}/tenants/${createdBody.tenant.publicId}/billing`, { headers: tenantAuthorization });
    assert.equal(billingResponse.status, 200);
    const billing = await billingResponse.json() as {
      account: { credit: { limit: string; used: string; available: string; netTermDays: number } };
      summary: { outstandingAmount: string };
      invoices: Array<{ publicId: string; status: string; outstandingAmount: string }>;
    };
    assert.deepEqual(billing.account.credit, { status: "approved", limit: "50000.00", used: "6030.00", available: "43970.00", netTermDays: 15 });
    assert.equal(billing.summary.outstandingAmount, "6030.00");
    assert.deepEqual(billing.invoices.map((invoice) => ({ status: invoice.status, outstandingAmount: invoice.outstandingAmount })), [{ status: "open", outstandingAmount: "6030.00" }]);
    const invoiceDetailResponse = await fetch(`${origin}/tenants/${createdBody.tenant.publicId}/invoices/${billing.invoices[0]!.publicId}`, { headers: tenantAuthorization });
    assert.equal(invoiceDetailResponse.status, 200);
    const invoiceDetail = (await invoiceDetailResponse.json() as {
      invoice: {
        outstandingAmount: string;
        items: Array<{ cylinderTypeCode: string; quantity: number }>;
        payments: Array<{ amount: string; paymentMethod: string; reference: string }>;
      };
    }).invoice;
    assert.equal(invoiceDetail.outstandingAmount, "6030.00");
    assert.deepEqual(
      invoiceDetail.payments.map((payment) => ({ amount: payment.amount, paymentMethod: payment.paymentMethod, reference: payment.reference })),
      [{ amount: "4000.00", paymentMethod: "bank_transfer", reference: "UTR-INTEGRATION-0001" }],
    );
    assert.deepEqual(invoiceDetail.items.map((item) => ({ cylinderTypeCode: item.cylinderTypeCode, quantity: item.quantity })), [{ cylinderTypeCode: "commercial_19kg", quantity: 5 }]);

    const tenantDetailResponse = await fetch(`${origin}/admin/tenants/${createdBody.tenant.publicId}`, { headers: { authorization: `Bearer ${superToken}` } });
    assert.equal(tenantDetailResponse.status, 200);
    const tenantDetail = (await tenantDetailResponse.json() as { tenant: { status: string; owner: { phoneE164: string }; requirement: { items: Array<{ cylinderTypeCode: string; expectedQuantity: number }> }; capabilities: { canApproveCredit: boolean } } }).tenant;
    assert.equal(tenantDetail.status, "active");
    assert.equal(tenantDetail.owner.phoneE164, payload.owner.phoneE164);
    assert.deepEqual(tenantDetail.requirement.items, [{ cylinderTypeCode: "commercial_19kg", displayName: "19 kg commercial cylinder", expectedQuantity: 6 }]);
    assert.equal(tenantDetail.capabilities.canApproveCredit, true);
    const overviewResponse = await fetch(`${origin}/admin/overview`, { headers: { authorization: `Bearer ${superToken}` } });
    assert.equal(overviewResponse.status, 200);
    const overview = await overviewResponse.json() as { onboarding: { total: number; active: number; pendingApprovals: number }; month: { orders: number; gmv: string }; receivables: { open: string } };
    assert.deepEqual(overview.onboarding, { total: 1, active: 1, pendingApprovals: 0, changesRequested: 0, pendingCreditDecisions: 0, approvalSlaBreaches: 0 });
    assert.equal(overview.month.orders, 1);
    assert.equal(overview.month.gmv, "10030.00");
    assert.equal(overview.receivables.open, "6030.00");
    const rolesResponse = await fetch(`${origin}/admin/roles`, { headers: { authorization: `Bearer ${platformAdminToken}` } });
    assert.equal(rolesResponse.status, 200);
    assert.ok((await rolesResponse.json() as { roles: Array<{ name: string }> }).roles.some((role) => role.name === "Integration Onboarding Executive"));
    const teamResponse = await fetch(`${origin}/admin/team-members`, { headers: { authorization: `Bearer ${platformAdminToken}` } });
    assert.equal(teamResponse.status, 200);
    assert.ok((await teamResponse.json() as { teamMembers: Array<{ fullName: string }> }).teamMembers.some((memberRow) => memberRow.fullName === "Integration Onboarding Creator"));

    const replayedOtp = await fetch(`${origin}/auth/otp/verify`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengePublicId: tenantChallenge.challengePublicId, code: tenantChallenge.localDebugCode }),
    });
    assert.equal(replayedOtp.status, 422);

    const unknownRequestOne = await fetch(`${origin}/auth/otp/request`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneE164: "+919900009999" }),
    });
    const unknownOne = await unknownRequestOne.json() as { challengePublicId: string; localDebugCode?: string };
    const unknownRequestTwo = await fetch(`${origin}/auth/otp/request`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneE164: "+919900009999" }),
    });
    const unknownTwo = await unknownRequestTwo.json() as { challengePublicId: string; localDebugCode?: string };
    assert.equal(unknownTwo.challengePublicId, unknownOne.challengePublicId);
    assert.equal(unknownOne.localDebugCode, undefined);

    const platformOtpRequest = await fetch(`${origin}/auth/otp/request`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneE164: "+919900000003" }),
    });
    const platformChallenge = await platformOtpRequest.json() as { challengePublicId: string; localDebugCode: string };
    const platformVerify = await fetch(`${origin}/auth/otp/verify`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ challengePublicId: platformChallenge.challengePublicId, code: platformChallenge.localDebugCode }),
    });
    assert.equal(platformVerify.status, 200);
    const platformHandoff = await platformVerify.json() as { status: string; mfaTicket: string; expiresInSeconds: number; user: { publicId: string } };
    assert.equal(platformHandoff.status, "mfa_enrollment_required");
    assert.equal(platformHandoff.expiresInSeconds, 600);
    assert.equal(platformHandoff.user.publicId, member.publicId);

    const enrollmentResponse = await fetch(`${origin}/auth/mfa/enroll`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mfaTicket: platformHandoff.mfaTicket, label: "Integration authenticator" }),
    });
    assert.equal(enrollmentResponse.status, 200);
    const enrollment = await enrollmentResponse.json() as { factorPublicId: string; manualKey: string; otpauthUri: string };
    assert.match(enrollment.otpauthUri, /^otpauth:\/\/totp\//);
    const currentAuthenticatorCode = totpCode(enrollment.manualKey, Math.floor(Date.now() / 30_000));
    const enrollmentVerification = await fetch(`${origin}/auth/mfa/enroll/verify`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ mfaTicket: platformHandoff.mfaTicket, factorPublicId: enrollment.factorPublicId, code: currentAuthenticatorCode }),
    });
    assert.equal(enrollmentVerification.status, 200);
    const enrolled = await enrollmentVerification.json() as { status: string; accessToken: string; recoveryCodes: string[]; platformAccess: { roleTypes: string[] } };
    assert.equal(enrolled.status, "authenticated");
    assert.equal(enrolled.recoveryCodes.length, 10);
    assert.ok(enrolled.platformAccess.roleTypes.includes("platform_team"));
    const mfaSession = await fetch(`${origin}/auth/session`, { headers: { authorization: `Bearer ${enrolled.accessToken}` } });
    assert.equal(mfaSession.status, 200);
    assert.equal((await mfaSession.json() as { session: { authMethod: string; mfaVerifiedAt: string | null } }).session.authMethod, "otp_mfa");

    const secondPlatformOtp = await fetch(`${origin}/auth/otp/request`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phoneE164: "+919900000003" }),
    });
    const secondPlatformChallenge = await secondPlatformOtp.json() as { challengePublicId: string; localDebugCode: string };
    const secondPlatformVerify = await fetch(`${origin}/auth/otp/verify`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengePublicId: secondPlatformChallenge.challengePublicId, code: secondPlatformChallenge.localDebugCode }),
    });
    const secondHandoff = await secondPlatformVerify.json() as { status: string; mfaTicket: string };
    assert.equal(secondHandoff.status, "mfa_verification_required");
    const replayedAuthenticator = await fetch(`${origin}/auth/mfa/verify`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mfaTicket: secondHandoff.mfaTicket, code: currentAuthenticatorCode }),
    });
    assert.equal(replayedAuthenticator.status, 422);
    const recoveryVerification = await fetch(`${origin}/auth/mfa/verify`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mfaTicket: secondHandoff.mfaTicket, code: enrolled.recoveryCodes[0] }),
    });
    assert.equal(recoveryVerification.status, 200);
    assert.equal((await recoveryVerification.json() as { recoveryCodeUsed: boolean }).recoveryCodeUsed, true);

    const thirdPlatformOtp = await fetch(`${origin}/auth/otp/request`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phoneE164: "+919900000003" }),
    });
    const thirdPlatformChallenge = await thirdPlatformOtp.json() as { challengePublicId: string; localDebugCode: string };
    const thirdPlatformVerify = await fetch(`${origin}/auth/otp/verify`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengePublicId: thirdPlatformChallenge.challengePublicId, code: thirdPlatformChallenge.localDebugCode }),
    });
    const thirdHandoff = await thirdPlatformVerify.json() as { mfaTicket: string };
    const reusedRecoveryCode = await fetch(`${origin}/auth/mfa/verify`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mfaTicket: thirdHandoff.mfaTicket, code: enrolled.recoveryCodes[0] }),
    });
    assert.equal(reusedRecoveryCode.status, 422);

    const mfaStored = await pool.query<{ factors: string; recovery_codes: string; consumed_recovery_codes: string; mfa_sessions: string; mfa_audits: string }>(
      `select
         (select count(*) from app.mfa_factors where user_id = $1 and status = 'active')::text as factors,
         (select count(*) from app.mfa_recovery_codes recovery join app.mfa_factors factor on factor.id = recovery.factor_id where factor.user_id = $1)::text as recovery_codes,
         (select count(*) from app.mfa_recovery_codes recovery join app.mfa_factors factor on factor.id = recovery.factor_id where factor.user_id = $1 and recovery.consumed_at is not null)::text as consumed_recovery_codes,
         (select count(*) from app.device_sessions where user_id = $1 and auth_method = 'otp_mfa' and mfa_verified_at is not null)::text as mfa_sessions,
         (select count(*) from app.audit_events where actor_user_id = $1 and action in ('mfa.enrolled', 'mfa.verified'))::text as mfa_audits`,
      [activatedMember.id],
    );
    assert.deepEqual(mfaStored.rows[0], { factors: "1", recovery_codes: "10", consumed_recovery_codes: "1", mfa_sessions: "2", mfa_audits: "2" });

    const logout = await fetch(`${origin}/auth/logout`, {
      method: "POST",
      headers: { authorization: `Bearer ${authenticated.accessToken}` },
    });
    assert.equal(logout.status, 204);
    const revokedSession = await fetch(`${origin}/auth/session`, {
      headers: { authorization: `Bearer ${authenticated.accessToken}` },
    });
    assert.equal(revokedSession.status, 401);

    const stored = await pool.query<{ tenants: string; proposals: string; assignments: string; invitations: string; outbox: string; credit_accounts: string; active_memberships: string; otp_sessions: string; revoked_sessions: string; audit_events: string; orders: string; order_items: string; order_events: string; fulfillment_events: string; order_outbox: string; status_outbox: string; invoice_outbox: string; order_audits: string; fulfillment_audits: string; invoices: string; empty_collections: string; inventory_events: string }>(
      `select
         (select count(*) from app.tenants where public_id = $1 and status = 'active')::text as tenants,
         (select count(*) from app.tenant_commercial_proposals proposal join app.tenants tenant on tenant.id = proposal.tenant_id where tenant.public_id = $1 and proposal.decision_status = 'approved')::text as proposals,
         (select count(*) from app.agency_assignments assignment join app.tenants tenant on tenant.id = assignment.tenant_id where tenant.public_id = $1 and assignment.status = 'active')::text as assignments,
         (select count(*) from app.invitations invitation join app.tenants tenant on tenant.id = invitation.tenant_id where tenant.public_id = $1 and invitation.status = 'queued')::text as invitations,
         (select count(*) from app.outbox_events where event_type = 'tenant.invitation.sms.requested' and (payload->>'tenantPublicId')::uuid = $1)::text as outbox,
         (select count(*) from app.credit_accounts credit join app.commercial_accounts commercial on commercial.id = credit.commercial_account_id join app.tenants tenant on tenant.id = commercial.tenant_id where tenant.public_id = $1 and credit.status = 'approved')::text as credit_accounts,
         (select count(*) from app.tenant_memberships membership join app.tenants tenant on tenant.id = membership.tenant_id where tenant.public_id = $1 and membership.status = 'active')::text as active_memberships,
         (select count(*) from app.device_sessions session_row join app.tenant_memberships membership on membership.user_id = session_row.user_id join app.tenants tenant on tenant.id = membership.tenant_id where tenant.public_id = $1 and session_row.auth_method = 'otp' and session_row.revoked_at is null)::text as otp_sessions,
         (select count(*) from app.device_sessions session_row join app.tenant_memberships membership on membership.user_id = session_row.user_id join app.tenants tenant on tenant.id = membership.tenant_id where tenant.public_id = $1 and session_row.auth_method = 'otp' and session_row.revoke_reason = 'user_logout')::text as revoked_sessions,
         (select count(*) from app.audit_events where entity_public_id = $1 and action in ('tenant.draft_created', 'tenant.submitted', 'tenant.approved'))::text as audit_events,
         (select count(*) from app.orders order_row join app.tenants tenant on tenant.id = order_row.tenant_id where tenant.public_id = $1 and order_row.status = 'delivered')::text as orders,
         (select count(*) from app.order_items item join app.orders order_row on order_row.id = item.order_id join app.tenants tenant on tenant.id = order_row.tenant_id where tenant.public_id = $1)::text as order_items,
         (select count(*) from app.order_status_events event join app.orders order_row on order_row.id = event.order_id join app.tenants tenant on tenant.id = order_row.tenant_id where tenant.public_id = $1 and event.to_status = 'placed')::text as order_events,
         (select count(*) from app.order_status_events event join app.orders order_row on order_row.id = event.order_id join app.tenants tenant on tenant.id = order_row.tenant_id where tenant.public_id = $1 and event.to_status <> 'placed')::text as fulfillment_events,
         (select count(*) from app.outbox_events where event_type = 'order.placed' and payload->>'tenantPublicId' = $1::text)::text as order_outbox,
         (select count(*) from app.outbox_events where event_type = 'order.status_changed' and payload->>'tenantPublicId' = $1::text)::text as status_outbox,
         (select count(*) from app.outbox_events where event_type = 'invoice.issued' and payload->>'tenantPublicId' = $1::text)::text as invoice_outbox,
         (select count(*) from app.audit_events audit join app.orders order_row on order_row.public_id = audit.entity_public_id join app.tenants tenant on tenant.id = order_row.tenant_id where tenant.public_id = $1 and audit.action = 'order.placed')::text as order_audits,
         (select count(*) from app.audit_events audit join app.orders order_row on order_row.public_id = audit.entity_public_id join app.tenants tenant on tenant.id = order_row.tenant_id where tenant.public_id = $1 and audit.action = 'order.status_changed')::text as fulfillment_audits,
         (select count(*) from app.invoices invoice join app.tenants tenant on tenant.id = invoice.tenant_id where tenant.public_id = $1 and invoice.status = 'open')::text as invoices,
         (select count(*) from app.order_empty_collections collected join app.orders order_row on order_row.id = collected.order_id join app.tenants tenant on tenant.id = order_row.tenant_id where tenant.public_id = $1)::text as empty_collections,
         (select count(*) from app.agency_inventory_events event join app.orders order_row on order_row.id = event.order_id join app.tenants tenant on tenant.id = order_row.tenant_id where tenant.public_id = $1)::text as inventory_events`,
      [createdBody.tenant.publicId],
    );
    assert.deepEqual(stored.rows[0], { tenants: "1", proposals: "1", assignments: "1", invitations: "1", outbox: "1", credit_accounts: "1", active_memberships: "1", otp_sessions: "0", revoked_sessions: "1", audit_events: "3", orders: "1", order_items: "1", order_events: "1", fulfillment_events: "4", order_outbox: "1", status_outbox: "4", invoice_outbox: "1", order_audits: "1", fulfillment_audits: "4", invoices: "1", empty_collections: "1", inventory_events: "3" });
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
