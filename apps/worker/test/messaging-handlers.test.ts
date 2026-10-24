import assert from "node:assert/strict";
import test from "node:test";
import type pg from "pg";
import type { OutboxEvent } from "@platform/database";
import { encryptSecret, type Logger } from "@platform/runtime";
import { createMessagingHandlers } from "../src/messaging/handlers";
import type { DeliveryReceipt, MessagingProvider, OutboundMessage } from "../src/messaging/provider";

const invitationPublicId = "018f47fb-61d2-7a8e-a45a-9cbe93d18a01";
const tenantPublicId = "018f47fb-61d2-7a8e-a45a-9cbe93d18a02";
const userPublicId = "018f47fb-61d2-7a8e-a45a-9cbe93d18a03";
const challengePublicId = "018f47fb-61d2-7a8e-a45a-9cbe93d18a04";
const eventPublicId = "018f47fb-61d2-7a8e-a45a-9cbe93d18a05";
const rolePublicId = "018f47fb-61d2-7a8e-a45a-9cbe93d18a06";
const roleAssignmentPublicId = "018f47fb-61d2-7a8e-a45a-9cbe93d18a07";
const destinationE164 = "+919876543210";
const deliveryKey = Buffer.alloc(32, 7).toString("base64");
const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };

interface QueryCall {
  text: string;
  values: readonly unknown[];
  transactional: boolean;
}

class ScriptedPool {
  readonly calls: QueryCall[] = [];

  constructor(
    private readonly invitationRows: unknown[] = [],
    private readonly otpRows: unknown[] = [],
    private readonly deliveryStatus: "queued" | "sent" | "delivered" | "failed" = "queued",
    private readonly platformInvitationRows: unknown[] = [],
  ) {}

  async query(text: string, values: readonly unknown[] = []) {
    this.calls.push({ text, values, transactional: false });
    if (text.includes("from app.invitations invitation")) return { rows: this.invitationRows };
    if (text.includes("from app.platform_user_invitations invitation")) return { rows: this.platformInvitationRows };
    if (text.includes("from app.otp_challenges challenge")) return { rows: this.otpRows };
    if (text.includes("insert into app.message_deliveries") && text.includes("returning id::text, status")) {
      return { rows: [{ id: "41", status: this.deliveryStatus }] };
    }
    return { rows: [], rowCount: 1 };
  }

  async connect() {
    return {
      query: async (text: string, values: readonly unknown[] = []) => {
        this.calls.push({ text, values, transactional: true });
        return { rows: [], rowCount: 1 };
      },
      release() {},
    };
  }
}

class RecordingProvider implements MessagingProvider {
  readonly name = "recording";
  readonly messages: OutboundMessage[] = [];

  async send(message: OutboundMessage): Promise<DeliveryReceipt> {
    this.messages.push(message);
    return { provider: this.name, providerReference: "provider-reference-1", status: "sent" };
  }
}

function event(eventType: string, aggregatePublicId: string, payload: unknown): OutboxEvent {
  return {
    id: "1",
    publicId: eventPublicId,
    eventType,
    aggregateType: "test",
    aggregatePublicId,
    payload,
    attemptCount: 1,
    createdAt: new Date(),
  };
}

function tenantPayload() {
  return {
    invitationPublicId,
    tenantPublicId,
    tenantDisplayName: "Test Kitchen",
    servingAgencyName: "City Gas Agency",
    appLink: "https://play.google.com/store/apps/details?id=com.munnagas.connect",
    supportContact: "support@munnaunited.com",
    userPublicId,
    destinationE164,
    strategy: "sms_first",
    whatsappFallbackAfterSeconds: 725,
  };
}

