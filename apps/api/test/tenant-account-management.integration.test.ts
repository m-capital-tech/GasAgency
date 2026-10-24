import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import { createDatabasePool } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { gstinCheckDigit } from "../src/domain/gstin";
import { HttpError } from "../src/http/error";
import { adminReadRouter } from "../src/routes/admin-read";
import { tenantAccountManagementRouter } from "../src/routes/tenant-account-management";
import { hashSessionToken } from "../src/security/token";

const connectionString = process.env.TEST_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

function uniquePhone(seed: string) {
  const digits = String(Number.parseInt(seed.replaceAll(/\D/g, "").slice(-12) || "0", 10) % 100_000_000).padStart(8, "0");
  return `+9177${digits}`;
}

integrationTest("platform tenant lifecycle and post-activation credit decisions are scoped, guarded, and audited", async () => {
  const tokenPepper = "tenant-account-management-test-pepper-32-characters";
  const superToken = `super-${uuidV7()}-session-token`;
  const restrictedToken = `restricted-${uuidV7()}-session-token`;
  const ownerToken = `owner-${uuidV7()}-session-token`;
  const pool = createDatabasePool({
    connectionString: connectionString!,
    applicationName: "tenant-account-management-integration-test",
    maxConnections: 4,
    sslMode: "disable",
  });

  const superAdmin = (
    await pool.query<{ id: string }>(
      `select assignment.user_id::text as id
         from app.role_assignments assignment
         join app.roles role_row on role_row.id = assignment.role_id
        where role_row.role_type = 'super_admin'
          and assignment.scope_kind = 'global'
          and assignment.status = 'active'
        limit 1`,
    )
  ).rows[0];
  assert.ok(superAdmin, "bootstrap a Super Admin before this test");

  const suffix = uuidV7().replaceAll("-", "").slice(-8);
  const registrationNumber = String(Number.parseInt(suffix, 16) % 10_000).padStart(4, "0");
  const agencyPrefix = `29ABCDE${registrationNumber}F1Z`;
  const tenantPrefix = `27FGHIJ${registrationNumber}G1Z`;
  assert.equal(agencyPrefix.length, 14);
  assert.equal(tenantPrefix.length, 14);
  const agencyPublicId = uuidV7();
  const tenantPublicId = uuidV7();
  const ownerPublicId = uuidV7();

  const agency = (
    await pool.query<{ id: string }>(
      `insert into app.agencies (
         public_id, legal_name, display_name, gstin, phone_e164, city, state_code,
         status, credit_enabled, created_by_user_id, approved_by_user_id, approved_at
       ) values ($1, $2, $3, $4, $5, 'Bengaluru', 'KA', 'approved', true, $6, $6, now())
       returning id::text`,
      [agencyPublicId, `Lifecycle Agency ${suffix}`, `Lifecycle Agency ${suffix}`, `${agencyPrefix}${gstinCheckDigit(agencyPrefix)}`, uniquePhone(`1${suffix}`), superAdmin.id],
    )
  ).rows[0]!;
  const owner = (
    await pool.query<{ id: string }>(
      `insert into app.users (public_id, phone_e164, full_name, status)
       values ($1, $2, $3, 'active') returning id::text`,
      [ownerPublicId, uniquePhone(`2${suffix}`), `Lifecycle Owner ${suffix}`],
    )
  ).rows[0]!;
  const tenant = (
    await pool.query<{ id: string }>(
      `insert into app.tenants (
         public_id, legal_name, display_name, business_type, gstin, status,
         created_by_user_id, approved_by_user_id, approved_at
       ) values ($1, $2, $3, 'restaurant', $4, 'active', $5, $5, now())
       returning id::text`,
      [tenantPublicId, `Lifecycle Restaurant ${suffix}`, `Lifecycle Restaurant ${suffix}`, `${tenantPrefix}${gstinCheckDigit(tenantPrefix)}`, superAdmin.id],
    )
  ).rows[0]!;
  const outlet = (
    await pool.query<{ id: string }>(
      `insert into app.outlets (
         public_id, tenant_id, label, address_line_1, city, state_code, pincode, latitude, longitude
       ) values ($1, $2, 'Main kitchen', '10 Lifecycle Road', 'Bengaluru', 'KA', '560001', 12.9716, 77.5946)
       returning id::text`,
      [uuidV7(), tenant.id],
    )
  ).rows[0]!;
  await pool.query(
    `insert into app.agency_assignments (
       public_id, tenant_id, agency_id, assigned_by_user_id, reason, status
     ) values ($1, $2, $3, $4, 'Lifecycle test serving assignment', 'active')`,
    [uuidV7(), tenant.id, agency.id, superAdmin.id],
  );
  await pool.query(
    `insert into app.tenant_memberships (
       public_id, tenant_id, user_id, membership_type, status, created_by_user_id, activated_at
     ) values ($1, $2, $3, 'owner', 'active', $4, now())`,
    [uuidV7(), tenant.id, owner.id, superAdmin.id],
  );
  const requirement = (
    await pool.query<{ id: string }>(
      `insert into app.tenant_requirements (
         public_id, tenant_id, outlet_id, period, preferred_delivery_days, preferred_slot
       ) values ($1, $2, $3, 'week', array[1, 4]::smallint[], 'before_opening')
       returning id::text`,
      [uuidV7(), tenant.id, outlet.id],
    )
  ).rows[0]!;
  await pool.query(
    `insert into app.tenant_requirement_items (tenant_requirement_id, cylinder_type_id, expected_quantity)
     select $1, cylinder.id, 6 from app.cylinder_types cylinder where cylinder.code = 'commercial_19kg'`,
    [requirement.id],
  );
  await pool.query(
    `insert into app.tenant_commercial_proposals (
       public_id, tenant_id, requested_payment_mode, proposal_note, proposed_by_user_id, decision_status
     ) values ($1, $2, 'prepaid', 'Initial prepaid account', $3, 'not_required')`,
    [uuidV7(), tenant.id, superAdmin.id],
  );
  const commercialAccount = (
    await pool.query<{ id: string; public_id: string }>(
      `insert into app.commercial_accounts (
         public_id, tenant_id, agency_id, payment_mode, status, opened_by_user_id
       ) values ($1, $2, $3, 'prepaid', 'open', $4)
       returning id::text, public_id::text`,
      [uuidV7(), tenant.id, agency.id, superAdmin.id],
    )
  ).rows[0]!;

  const restrictedUser = (
    await pool.query<{ id: string }>(
      `insert into app.users (public_id, phone_e164, full_name, status)
       values ($1, $2, $3, 'active') returning id::text`,
      [uuidV7(), uniquePhone(`3${suffix}`), `Restricted Lifecycle Admin ${suffix}`],
    )
  ).rows[0]!;
  const restrictedRole = (
    await pool.query<{ id: string }>(
      `insert into app.roles (public_id, name, role_type, managed_by_user_id)
       values ($1, $2, 'platform_admin', $3) returning id::text`,
      [uuidV7(), `Restricted Lifecycle Role ${suffix}`, superAdmin.id],
    )
  ).rows[0]!;
  await pool.query(
    `insert into app.role_permissions (role_id, permission_id, granted_by_user_id)
     select $1, permission.id, $2
       from app.permissions permission
      where permission.resource || '.' || permission.action = any($3::text[])`,
    [restrictedRole.id, superAdmin.id, ["tenant.suspend", "credit.approve", "credit.suspend"]],
  );
  await pool.query(
    `insert into app.role_assignments (
       public_id, user_id, role_id, scope_kind, scope_value, assigned_by_user_id
     ) values ($1, $2, $3, 'city', 'Mumbai', $4)`,
    [uuidV7(), restrictedUser.id, restrictedRole.id, superAdmin.id],
  );
  await pool.query(
    `insert into app.device_sessions (public_id, user_id, token_hash, expires_at, auth_method, mfa_verified_at)
     values
       ($1, $2, $3, now() + interval '1 hour', 'bootstrap_test', now()),
       ($4, $5, $6, now() + interval '1 hour', 'bootstrap_test', now()),
       ($7, $8, $9, now() + interval '1 hour', 'otp', null)`,
    [
      uuidV7(), superAdmin.id, hashSessionToken(superToken, tokenPepper),
      uuidV7(), restrictedUser.id, hashSessionToken(restrictedToken, tokenPepper),
      uuidV7(), owner.id, hashSessionToken(ownerToken, tokenPepper),
    ],
  );

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use("/v1", adminReadRouter({ pool, tokenPepper }));
  app.use("/v1", tenantAccountManagementRouter({ pool, tokenPepper }));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const known = error instanceof HttpError ? error : null;
    response.status(known?.status ?? 500).json({
      error: { code: known?.code ?? "internal_error", message: known?.message ?? "The request could not be completed.", ...(known?.details ? { details: known.details } : {}) },
    });
  });

  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}/v1/admin/tenants/${tenantPublicId}`;
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

  try {
    const unauthenticated = await fetch(`${origin}/lifecycle`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "suspend", reason: "Compliance hold" }) });
    assert.equal(unauthenticated.status, 401);

    const outOfScope = await fetch(`${origin}/lifecycle`, { method: "POST", headers: headers(restrictedToken), body: JSON.stringify({ action: "suspend", reason: "Must remain out of scope" }) });
    assert.equal(outOfScope.status, 403);
    assert.equal((await outOfScope.json() as { error: { code: string } }).error.code, "permission_denied");

    const approved = await fetch(`${origin}/credit-decisions`, {
      method: "POST",
      headers: headers(superToken),
      body: JSON.stringify({ action: "approve", creditLimit: 100_000, netTermDays: 15, reason: "Approved after post-activation review" }),
    });
    assert.equal(approved.status, 200);
    assert.deepEqual(
      await approved.json() as { creditAccount: { status: string; creditLimit: string; netTermDays: number }; exposure: unknown },
      {
        creditAccount: { publicId: (await pool.query<{ public_id: string }>("select public_id::text from app.credit_accounts where commercial_account_id = $1", [commercialAccount.id])).rows[0]!.public_id, status: "approved", creditLimit: "100000.00", netTermDays: 15 },
        exposure: { pendingOrders: 0, outstandingInvoices: 0, total: 0 },
      },
    );

    const quote = (
      await pool.query<{ id: string }>(
        `insert into app.order_quotes (
           public_id, tenant_id, outlet_id, agency_id, commercial_account_id, quoted_by_user_id,
           delivery_slot, payment_method, subtotal, delivery_fee, slot_surcharge, taxable_amount,
           gst_rate, gst_amount, total_amount, pricing_signature, expires_at, consumed_at
         ) values ($1, $2, $3, $4, $5, $6, 'standard', 'credit', 50847.46, 0, 0, 50847.46,
                   18, 9152.54, 60000, decode('01', 'hex'), now() + interval '1 hour', now())
         returning id::text`,
        [uuidV7(), tenant.id, outlet.id, agency.id, commercialAccount.id, owner.id],
      )
    ).rows[0]!;
    await pool.query(
      `insert into app.orders (
         public_id, order_number, tenant_id, outlet_id, agency_id, commercial_account_id,
         placed_by_user_id, source_quote_id, status, payment_method, payment_status, delivery_slot,
         subtotal, delivery_fee, slot_surcharge, taxable_amount, gst_rate, gst_amount, total_amount, placed_at
       ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'placed', 'credit', 'credit_reserved', 'standard',
                 50847.46, 0, 0, 50847.46, 18, 9152.54, 60000, now())`,
      [uuidV7(), `ORD-LIFECYCLE-${suffix}`, tenant.id, outlet.id, agency.id, commercialAccount.id, owner.id, quote.id],
    );

    const belowExposure = await fetch(`${origin}/credit-decisions`, {
      method: "POST", headers: headers(superToken),
      body: JSON.stringify({ action: "update", creditLimit: 50_000, netTermDays: 30, reason: "Unsafe limit reduction must fail" }),
    });
    assert.equal(belowExposure.status, 409);
    const belowExposureBody = await belowExposure.json() as { error: { code: string; details: { exposure: { total: number } } } };
    assert.equal(belowExposureBody.error.code, "credit_limit_below_exposure");
    assert.equal(belowExposureBody.error.details.exposure.total, 60_000);

    const updated = await fetch(`${origin}/credit-decisions`, {
      method: "POST", headers: headers(superToken),
      body: JSON.stringify({ action: "update", creditLimit: 80_000, netTermDays: 30, reason: "Adjusted after exposure review" }),
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(
      (await updated.json() as { creditAccount: { status: string; creditLimit: string; netTermDays: number } }).creditAccount,
      { publicId: (await pool.query<{ public_id: string }>("select public_id::text from app.credit_accounts where commercial_account_id = $1", [commercialAccount.id])).rows[0]!.public_id, status: "approved", creditLimit: "80000.00", netTermDays: 30 },
    );
    const history = await pool.query<{ decision: string }>(
      `select decision from app.credit_decisions decision
       join app.credit_accounts credit on credit.id = decision.credit_account_id
       where credit.commercial_account_id = $1 order by decision.id`,
      [commercialAccount.id],
    );
    assert.deepEqual(history.rows.map((row) => row.decision), ["approved", "limit_changed", "terms_changed"]);

    const detail = await fetch(origin, { headers: headers(superToken) });
    assert.equal(detail.status, 200);
    const detailBody = await detail.json() as {
      tenant: {
        commercialAccount: { paymentMode: string; creditAccount: { status: string; creditLimit: string; netTermDays: number; exposure: { total: string; available: string }; decisions: Array<{ decision: string }> } };
        capabilities: { canSuspendTenant: boolean; canUpdateCredit: boolean; canSuspendCredit: boolean };
      };
    };
    assert.deepEqual(
      {
        paymentMode: detailBody.tenant.commercialAccount.paymentMode,
        creditStatus: detailBody.tenant.commercialAccount.creditAccount.status,
        creditLimit: detailBody.tenant.commercialAccount.creditAccount.creditLimit,
        netTermDays: detailBody.tenant.commercialAccount.creditAccount.netTermDays,
        totalExposure: detailBody.tenant.commercialAccount.creditAccount.exposure.total,
        available: detailBody.tenant.commercialAccount.creditAccount.exposure.available,
        canSuspendTenant: detailBody.tenant.capabilities.canSuspendTenant,
        canUpdateCredit: detailBody.tenant.capabilities.canUpdateCredit,
        canSuspendCredit: detailBody.tenant.capabilities.canSuspendCredit,
      },
      {
        paymentMode: "credit", creditStatus: "approved", creditLimit: "80000.00", netTermDays: 30,
        totalExposure: "60000.00", available: "20000.00", canSuspendTenant: true, canUpdateCredit: true, canSuspendCredit: true,
      },
    );
    assert.deepEqual(detailBody.tenant.commercialAccount.creditAccount.decisions.map((decision) => decision.decision), ["terms_changed", "limit_changed", "approved"]);

    for (const action of ["suspend", "reinstate"] as const) {
      const response = await fetch(`${origin}/credit-decisions`, {
        method: "POST", headers: headers(superToken),
        body: JSON.stringify({ action, reason: `${action} credit after account review` }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json() as { creditAccount: { status: string } }).creditAccount.status, action === "suspend" ? "suspended" : "approved");
    }

    const creditNotifications = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
      `select event_type, payload
         from app.outbox_events
        where aggregate_type = 'credit_account'
          and aggregate_public_id = (select public_id from app.credit_accounts where commercial_account_id = $1)
          and event_type in ('credit.terms_changed', 'credit.status_changed')
        order by id`,
      [commercialAccount.id],
    );
    assert.deepEqual(
      creditNotifications.rows.map((event) => ({
        type: event.event_type,
        change: event.payload.change ?? null,
        status: event.payload.status ?? null,
        includesReason: Object.hasOwn(event.payload, "reason"),
      })),
      [
        { type: "credit.terms_changed", change: "approved", status: null, includesReason: false },
        { type: "credit.terms_changed", change: "updated", status: null, includesReason: false },
        { type: "credit.status_changed", change: null, status: "suspended", includesReason: false },
        { type: "credit.status_changed", change: null, status: "reinstated", includesReason: false },
      ],
    );

    const suspended = await fetch(`${origin}/lifecycle`, {
      method: "POST", headers: headers(superToken),
      body: JSON.stringify({ action: "suspend", reason: "Temporary compliance investigation" }),
    });
    assert.equal(suspended.status, 200);
    assert.equal((await suspended.json() as { tenant: { status: string }; commercialAccount: { status: string }; revokedSessions: number }).tenant.status, "suspended");
    const suspendedState = (
      await pool.query<{ tenant_status: string; account_status: string; owner_session_revoked: boolean; super_session_revoked: boolean }>(
        `select tenant.status as tenant_status, account.status as account_status,
                exists(select 1 from app.device_sessions where user_id = $3 and revoked_at is not null and revoke_reason = 'tenant_suspended') as owner_session_revoked,
                exists(select 1 from app.device_sessions where user_id = $4 and token_hash = $5 and revoked_at is not null) as super_session_revoked
           from app.tenants tenant
           join app.commercial_accounts account on account.tenant_id = tenant.id
          where tenant.id = $1 and account.id = $2`,
        [tenant.id, commercialAccount.id, owner.id, superAdmin.id, hashSessionToken(superToken, tokenPepper)],
      )
    ).rows[0]!;
    assert.deepEqual(suspendedState, { tenant_status: "suspended", account_status: "suspended", owner_session_revoked: true, super_session_revoked: false });

    const reinstated = await fetch(`${origin}/lifecycle`, {
      method: "POST", headers: headers(superToken),
      body: JSON.stringify({ action: "reinstate", reason: "Compliance investigation completed" }),
    });
    assert.equal(reinstated.status, 200);
    assert.equal((await reinstated.json() as { tenant: { status: string } }).tenant.status, "active");

    const lifecycleHistory = await pool.query<{ decision: string }>(
      "select decision from app.tenant_reviews where tenant_id = $1 and decision in ('suspended', 'reinstated') order by id",
      [tenant.id],
    );
    assert.deepEqual(lifecycleHistory.rows.map((row) => row.decision), ["suspended", "reinstated"]);
    const auditActions = await pool.query<{ action: string }>(
      `select action from app.audit_events
        where entity_public_id in ($1, (select public_id from app.credit_accounts where commercial_account_id = $2))
          and action in ('credit.approved', 'credit.updated', 'credit.suspended', 'credit.reinstated', 'tenant.suspended', 'tenant.reinstated')
        order by occurred_at, id`,
      [tenantPublicId, commercialAccount.id],
    );
    assert.deepEqual(auditActions.rows.map((row) => row.action), ["credit.approved", "credit.updated", "credit.suspended", "credit.reinstated", "tenant.suspended", "tenant.reinstated"]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
