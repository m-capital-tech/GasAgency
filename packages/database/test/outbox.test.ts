import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  claimOutboxEvents,
  completeOutboxEvent,
  createDatabasePool,
  retryOutboxEvent,
} from "../src/index";

test("outbox events are claimed once, released for retry, and completed", async () => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for the outbox integration test");

  const pool = createDatabasePool({
    connectionString,
    applicationName: "outbox-integration-test",
    maxConnections: 3,
    sslMode: process.env.DATABASE_SSL_MODE === "disable" ? "disable" : "verify-full",
    caCertificate: process.env.DATABASE_CA_CERT,
  });
  const cleanupPool = process.env.TEST_CLEANUP_DATABASE_URL
    ? createDatabasePool({
        connectionString: process.env.TEST_CLEANUP_DATABASE_URL,
        applicationName: "outbox-integration-test-cleanup",
        maxConnections: 1,
        sslMode: process.env.DATABASE_SSL_MODE === "disable" ? "disable" : "verify-full",
        caCertificate: process.env.DATABASE_CA_CERT,
      })
    : pool;
  const publicId = randomUUID();

  try {
    await pool.query(
      `insert into app.outbox_events (
         public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key
       ) values ($1, 'test.outbox', 'test', $2, $3::jsonb, $4)`,
      [publicId, randomUUID(), JSON.stringify({ expected: true }), `test:${publicId}`],
    );

    const firstClaim = await claimOutboxEvents(pool, {
      workerId: "worker-one",
      eventTypes: ["test.outbox"],
      batchSize: 10,
      staleLockSeconds: 300,
    });
    assert.equal(firstClaim.length, 1);
    assert.equal(firstClaim[0]?.publicId, publicId);
    assert.equal(firstClaim[0]?.attemptCount, 1);

    const competingClaim = await claimOutboxEvents(pool, {
      workerId: "worker-two",
      eventTypes: ["test.outbox"],
      batchSize: 10,
      staleLockSeconds: 300,
    });
    assert.equal(competingClaim.length, 0);

    assert.equal(await retryOutboxEvent(pool, firstClaim[0]!.id, "worker-one", "expected retry", 1), true);
    await pool.query("update app.outbox_events set available_at = now() where public_id = $1", [publicId]);

    const secondClaim = await claimOutboxEvents(pool, {
      workerId: "worker-two",
      eventTypes: ["test.outbox"],
      batchSize: 10,
      staleLockSeconds: 300,
    });
    assert.equal(secondClaim.length, 1);
    assert.equal(secondClaim[0]?.attemptCount, 2);
    assert.equal(await completeOutboxEvent(pool, secondClaim[0]!.id, "worker-two"), true);

    const stored = await pool.query<{ processed: boolean; unlocked: boolean }>(
      `select processed_at is not null as processed,
              locked_at is null and locked_by is null as unlocked
       from app.outbox_events where public_id = $1`,
      [publicId],
    );
    assert.deepEqual(stored.rows[0], { processed: true, unlocked: true });
  } finally {
    try {
      await cleanupPool.query("delete from app.outbox_events where public_id = $1", [publicId]);
    } finally {
      if (cleanupPool !== pool) await cleanupPool.end();
      await pool.end();
    }
  }
});
