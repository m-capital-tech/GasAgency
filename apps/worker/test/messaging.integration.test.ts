import assert from "node:assert/strict";
import test from "node:test";
import { createDatabasePool, type OutboxEvent } from "@platform/database";
import { encryptSecret, type Logger, uuidV7 } from "@platform/runtime";
import { createMessagingHandlers } from "../src/messaging/handlers";
import { LocalMessagingProvider } from "../src/messaging/local-provider";

const connectionString = process.env.TEST_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

integrationTest("local provider delivers encrypted OTP once and records the receipt", async () => {
  const pool = createDatabasePool({ connectionString: connectionString!, applicationName: "local-messaging-integration-test", maxConnections: 2, sslMode: "disable" });
  const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
  const deliveryKey = Buffer.alloc(32, 7).toString("base64");
  const challengePublicId = uuidV7();
  const eventPublicId = uuidV7();
  try {
    const user = (
      await pool.query<{ id: string }>(
        `insert into app.users (public_id, phone_e164, full_name, status)
         values ($1, '+919911110001', 'Messaging Test User', 'active') returning id::text`,
        [uuidV7()],
      )
    ).rows[0]!;
    await pool.query(
      `insert into app.otp_challenges (
         public_id, user_id, phone_e164, purpose, code_hash, expires_at, resend_available_at
       ) values ($1, $2, '+919911110001', 'login', $3, now() + interval '5 minutes', now() + interval '1 minute')`,
      [challengePublicId, user.id, Buffer.alloc(32)],
    );
    const event: OutboxEvent = {
      id: "1",
      publicId: eventPublicId,
      eventType: "auth.otp.sms.requested",
      aggregateType: "otp_challenge",
      aggregatePublicId: challengePublicId,
      payload: {
        challengePublicId,
        destinationE164: "+919911110001",
        encryptedCode: encryptSecret("123456", deliveryKey, challengePublicId),
        purpose: "login",
        strategy: "sms_first",
      },
      attemptCount: 1,
      createdAt: new Date(),
    };
    const handler = createMessagingHandlers({ pool, provider: new LocalMessagingProvider(logger, false), otpDeliveryKey: deliveryKey, logger }).get(event.eventType);
    assert.ok(handler);
    await handler(event);
    await handler(event);

    const stored = await pool.query<{ status: string; attempt_count: number; challenge_status: string }>(
      `select delivery.status, delivery.attempt_count, challenge.delivery_status as challenge_status
         from app.message_deliveries delivery
         join app.otp_challenges challenge on challenge.public_id = delivery.aggregate_public_id
        where delivery.idempotency_key = $1`,
      [`auth-otp-sms:${challengePublicId}`],
    );
    assert.deepEqual(stored.rows[0], { status: "delivered", attempt_count: 1, challenge_status: "delivered" });
  } finally {
    await pool.end();
  }
});