test("tenant delivery carries the complete template contract and honors the payload fallback window", async () => {
  const pool = new ScriptedPool([{
    status: "queued",
    completed_at: null,
    tenant_status: "active",
    user_status: "invited",
    phone_e164: destinationE164,
  }]);
  const provider = new RecordingProvider();
  const handler = createMessagingHandlers({ pool: pool as unknown as pg.Pool, provider, otpDeliveryKey: deliveryKey, logger })
    .get("tenant.invitation.sms.requested");
  assert.ok(handler);

  await handler(event("tenant.invitation.sms.requested", invitationPublicId, tenantPayload()));

  assert.equal(provider.messages.length, 1);
  assert.deepEqual(provider.messages[0]?.template.parameters, {
    businessName: "Test Kitchen",
    servingAgencyName: "City Gas Agency",
    appLink: "https://play.google.com/store/apps/details?id=com.munnagas.connect",
    supportContact: "support@munnaunited.com",
  });
  const aggregateUpdate = pool.calls.find((call) => call.text.includes("update app.invitations"));
  assert.ok(aggregateUpdate);
  assert.deepEqual(aggregateUpdate.values, [invitationPublicId, "sms_sent", 725]);
});

test("completed tenant invitations are recorded as skipped and never submitted", async () => {
  const pool = new ScriptedPool([{
    status: "queued",
    completed_at: new Date(),
    tenant_status: "active",
    user_status: "active",
    phone_e164: destinationE164,
  }]);
  const provider = new RecordingProvider();
  const handler = createMessagingHandlers({ pool: pool as unknown as pg.Pool, provider, otpDeliveryKey: deliveryKey, logger })
    .get("tenant.invitation.sms.requested");
  assert.ok(handler);

  await handler(event("tenant.invitation.sms.requested", invitationPublicId, tenantPayload()));

  assert.equal(provider.messages.length, 0);
  const skippedInsert = pool.calls.find((call) => call.text.includes("insert into app.message_deliveries"));
  assert.ok(skippedInsert);
  assert.equal(skippedInsert.values.at(-1), "delivery_skipped:invitation_completed");
});

test("expired OTP challenges are rejected before decrypting or calling the provider", async () => {
  const pool = new ScriptedPool([], [{
    delivery_status: "queued",
    expires_at: new Date(Date.now() - 1_000),
    consumed_at: null,
    invalidated_at: null,
    user_id: "17",
    user_status: "active",
    phone_e164: destinationE164,
  }]);
  const provider = new RecordingProvider();
  const handler = createMessagingHandlers({ pool: pool as unknown as pg.Pool, provider, otpDeliveryKey: deliveryKey, logger })
    .get("auth.otp.sms.requested");
  assert.ok(handler);

  await handler(event("auth.otp.sms.requested", challengePublicId, {
    challengePublicId,
    destinationE164,
    encryptedCode: encryptSecret("123456", deliveryKey, challengePublicId),
    purpose: "login",
    strategy: "sms_first",
  }));

  assert.equal(provider.messages.length, 0);
  const skippedInsert = pool.calls.find((call) => call.text.includes("insert into app.message_deliveries"));
  assert.ok(skippedInsert);
  assert.equal(skippedInsert.values.at(-1), "delivery_skipped:otp_challenge_expired");
  assert.ok(pool.calls.some((call) => call.text.includes("set delivery_status = 'failed'")));
});

test("expired platform assignments prevent stale access invitations", async () => {
  const pool = new ScriptedPool([], [], "queued", [{
    status: "queued",
    completed_at: null,
    assignment_status: "active",
    assignment_expires_at: new Date(Date.now() - 1_000),
    user_status: "invited",
    phone_e164: destinationE164,
  }]);
  const provider = new RecordingProvider();
  const handler = createMessagingHandlers({ pool: pool as unknown as pg.Pool, provider, otpDeliveryKey: deliveryKey, logger })
    .get("platform_user.invitation.sms.requested");
  assert.ok(handler);

  await handler(event("platform_user.invitation.sms.requested", invitationPublicId, {
    invitationPublicId,
    userPublicId,
    destinationE164,
    rolePublicId,
    roleAssignmentPublicId,
    strategy: "sms_first",
    whatsappFallbackAfterSeconds: 300,
  }));

  assert.equal(provider.messages.length, 0);
  const skippedInsert = pool.calls.find((call) => call.text.includes("insert into app.message_deliveries"));
  assert.ok(skippedInsert);
  assert.equal(skippedInsert.values.at(-1), "delivery_skipped:role_assignment_expired");
});
