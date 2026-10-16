import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";
import { createDatabasePool } from "@platform/database";
import { decryptSecret, uuidV7 } from "@platform/runtime";
import { gstinCheckDigit } from "../src/domain/gstin";
import { HttpError } from "../src/http/error";
import { authPushDevicesRouter, hashPushToken, pushTokenAssociatedData } from "../src/routes/auth-push-devices";
import { hashSessionToken } from "../src/security/token";

const connectionString = process.env.TEST_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

test("push-token digests and encryption associated data are deterministic without exposing the token", () => {
  const token = "ExpoPushToken[unit-test-token-1234567890]";
  const digest = hashPushToken(token);
  assert.equal(digest.length, 32);
  assert.deepEqual(digest, hashPushToken(token));
  assert.notDeepEqual(digest, hashPushToken("ExpoPushToken[other-test-token-1234567890]"));
  const associatedData = pushTokenAssociatedData("0199ed7f-7450-7000-8000-000000000001", "expo", digest);
  assert.match(associatedData, /^commercial-lpg:push-token:v1:/);
  assert.doesNotMatch(associatedData, /unit-test-token/);
});

integrationTest("tenant push-device registration is encrypted, scoped, idempotent, and revocable", async () => {
  const tokenPepper = "push-device-test-session-pepper-at-least-32-characters";
  const encryptionKey = Buffer.alloc(32, 13).toString("base64");
  const tenantToken = `tenant-${uuidV7()}-push-device-session-token`;
  const platformToken = `platform-${uuidV7()}-push-device-session-token`;
  const pushToken = `ExpoPushToken[${uuidV7().replaceAll("-", "")}]`;
  const projectId = uuidV7();
  const pool = createDatabasePool({
    connectionString: connectionString!,
    applicationName: "push-device-integration-test",
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
  const phoneSuffix = String(Number.parseInt(suffix, 16) % 100_000_000).padStart(8, "0");
  const tenantUser = (
    await pool.query<{ id: string; public_id: string }>(
      `insert into app.users (public_id, phone_e164, full_name, status)
       values ($1, $2, $3, 'active')
       returning id::text, public_id::text`,
      [uuidV7(), `+9178${phoneSuffix}`, `Push Owner ${suffix}`],
    )
  ).rows[0]!;
  const gstinPrefix = `27ABCDE${String(Number.parseInt(suffix, 16) % 10_000).padStart(4, "0")}F1Z`;
  const tenant = (
    await pool.query<{ id: string }>(
      `insert into app.tenants (
         public_id, legal_name, display_name, business_type, gstin, status,
         created_by_user_id, approved_by_user_id, approved_at
       ) values ($1, $2, $2, 'restaurant', $3, 'active', $4, $4, now())
       returning id::text`,
      [uuidV7(), `Push Restaurant ${suffix}`, `${gstinPrefix}${gstinCheckDigit(gstinPrefix)}`, superAdmin.id],
    )
  ).rows[0]!;
  await pool.query(
    `insert into app.tenant_memberships (
       public_id, tenant_id, user_id, membership_type, status, created_by_user_id, activated_at
     ) values ($1, $2, $3, 'owner', 'active', $4, now())`,
    [uuidV7(), tenant.id, tenantUser.id, superAdmin.id],
  );
  await pool.query(
    `insert into app.device_sessions (public_id, user_id, token_hash, expires_at, auth_method)
     values ($1, $2, $3, now() + interval '1 hour', 'otp')`,
    [uuidV7(), tenantUser.id, hashSessionToken(tenantToken, tokenPepper)],
  );
  await pool.query(
    `insert into app.device_sessions (public_id, user_id, token_hash, expires_at, auth_method, mfa_verified_at)
     values ($1, $2, $3, now() + interval '1 hour', 'bootstrap_test', now())`,
    [uuidV7(), superAdmin.id, hashSessionToken(platformToken, tokenPepper)],
  );

  const app = express();
  app.use(express.json());
  app.use("/v1", authPushDevicesRouter({ pool, tokenPepper, encryptionKey }));
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const known = error instanceof HttpError ? error : null;
    response.status(known?.status ?? 500).json({
      error: {
        code: known?.code ?? "internal_error",
        message: known?.message ?? "The request could not be completed.",
        ...(known?.details ? { details: known.details } : {}),
      },
    });
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/v1/auth/push-devices`;
  const body = { provider: "expo", token: pushToken, platform: "ios", projectId, appVersion: "1.0.0" };
  const headers = (token: string) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });

  try {
    const unauthenticated = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert.equal(unauthenticated.status, 401);

    const nonTenant = await fetch(endpoint, { method: "POST", headers: headers(platformToken), body: JSON.stringify(body) });
    assert.equal(nonTenant.status, 403);
    assert.equal((await nonTenant.json() as { error: { code: string } }).error.code, "tenant_access_required");

    const invalidToken = "ExpoPushToken[bad token]";
    const invalid = await fetch(endpoint, {
      method: "POST",
      headers: headers(tenantToken),
      body: JSON.stringify({ ...body, token: invalidToken }),
    });
    assert.equal(invalid.status, 400);
    assert.doesNotMatch(await invalid.text(), /bad token/);

    const registered = await fetch(endpoint, { method: "POST", headers: headers(tenantToken), body: JSON.stringify(body) });
    assert.equal(registered.status, 200);
    const registeredText = await registered.text();
    assert.doesNotMatch(registeredText, new RegExp(pushToken.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    const registeredBody = JSON.parse(registeredText) as { status: string; device: { publicId: string; appVersion: string; projectId: string } };
    assert.equal(registeredBody.status, "registered");
    assert.equal(registeredBody.device.appVersion, "1.0.0");
    assert.equal(registeredBody.device.projectId, projectId);

    const stored = (
      await pool.query<{
        public_id: string;
        token_digest: Buffer;
        token_envelope: string;
        status: string;
        project_id: string;
        app_version: string;
      }>(
        `select public_id::text, token_digest, token_envelope, status, project_id::text, app_version
           from app.push_devices
          where user_id = $1 and provider = 'expo'`,
        [tenantUser.id],
      )
    ).rows[0]!;
    assert.deepEqual(stored.token_digest, hashPushToken(pushToken));
    assert.doesNotMatch(stored.token_envelope, new RegExp(pushToken.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(
      decryptSecret(stored.token_envelope, encryptionKey, pushTokenAssociatedData(tenantUser.public_id, "expo", stored.token_digest)),
      pushToken,
    );

    await pool.query(
      `update app.push_devices
          set status = 'stale', stale_at = now(), status_reason = 'expo_device_not_registered', updated_at = now()
        where user_id = $1 and provider = 'expo'`,
      [tenantUser.id],
    );
    const reregistered = await fetch(endpoint, {
      method: "POST",
      headers: headers(tenantToken),
      body: JSON.stringify({ ...body, appVersion: "1.1.0" }),
    });
    assert.equal(reregistered.status, 200);
    assert.equal((await reregistered.json() as { device: { publicId: string } }).device.publicId, registeredBody.device.publicId);
    const reactivated = (
      await pool.query<{ count: string; status: string; stale_at: Date | null; app_version: string }>(
        `select count(*) over ()::text as count, status, stale_at, app_version
           from app.push_devices
          where user_id = $1 and provider = 'expo'`,
        [tenantUser.id],
      )
    ).rows[0]!;
    assert.deepEqual(reactivated, { count: "1", status: "active", stale_at: null, app_version: "1.1.0" });

    const revoked = await fetch(endpoint, {
      method: "POST",
      headers: headers(tenantToken),
      body: JSON.stringify({ ...body, action: "revoke" }),
    });
    assert.equal(revoked.status, 200);
    assert.deepEqual(await revoked.json(), { status: "revoked" });
    const revokedRow = (
      await pool.query<{ status: string; revoked_at: Date | null }>(
        "select status, revoked_at from app.push_devices where user_id = $1 and provider = 'expo'",
        [tenantUser.id],
      )
    ).rows[0]!;
    assert.equal(revokedRow.status, "revoked");
    assert.ok(revokedRow.revoked_at);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  }
});
