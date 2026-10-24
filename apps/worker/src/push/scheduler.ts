import type pg from "pg";
import { withTransaction } from "@platform/database";

interface LocalCalendar {
  date: string;
  hour: number;
  year: number;
  month: number;
  day: number;
}

function localCalendar(now: Date, timeZone: string): LocalCalendar {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = value("hour");
  if (![year, month, day, hour].every(Number.isInteger)) throw new Error("notification scheduler could not resolve the local calendar");
  return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, hour, year, month, day };
}

function nextLocalDate(calendar: LocalCalendar): { date: string; weekday: number } {
  const date = new Date(Date.UTC(calendar.year, calendar.month - 1, calendar.day + 1));
  return { date: date.toISOString().slice(0, 10), weekday: date.getUTCDay() };
}

export function standingOrderReminderTarget(now: Date, timeZone: string, localHour: number): { date: string; weekday: number } | null {
  const calendar = localCalendar(now, timeZone);
  return calendar.hour >= localHour ? nextLocalDate(calendar) : null;
}

export interface ScheduledNotificationCounts {
  dueSoon: number;
  overdue: number;
  standingOrder: number;
}

/**
 * Materializes time-based notification events into the durable outbox. Unique
 * dedupe keys make repeated scheduler runs and overlapping workers harmless.
 */
export async function enqueueScheduledPushEvents(options: {
  pool: pg.Pool;
  now?: Date;
  invoiceDueReminderHours: number;
  standingOrderReminderLocalHour: number;
  businessTimeZone: string;
}): Promise<ScheduledNotificationCounts> {
  const now = options.now ?? new Date();
  if (!Number.isInteger(options.invoiceDueReminderHours) || options.invoiceDueReminderHours < 1 || options.invoiceDueReminderHours > 168) {
    throw new Error("invoiceDueReminderHours must be between 1 and 168");
  }
  if (!Number.isInteger(options.standingOrderReminderLocalHour) || options.standingOrderReminderLocalHour < 0 || options.standingOrderReminderLocalHour > 23) {
    throw new Error("standingOrderReminderLocalHour must be between 0 and 23");
  }

  const invoiceCounts = await withTransaction(options.pool, async (client) => {
    await client.query(
      `update app.invoices
          set status = 'overdue', updated_at = $1
        where status = 'open'
          and outstanding_amount > 0
          and due_at is not null
          and due_at <= $1`,
      [now],
    );
    const overdue = await client.query(
      `insert into app.outbox_events (
         public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key
       )
       select gen_random_uuid(), 'invoice.overdue', 'invoice', invoice.public_id,
              jsonb_build_object(
                'tenantPublicId', tenant.public_id,
                'invoicePublicId', invoice.public_id,
                'invoiceNumber', invoice.invoice_number,
                'outstandingAmount', invoice.outstanding_amount::text,
                'dueAt', invoice.due_at
              ),
              concat('invoice-overdue:', invoice.public_id::text, ':', extract(epoch from invoice.due_at)::bigint::text)
         from app.invoices invoice
         join app.tenants tenant on tenant.id = invoice.tenant_id and tenant.status = 'active'
        where invoice.status = 'overdue'
          and invoice.outstanding_amount > 0
          and invoice.due_at is not null
          and invoice.due_at <= $1
       on conflict (dedupe_key) do nothing`,
      [now],
    );
    const dueSoon = await client.query(
      `insert into app.outbox_events (
         public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key
       )
       select gen_random_uuid(), 'invoice.due_soon', 'invoice', invoice.public_id,
              jsonb_build_object(
                'tenantPublicId', tenant.public_id,
                'invoicePublicId', invoice.public_id,
                'invoiceNumber', invoice.invoice_number,
                'outstandingAmount', invoice.outstanding_amount::text,
                'dueAt', invoice.due_at
              ),
              concat('invoice-due-soon:', invoice.public_id::text, ':', extract(epoch from invoice.due_at)::bigint::text)
         from app.invoices invoice
         join app.tenants tenant on tenant.id = invoice.tenant_id and tenant.status = 'active'
        where invoice.status = 'open'
          and invoice.outstanding_amount > 0
          and invoice.due_at > $1
          and invoice.due_at <= $1 + make_interval(hours => $2)
       on conflict (dedupe_key) do nothing`,
      [now, options.invoiceDueReminderHours],
    );
    return { dueSoon: dueSoon.rowCount ?? 0, overdue: overdue.rowCount ?? 0 };
  });

  let standingOrder = 0;
  const delivery = standingOrderReminderTarget(now, options.businessTimeZone, options.standingOrderReminderLocalHour);
  if (delivery) {
    const result = await options.pool.query(
      `insert into app.outbox_events (
         public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key
       )
       select gen_random_uuid(), 'standing_order.reminder', 'tenant_requirement', requirement.public_id,
              jsonb_build_object(
                'tenantPublicId', tenant.public_id,
                'requirementPublicId', requirement.public_id,
                'outletPublicId', outlet.public_id,
                'outletLabel', outlet.label,
                'deliveryDate', $1::text,
                'totalQuantity', quantities.total_quantity
              ),
              concat('standing-order-reminder:', requirement.public_id::text, ':', $1::text)
         from app.tenant_requirements requirement
         join app.tenants tenant on tenant.id = requirement.tenant_id and tenant.status = 'active'
         join app.outlets outlet on outlet.id = requirement.outlet_id and outlet.tenant_id = tenant.id
         join lateral (
           select sum(item.expected_quantity)::integer as total_quantity
             from app.tenant_requirement_items item
            where item.tenant_requirement_id = requirement.id
         ) quantities on quantities.total_quantity > 0
        where requirement.period = 'week'
          and requirement.preferred_delivery_days @> array[$2::smallint]
       on conflict (dedupe_key) do nothing`,
      [delivery.date, delivery.weekday],
    );
    standingOrder = result.rowCount ?? 0;
  }

  return { ...invoiceCounts, standingOrder };
}
