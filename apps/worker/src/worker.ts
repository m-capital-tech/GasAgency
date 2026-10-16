import { randomUUID } from "node:crypto";
import {
  claimOutboxEvents,
  completeOutboxEvent,
  createDatabasePool,
  retryOutboxEvent,
  type OutboxEvent,
} from "@platform/database";
import { createLogger, installShutdownHandlers } from "@platform/runtime";
import { loadWorkerConfig } from "./config";
import { createMessagingHandlers, type EventHandler } from "./messaging/handlers";
import { LocalMessagingProvider } from "./messaging/local-provider";
import { MessageIndiaProvider } from "./messaging/messageindia-provider";
import { ExpoPushProvider } from "./push/expo-provider";
import { createPushHandlers } from "./push/handlers";

const config = loadWorkerConfig();
const logger = createLogger("platform-worker", config.logLevel);
const workerId = `${config.appEnv}-${randomUUID()}`;
const pool = createDatabasePool({
  connectionString: config.databaseUrl,
  applicationName: `commercial-lpg-worker-${config.appEnv}`,
  maxConnections: config.databasePoolMax,
  statementTimeoutMs: config.databaseStatementTimeoutMs,
  sslMode: config.databaseSslMode,
  caCertificate: config.databaseCaCertificate,
});

pool.on("error", (error) => logger.error("database_pool_error", { error }));

const handlers = new Map<string, EventHandler>();
if (config.messageProvider !== "disabled") {
  const messagingProvider = config.messageProvider === "messageindia"
    ? new MessageIndiaProvider(config.messageIndia!)
    : new LocalMessagingProvider(logger, config.localMessageRevealContent);
  for (const [eventType, handler] of createMessagingHandlers({ pool, provider: messagingProvider, otpDeliveryKey: config.otpDeliveryKey!, logger })) {
    handlers.set(eventType, handler);
  }
}
if (config.pushProvider === "expo") {
  const pushProvider = new ExpoPushProvider(config.expoPush!);
  for (const [eventType, handler] of createPushHandlers({
    pool,
    provider: pushProvider,
    pushTokenEncryptionKey: config.pushTokenEncryptionKey!,
    maxDeliveryAttempts: config.pushMaxDeliveryAttempts,
  })) {
    handlers.set(eventType, handler);
  }
}
let stopping = false;
let wake: (() => void) | undefined;

function sleep(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    wake = () => {
      clearTimeout(timeout);
      resolve();
    };
  }).finally(() => {
    wake = undefined;
  });
}

function retryDelaySeconds(attemptCount: number): number {
  return Math.min(900, 5 * 2 ** Math.min(Math.max(attemptCount - 1, 0), 8));
}

async function processEvent(event: OutboxEvent): Promise<void> {
  const handler = handlers.get(event.eventType);
  if (!handler) return;

  try {
    await handler(event);
    const completed = await completeOutboxEvent(pool, event.id, workerId);
    if (!completed) logger.warn("outbox_completion_lost_lock", { event_id: event.publicId, event_type: event.eventType });
    else logger.info("outbox_event_completed", { event_id: event.publicId, event_type: event.eventType, attempt: event.attemptCount });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown worker error";
    const retryAfterSeconds = retryDelaySeconds(event.attemptCount);
    const released = await retryOutboxEvent(pool, event.id, workerId, message, retryAfterSeconds);
    logger.error("outbox_event_failed", {
      event_id: event.publicId,
      event_type: event.eventType,
      attempt: event.attemptCount,
      retry_after_seconds: retryAfterSeconds,
      lock_released: released,
      error,
    });
  }
}

async function run(): Promise<void> {
  logger.info("worker_started", { worker_id: workerId, environment: config.appEnv, registered_event_types: [...handlers.keys()] });

  while (!stopping) {
    const eventTypes = [...handlers.keys()];
    if (eventTypes.length === 0) {
      await sleep(config.pollIntervalMs);
      continue;
    }

    try {
      const events = await claimOutboxEvents(pool, {
        workerId,
        eventTypes,
        batchSize: config.batchSize,
        staleLockSeconds: config.staleLockSeconds,
      });
      if (events.length === 0) await sleep(config.pollIntervalMs);
      else await Promise.all(events.map(processEvent));
    } catch (error) {
      logger.error("worker_poll_failed", { error });
      await sleep(config.pollIntervalMs);
    }
  }
}

installShutdownHandlers(
  logger,
  async () => {
    stopping = true;
    wake?.();
    await pool.end();
  },
  { timeoutMs: config.shutdownTimeoutMs },
);

void run().catch((error) => {
  logger.error("worker_crashed", { error });
  process.exitCode = 1;
});
