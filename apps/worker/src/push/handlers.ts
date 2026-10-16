import type pg from "pg";
import { withTransaction, type OutboxEvent } from "@platform/database";
import { decryptSecret, uuidV7 } from "@platform/runtime";
import { z } from "zod";
import type { OutboundPush, PushProvider, PushSendResult } from "./provider";
import { PushProviderError } from "./provider";

export type PushEventHandler = (event: OutboxEvent) => Promise<void>;

const orderPlaced = z.object({
  tenantPublicId: z.string().uuid(),
  publicId: z.string().uuid(),
  orderNumber: z.string().min(1).max(100),
}).passthrough();

const orderStatusChanged = z.object({
  tenantPublicId: z.string().uuid(),
  orderPublicId: z.string().uuid(),
  orderNumber: z.string().min(1).max(100),
  toStatus: z.enum(["placed", "accepted", "rejected", "assigned", "out_for_delivery", "delivery_failed", "delivered", "cancelled"]),
}).passthrough();

const invoiceIssued = z.object({
  tenantPublicId: z.string().uuid(),
  orderPublicId: z.string().uuid(),
  invoicePublicId: z.string().uuid(),
  invoiceNumber: z.string().min(1).max(100),
  totalAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
}).passthrough();

const paymentRecorded = z.object({
  tenantPublicId: z.string().uuid(),
  paymentPublicId: z.string().uuid(),
  amount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
}).passthrough();

interface PushContent {
  tenantPublicId: string;
  title: string;
  body: string;
  data: Record<string, string>;
}

interface DeviceRow {
  id: string;
  public_id: string;
  user_public_id: string;
  token_digest: Buffer;
  token_envelope: string;
}

interface DeliveryRow {
  id: string;
  public_id: string;
  status: "queued" | "accepted" | "failed" | "stale";
  retryable: boolean;
  attempt_count: number;
}

interface PreparedPush {
  device: DeviceRow;
  delivery: DeliveryRow;
  message: OutboundPush;
}

const statusLabels: Record<z.infer<typeof orderStatusChanged>["toStatus"], string> = {
  placed: "placed",
  accepted: "accepted",
  rejected: "rejected",
  assigned: "assigned for delivery",
  out_for_delivery: "out for delivery",
  delivery_failed: "not delivered",
  delivered: "delivered",
  cancelled: "cancelled",
};

export function pushTokenAssociatedData(userPublicId: string, provider: "expo", tokenDigest: Buffer): string {
  return `commercial-lpg:push-token:v1:${userPublicId}:${provider}:${tokenDigest.toString("hex")}`;
}

export function buildPushContent(event: OutboxEvent): PushContent {
  if (event.eventType === "order.placed") {
    const payload = orderPlaced.parse(event.payload);
    return {
      tenantPublicId: payload.tenantPublicId,
      title: "Order placed",
      body: `${payload.orderNumber} was placed successfully.`,
      data: { tenantPublicId: payload.tenantPublicId, orderPublicId: payload.publicId, eventType: event.eventType },
    };
  }
  if (event.eventType === "order.status_changed") {
    const payload = orderStatusChanged.parse(event.payload);
    return {
      tenantPublicId: payload.tenantPublicId,
      title: "Order update",
      body: `${payload.orderNumber} is ${statusLabels[payload.toStatus]}.`,
      data: { tenantPublicId: payload.tenantPublicId, orderPublicId: payload.orderPublicId, eventType: event.eventType },
    };
  }
  if (event.eventType === "invoice.issued") {
    const payload = invoiceIssued.parse(event.payload);
    return {
      tenantPublicId: payload.tenantPublicId,
      title: "Invoice issued",
      body: `${payload.invoiceNumber} for ₹${payload.totalAmount} is ready.`,
      data: {
        tenantPublicId: payload.tenantPublicId,
        orderPublicId: payload.orderPublicId,
        invoicePublicId: payload.invoicePublicId,
        eventType: event.eventType,
      },
    };
  }
  if (event.eventType === "payment.recorded") {
    const payload = paymentRecorded.parse(event.payload);
    return {
      tenantPublicId: payload.tenantPublicId,
      title: "Payment recorded",
      body: `Your payment of ₹${payload.amount} was recorded.`,
      data: { tenantPublicId: payload.tenantPublicId, paymentPublicId: payload.paymentPublicId, eventType: event.eventType },
    };
  }
  throw new Error("unsupported push event type");
}

async function activeDevices(pool: pg.Pool, tenantPublicId: string): Promise<DeviceRow[]> {
  return (
    await pool.query<DeviceRow>(
      `select device.id::text, device.public_id::text, user_row.public_id::text as user_public_id,
              device.token_digest, device.token_envelope
         from app.tenants tenant
         join app.tenant_memberships membership on membership.tenant_id = tenant.id and membership.status = 'active'
         join app.users user_row on user_row.id = membership.user_id and user_row.status = 'active'
         join app.push_devices device on device.user_id = user_row.id and device.status = 'active' and device.provider = 'expo'
        where tenant.public_id = $1 and tenant.status = 'active'
        order by device.id`,
      [tenantPublicId],
    )
  ).rows;
}

async function deliveryRow(pool: pg.Pool, event: OutboxEvent, deviceId: string, provider: string): Promise<DeliveryRow> {
  return (
    await pool.query<DeliveryRow>(
      `insert into app.push_deliveries (public_id, outbox_event_id, push_device_id, provider)
       values ($1, $2, $3, $4)
       on conflict (outbox_event_id, push_device_id)
       do update set updated_at = app.push_deliveries.updated_at
       returning id::text, public_id::text, status, retryable, attempt_count`,
      [uuidV7(), event.id, deviceId, provider],
    )
  ).rows[0]!;
}

