import type pg from "pg";
import { withTransaction } from "./pool";

export interface OutboxEvent {
  id: string;
  publicId: string;
  eventType: string;
  aggregateType: string;
  aggregatePublicId: string;
  payload: unknown;
  attemptCount: number;
  createdAt: Date;
}

interface OutboxRow {
  id: string;
  public_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_public_id: string;
  payload: unknown;
  attempt_count: number;
  created_at: Date;
}

function toOutboxEvent(row: OutboxRow): OutboxEvent {
  return {
    id: row.id,
    publicId: row.public_id,
    eventType: row.event_type,
    aggregateType: row.aggregate_type,
    aggregatePublicId: row.aggregate_public_id,
    payload: row.payload,
    attemptCount: row.attempt_count,
    createdAt: row.created_at,
  };
}

export async function claimOutboxEvents(
  pool: pg.Pool,
  options: { workerId: string; eventTypes: readonly string[]; batchSize: number; staleLockSeconds: number },
): Promise<OutboxEvent[]> {
  if (options.eventTypes.length === 0) return [];
  if (!Number.isInteger(options.batchSize) || options.batchSize < 1 || options.batchSize > 100) {
    throw new Error("batchSize must be an integer between 1 and 100");
  }
  if (!Number.isInteger(options.staleLockSeconds) || options.staleLockSeconds < 30) {
    throw new Error("staleLockSeconds must be an integer of at least 30");
  }

  return withTransaction(pool, async (client) => {
    const result = await client.query<OutboxRow>(
      `with claimable as (
         select id
         from app.outbox_events
         where processed_at is null
           and available_at <= now()
           and event_type = any($1::text[])
           and (locked_at is null or locked_at < now() - make_interval(secs => $2))
         order by available_at, id
         limit $3
         for update skip locked
       )
       update app.outbox_events as event
       set locked_at = now(),
           locked_by = $4,
           attempt_count = event.attempt_count + 1
       from claimable
       where event.id = claimable.id
       returning event.id,
                 event.public_id,
                 event.event_type,
                 event.aggregate_type,
                 event.aggregate_public_id,
                 event.payload,
                 event.attempt_count,
                 event.created_at`,
      [options.eventTypes, options.staleLockSeconds, options.batchSize, options.workerId],
    );

    return result.rows.map(toOutboxEvent);
  });
}

export async function completeOutboxEvent(pool: pg.Pool, eventId: string, workerId: string): Promise<boolean> {
  const result = await pool.query(
    `update app.outbox_events
     set processed_at = now(), locked_at = null, locked_by = null, last_error = null
     where id = $1 and locked_by = $2 and processed_at is null`,
    [eventId, workerId],
  );
  return result.rowCount === 1;
}

export async function retryOutboxEvent(
  pool: pg.Pool,
  eventId: string,
  workerId: string,
  errorMessage: string,
  retryAfterSeconds: number,
): Promise<boolean> {
  if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 1 || retryAfterSeconds > 3_600) {
    throw new Error("retryAfterSeconds must be an integer between 1 and 3600");
  }

  const result = await pool.query(
    `update app.outbox_events
     set available_at = now() + make_interval(secs => $3),
         locked_at = null,
         locked_by = null,
         last_error = left($4, 2000)
     where id = $1 and locked_by = $2 and processed_at is null`,
    [eventId, workerId, retryAfterSeconds, errorMessage],
  );
  return result.rowCount === 1;
}
