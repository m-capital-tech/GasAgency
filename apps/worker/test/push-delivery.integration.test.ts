import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { createDatabasePool, type OutboxEvent } from "@platform/database";
import { encryptSecret, uuidV7 } from "@platform/runtime";
import { createPushHandlers, pushTokenAssociatedData } from "../src/push/handlers";
import type { OutboundPush, PushProvider, PushSendResult } from "../src/push/provider";

const connectionString = process.env.TEST_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

class RecordingProvider implements PushProvider {
  readonly name = "expo";
  readonly calls: Array<Array<Omit<OutboundPush, "token">>> = [];
  outcome: "accepted" | "device_not_registered" = "accepted";

  async send(messages: readonly OutboundPush[]): Promise<PushSendResult[]> {
    this.calls.push(messages.map(({ token: _token, ...message }) => message));
    return messages.map((message) => this.outcome === "accepted"
      ? { deliveryPublicId: message.deliveryPublicId, outcome: "accepted", providerReference: `ticket-${message.deliveryPublicId}` }
      : { deliveryPublicId: message.deliveryPublicId, outcome: "device_not_registered", errorCode: "DeviceNotRegistered" });
  }
}

integrationTest("push delivery is membership-scoped, idempotent, encrypted, and stales unregistered devices", async () => {
  const pool = createDatabasePool({ connectionString: connectionString!, applicationName: "push-delivery-integration-test", maxConnections: 3, sslMode: "disable" });
  const encryptionKey = Buffer.alloc(32, 12).toString("base64");
  const provider = new RecordingProvider();
  const handlers = createPushHandlers({ pool, provider, pushTokenEncryptionKey: encryptionKey, maxDeliveryAttempts: 3 });
  const suffix = uuidV7().replaceAll("-", "").slice(-10);
  const token = `ExpoPushToken[${suffix}${suffix}${suffix}]`;
  const tokenDigest = createHash("sha256").update(token, "utf8").digest();
  const created: { userId?: string; membershipId?: string; sessionId?: string; deviceId?: string; eventIds: string[] } = { eventIds: [] };

  try {
    const tenant = (
      await pool.query<{ id: string; public_id: string; creator_id: string }>(
        `select tenant.id::text, tenant.public_id::text,
                coalesce(tenant.approved_by_user_id, tenant.created_by_user_id)::text as creator_id
           from app.tenants tenant where tenant.status = 'active' order by tenant.id limit 1`,
      )
    ).rows[0];
    assert.ok(tenant, "bootstrap one active tenant before this integration test");
    const userPublicId = uuidV7();
    const phoneSuffix = String(Number.parseInt(suffix.slice(-8), 16) % 100_000_000).padStart(8, "0");
    const user = (
      await pool.query<{ id: string }>(
        `insert into app.users (public_id, phone_e164, full_name, status)
         values ($1, $2, 'Push Delivery User', 'active') returning id::text`,
        [userPublicId, `+9177${phoneSuffix}`],
      )
    ).rows[0]!;
    created.userId = user.id;
    const membership = (
      await pool.query<{ id: string }>(
        `insert into app.tenant_memberships (public_id, tenant_id, user_id, membership_type, status, created_by_user_id, activated_at)
         values ($1, $2, $3, 'staff', 'active', $4, now()) returning id::text`,
        [uuidV7(), tenant.id, user.id, tenant.creator_id],
      )
    ).rows[0]!;
    created.membershipId = membership.id;
    const session = (
      await pool.query<{ id: string }>(
        `insert into app.device_sessions (public_id, user_id, token_hash, expires_at)
         values ($1, $2, $3, now() + interval '1 hour') returning id::text`,
        [uuidV7(), user.id, createHash("sha256").update(uuidV7()).digest()],
      )
    ).rows[0]!;
    created.sessionId = session.id;
    const device = (
      await pool.query<{ id: string }>(
        `insert into app.push_devices (
           public_id, user_id, last_registered_session_id, provider, token_digest, token_envelope, platform, project_id
         ) values ($1, $2, $3, 'expo', $4, $5, 'ios', $6) returning id::text`,
        [uuidV7(), user.id, session.id, tokenDigest, encryptSecret(token, encryptionKey, pushTokenAssociatedData(userPublicId, "expo", tokenDigest)), uuidV7()],
      )
    ).rows[0]!;
    created.deviceId = device.id;

    const makeEvent = async (eventType: "order.status_changed" | "invoice.issued", payload: Record<string, unknown>): Promise<OutboxEvent> => {
      const publicId = uuidV7();
      const aggregatePublicId = eventType === "invoice.issued" ? String(payload.invoicePublicId) : String(payload.orderPublicId);
      const row = (
        await pool.query<{ id: string; created_at: Date }>(
          `insert into app.outbox_events (public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key)
           values ($1, $2, $3, $4, $5::jsonb, $6) returning id::text, created_at`,
          [publicId, eventType, eventType.startsWith("invoice") ? "invoice" : "order", aggregatePublicId, JSON.stringify(payload), `push-test:${publicId}`],
        )
      ).rows[0]!;
      created.eventIds.push(row.id);
      return { id: row.id, publicId, eventType, aggregateType: eventType.startsWith("invoice") ? "invoice" : "order", aggregatePublicId, payload, attemptCount: 1, createdAt: row.created_at };
    };

    const orderPublicId = uuidV7();
    const first = await makeEvent("order.status_changed", { tenantPublicId: tenant.public_id, orderPublicId, orderNumber: "ORD-PUSH-1", toStatus: "accepted" });
    await handlers.get(first.eventType)!(first);
    await handlers.get(first.eventType)!(first);
    assert.equal(provider.calls.length, 1);
    assert.doesNotMatch(JSON.stringify(provider.calls), /ExpoPushToken/);
    const accepted = await pool.query<{ count: string; status: string; attempt_count: number }>(
      "select count(*) over ()::text as count, status, attempt_count from app.push_deliveries where outbox_event_id = $1",
      [first.id],
    );
    assert.deepEqual(accepted.rows[0], { count: "1", status: "accepted", attempt_count: 1 });

    provider.outcome = "device_not_registered";
    const invoicePublicId = uuidV7();
    const second = await makeEvent("invoice.issued", { tenantPublicId: tenant.public_id, orderPublicId, invoicePublicId, invoiceNumber: "INV-PUSH-1", totalAmount: "500.00" });
    await handlers.get(second.eventType)!(second);
    const stale = (
      await pool.query<{ device_status: string; delivery_status: string; status_reason: string }>(
        `select device.status as device_status, delivery.status as delivery_status, device.status_reason
           from app.push_devices device join app.push_deliveries delivery on delivery.push_device_id = device.id
          where delivery.outbox_event_id = $1`,
        [second.id],
      )
    ).rows[0]!;
    assert.deepEqual(stale, { device_status: "stale", delivery_status: "stale", status_reason: "expo_device_not_registered" });

    await pool.query("update app.push_devices set status = 'active', status_reason = null, stale_at = null, updated_at = now() where id = $1", [device.id]);
    await pool.query("update app.tenant_memberships set status = 'suspended', suspended_at = now(), updated_at = now() where id = $1", [membership.id]);
    const third = await makeEvent("order.status_changed", { tenantPublicId: tenant.public_id, orderPublicId: uuidV7(), orderNumber: "ORD-PUSH-2", toStatus: "delivered" });
    await handlers.get(third.eventType)!(third);
    assert.equal(provider.calls.length, 2, "inactive memberships must not receive push notifications");
    assert.equal((await pool.query("select count(*)::int as count from app.push_deliveries where outbox_event_id = $1", [third.id])).rows[0]!.count, 0);
  } finally {
    if (created.eventIds.length > 0) {
      await pool.query("delete from app.push_deliveries where outbox_event_id = any($1::bigint[])", [created.eventIds]);
      await pool.query("delete from app.outbox_events where id = any($1::bigint[])", [created.eventIds]);
    }
    if (created.deviceId) await pool.query("delete from app.push_devices where id = $1", [created.deviceId]);
    if (created.sessionId) await pool.query("delete from app.device_sessions where id = $1", [created.sessionId]);
    if (created.membershipId) await pool.query("delete from app.tenant_memberships where id = $1", [created.membershipId]);
    if (created.userId) await pool.query("delete from app.users where id = $1", [created.userId]);
    await pool.end();
  }
});