async function acceptDelivery(pool: pg.Pool, deliveryId: string, providerReference: string): Promise<void> {
  await pool.query(
    `update app.push_deliveries
        set status = 'accepted', retryable = false, provider_reference = $2,
            attempt_count = attempt_count + 1, last_error_code = null,
            last_attempt_at = now(), accepted_at = now(), failed_at = null, stale_at = null, updated_at = now()
      where id = $1 and status in ('queued', 'failed')`,
    [deliveryId, providerReference],
  );
}

async function failDelivery(
  pool: pg.Pool,
  delivery: DeliveryRow,
  errorCode: string,
  requestedRetry: boolean,
  maxAttempts: number,
): Promise<boolean> {
  const retryable = requestedRetry && delivery.attempt_count + 1 < maxAttempts;
  await pool.query(
    `update app.push_deliveries
        set status = 'failed', retryable = $2, provider_reference = null,
            attempt_count = attempt_count + 1, last_error_code = $3,
            last_attempt_at = now(), accepted_at = null, failed_at = now(), stale_at = null, updated_at = now()
      where id = $1 and status in ('queued', 'failed')`,
    [delivery.id, retryable, errorCode],
  );
  return retryable;
}

async function staleDevice(pool: pg.Pool, prepared: PreparedPush): Promise<void> {
  await withTransaction(pool, async (client) => {
    await client.query(
      `update app.push_devices
          set status = 'stale', status_reason = 'expo_device_not_registered', stale_at = now(), revoked_at = null, updated_at = now()
        where id = $1 and status = 'active'`,
      [prepared.device.id],
    );
    await client.query(
      `update app.push_deliveries
          set status = 'stale', retryable = false, provider_reference = null,
              attempt_count = attempt_count + 1, last_error_code = 'DeviceNotRegistered',
              last_attempt_at = now(), accepted_at = null, failed_at = null, stale_at = now(), updated_at = now()
        where id = $1 and status in ('queued', 'failed')`,
      [prepared.delivery.id],
    );
  });
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size));
  return output;
}

export function createPushHandlers(options: {
  pool: pg.Pool;
  provider: PushProvider;
  pushTokenEncryptionKey: string;
  maxDeliveryAttempts: number;
}): Map<string, PushEventHandler> {
  const { pool, provider, pushTokenEncryptionKey, maxDeliveryAttempts } = options;
  if (!Number.isInteger(maxDeliveryAttempts) || maxDeliveryAttempts < 1 || maxDeliveryAttempts > 10) {
    throw new Error("maxDeliveryAttempts must be between 1 and 10");
  }

  const deliver = async (event: OutboxEvent) => {
    const content = buildPushContent(event);
    const devices = await activeDevices(pool, content.tenantPublicId);
    const prepared: PreparedPush[] = [];
    let shouldRetry = false;

    for (const device of devices) {
      const delivery = await deliveryRow(pool, event, device.id, provider.name);
      if (delivery.status === "accepted" || delivery.status === "stale") continue;
      if (delivery.status === "failed" && (!delivery.retryable || delivery.attempt_count >= maxDeliveryAttempts)) continue;
      try {
        const token = decryptSecret(
          device.token_envelope,
          pushTokenEncryptionKey,
          pushTokenAssociatedData(device.user_public_id, "expo", device.token_digest),
        );
        prepared.push({
          device,
          delivery,
          message: { deliveryPublicId: delivery.public_id, token, title: content.title, body: content.body, data: content.data },
        });
      } catch {
        shouldRetry = (await failDelivery(pool, delivery, "token_decryption_failed", true, maxDeliveryAttempts)) || shouldRetry;
      }
    }

    for (const batch of chunks(prepared, 100)) {
      let results: PushSendResult[];
      try {
        results = await provider.send(batch.map((item) => item.message));
        const identifiers = new Set(results.map((result) => result.deliveryPublicId));
        if (results.length !== batch.length || identifiers.size !== batch.length || batch.some((item) => !identifiers.has(item.delivery.public_id))) {
          throw new PushProviderError("Push provider response did not match the request", "provider_contract_error", true);
        }
      } catch (error) {
        const known = error instanceof PushProviderError ? error : new PushProviderError("Push provider failed", "provider_error", true);
        for (const item of batch) {
          shouldRetry = (await failDelivery(pool, item.delivery, known.errorCode, known.retryable, maxDeliveryAttempts)) || shouldRetry;
        }
        continue;
      }

      const byDelivery = new Map(results.map((result) => [result.deliveryPublicId, result]));
      for (const item of batch) {
        const result = byDelivery.get(item.delivery.public_id)!;
        if (result.outcome === "accepted") {
          await acceptDelivery(pool, item.delivery.id, result.providerReference);
        } else if (result.outcome === "device_not_registered") {
          await staleDevice(pool, item);
        } else {
          shouldRetry = (await failDelivery(pool, item.delivery, result.errorCode, result.retryable, maxDeliveryAttempts)) || shouldRetry;
        }
      }
    }

    if (shouldRetry) throw new PushProviderError("Push delivery has retryable failures", "delivery_retry_required", true);
  };

  return new Map<string, PushEventHandler>([
    ["order.placed", deliver],
    ["order.status_changed", deliver],
    ["invoice.issued", deliver],
    ["payment.recorded", deliver],
  ]);
}
