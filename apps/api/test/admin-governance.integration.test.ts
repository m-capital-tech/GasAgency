import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createDatabasePool } from "@platform/database";
import { encryptSecret, uuidV7 } from "@platform/runtime";
import { adminDashboardRouter } from "../src/routes/admin-dashboard";
import { platformTeamRouter } from "../src/routes/platform-team";
import { authMfaRouter } from "../src/routes/auth-mfa";
import { loadApiConfig } from "../src/config";
import { HttpError } from "../src/http/error";
import { totpCode } from "../src/security/mfa";
import { hashSessionToken } from "../src/security/token";

const connectionString = process.env.TEST_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

integrationTest("Super Admin reporting and Platform Admin access lifecycle are global, MFA-protected, and audited", async () => {
  const tokenPepper = "admin-governance-test-pepper-32-characters";
  const mfaEncryptionKey = Buffer.alloc(32, 41).toString("base64");
  const config = loadApiConfig({
    APP_ENV: "test",
    DATABASE_URL: connectionString!,
    DATABASE_SSL_MODE: "disable",
    CORS_ORIGINS: "http://127.0.0.1",
    SESSION_TOKEN_PEPPER: tokenPepper,
    MFA_ENCRYPTION_KEY: mfaEncryptionKey,
    MFA_TICKET_PEPPER: "admin-governance-mfa-ticket-pepper-32-characters",
  });
  const pool = createDatabasePool({
    connectionString: connectionString!,
    applicationName: "admin-governance-integration-test",
    maxConnections: 4,
    statementTimeoutMs: 30_000,
    sslMode: "disable",
  });
  const superAdmin = (await pool.query<{ id: string; public_id: string }>(
    `select user_row.id::text, user_row.public_id::text
       from app.role_assignments assignment
       join app.roles role_row on role_row.id = assignment.role_id
       join app.users user_row on user_row.id = assignment.user_id
      where role_row.role_type = 'super_admin' and assignment.status = 'active'
      order by assignment.id limit 1`,
  )).rows[0];
  assert.ok(superAdmin, "test database requires the seeded Super Admin");

  const token = `super-${uuidV7()}-governance-token`;
  await pool.query(
    `insert into app.device_sessions (public_id, user_id, token_hash, expires_at, auth_method, mfa_verified_at)
     values ($1, $2, $3, now() + interval '1 hour', 'bootstrap_test', now() - interval '15 minutes')`,
    [uuidV7(), superAdmin.id, hashSessionToken(token, tokenPepper)],
  );
  const mfaSecret = "JBSWY3DPEHPK3PXP";
  const existingFactor = (await pool.query<{ id: string; public_id: string }>("select id::text, public_id::text from app.mfa_factors where user_id = $1 and status = 'active'", [superAdmin.id])).rows[0];
  if (existingFactor) {
    await pool.query("update app.mfa_factors set secret_envelope = $2, last_used_step = null, updated_at = now() where id = $1", [existingFactor.id, encryptSecret(mfaSecret, mfaEncryptionKey, existingFactor.public_id)]);
  } else {
    const factorPublicId = uuidV7();
    await pool.query(
      `insert into app.mfa_factors (public_id, user_id, label, secret_envelope, status, verified_at)
       values ($1, $2, 'Integration test authenticator', $3, 'active', now())`,
      [factorPublicId, superAdmin.id, encryptSecret(mfaSecret, mfaEncryptionKey, factorPublicId)],
    );
  }

  const app = express();
  app.use(express.json());
  app.use("/v1", authMfaRouter({ pool, config }));
  app.use("/v1", adminDashboardRouter({ pool, tokenPepper }));
  app.use("/v1", platformTeamRouter({ pool, tokenPepper }));
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const known = error instanceof HttpError ? error : null;
    response.status(known?.status ?? 500).json({ error: { code: known?.code ?? "internal_error", message: known?.message ?? "failed" } });
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}/v1`;
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const suffix = Date.now().toString(36);

  try {
    const dashboard = await fetch(`${base}/admin/dashboard?period=weekly`, { headers });
    assert.equal(dashboard.status, 200);
    const dashboardBody = await dashboard.json() as { audience: string; period: string; scope: { global: boolean }; systemHealth: unknown; performance: { current: { orders: number } } };
    assert.deepEqual({ audience: dashboardBody.audience, period: dashboardBody.period, global: dashboardBody.scope.global, system: Boolean(dashboardBody.systemHealth), ordersType: typeof dashboardBody.performance.current.orders }, { audience: "super_admin", period: "weekly", global: true, system: true, ordersType: "number" });

    const roleBody = {
      name: `Platform Admin ${suffix}`,
      roleType: "platform_admin",
      permissionKeys: ["report.view", "user.view", "user.create", "user.edit", "role.view", "role.create", "role.edit", "role.manage"],
      reason: "Integration test Platform Admin permission ceiling",
    };
    const blockedRole = await fetch(`${base}/admin/roles`, { method: "POST", headers, body: JSON.stringify(roleBody) });
    assert.equal(blockedRole.status, 403);
    assert.equal((await blockedRole.json() as { error: { code: string } }).error.code, "step_up_required");
    const step = Math.floor(Date.now() / 30_000);
    const stepUp = await fetch(`${base}/auth/mfa/step-up`, { method: "POST", headers, body: JSON.stringify({ code: totpCode(mfaSecret, step) }) });
    assert.equal(stepUp.status, 200);

    const createdRole = await fetch(`${base}/admin/roles`, {
      method: "POST", headers,
      body: JSON.stringify(roleBody),
    });
    assert.equal(createdRole.status, 201);
    const role = (await createdRole.json() as { role: { publicId: string } }).role;

    const phone = `+9198${Date.now().toString().slice(-8)}`;
    const createdMember = await fetch(`${base}/admin/team-members`, {
      method: "POST", headers,
      body: JSON.stringify({ fullName: `Governance Admin ${suffix}`, phoneE164: phone, email: `governance-${suffix}@example.test`, rolePublicId: role.publicId, scope: { kind: "global" }, reason: "Integration test Platform Admin appointment" }),
    });
    assert.equal(createdMember.status, 201);
    const member = await createdMember.json() as { user: { publicId: string }; assignment: { publicId: string } };
    const target = (await pool.query<{ id: string }>("select id::text from app.users where public_id = $1", [member.user.publicId])).rows[0]!;
    await pool.query("update app.users set status = 'active' where id = $1", [target.id]);
    await pool.query(
      `insert into app.device_sessions (public_id, user_id, token_hash, expires_at, auth_method, mfa_verified_at)
       values ($1, $2, $3, now() + interval '1 hour', 'bootstrap_test', now())`,
      [uuidV7(), target.id, hashSessionToken(`target-${suffix}-session-token-123456789`, tokenPepper)],
    );

    const suspended = await fetch(`${base}/admin/team-members/${member.assignment.publicId}/lifecycle`, { method: "POST", headers, body: JSON.stringify({ action: "suspend", reason: "Integration test access suspension" }) });
    assert.equal(suspended.status, 200);
    assert.equal((await suspended.json() as { assignment: { status: string; revokedSessions: number } }).assignment.status, "suspended");
    const revokedSession = (await pool.query<{ revoked: boolean }>("select bool_and(revoked_at is not null) as revoked from app.device_sessions where user_id = $1", [target.id])).rows[0];
    assert.equal(revokedSession?.revoked, true);

    const reinstated = await fetch(`${base}/admin/team-members/${member.assignment.publicId}/lifecycle`, { method: "POST", headers, body: JSON.stringify({ action: "reinstate", reason: "Integration test access reinstatement" }) });
    assert.equal(reinstated.status, 200);
    assert.equal((await reinstated.json() as { assignment: { status: string } }).assignment.status, "active");

    const revoked = await fetch(`${base}/admin/team-members/${member.assignment.publicId}/lifecycle`, { method: "POST", headers, body: JSON.stringify({ action: "revoke", reason: "Integration test final access revocation" }) });
    assert.equal(revoked.status, 200);
    assert.equal((await revoked.json() as { assignment: { status: string } }).assignment.status, "revoked");

    const roleUpdated = await fetch(`${base}/admin/roles/${role.publicId}`, {
      method: "POST", headers,
      body: JSON.stringify({ name: roleBody.name, permissionKeys: roleBody.permissionKeys, status: "suspended", reason: "Integration test role suspension" }),
    });
    assert.equal(roleUpdated.status, 200);
    assert.equal((await roleUpdated.json() as { role: { status: string } }).role.status, "suspended");

    const audit = await pool.query<{ action: string }>(
      `select action from app.audit_events where entity_public_id = $1 and action in ('role.assigned', 'role.assignment_suspend', 'role.assignment_reinstate', 'role.assignment_revoke') order by occurred_at, id`,
      [member.user.publicId],
    );
    assert.deepEqual(audit.rows.map((row) => row.action), ["role.assigned", "role.assignment_suspend", "role.assignment_reinstate", "role.assignment_revoke"]);
    assert.equal((await pool.query<{ count: string }>("select count(*)::text as count from app.audit_events where entity_public_id = $1 and action = 'role.updated'", [role.publicId])).rows[0]?.count, "1");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
