import type pg from "pg";
import { uuidV7 } from "@platform/runtime";

export type TenantPushEventType =
  | "credit.terms_changed"
  | "credit.status_changed"
  | "support_case.updated";

export async function enqueueTenantPushEvent(
  client: pg.PoolClient,
  input: {
    eventType: TenantPushEventType;
    aggregateType: "credit_account" | "support_case";
    aggregatePublicId: string;
    tenantPublicId: string;
    payload: Record<string, unknown>;
    dedupeKey: string;
  },
): Promise<void> {
  await client.query(
    `insert into app.outbox_events (
       public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key
     ) values ($1, $2, $3, $4, $5::jsonb, $6)
     on conflict (dedupe_key) do nothing`,
    [
      uuidV7(),
      input.eventType,
      input.aggregateType,
      input.aggregatePublicId,
      JSON.stringify({ tenantPublicId: input.tenantPublicId, ...input.payload }),
      input.dedupeKey,
    ],
  );
}
