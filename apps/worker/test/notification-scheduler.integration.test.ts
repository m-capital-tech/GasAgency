import assert from "node:assert/strict";
import test from "node:test";
import { createDatabasePool } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { enqueueScheduledPushEvents } from "../src/push/scheduler";

const connectionString = process.env.TEST_DATABASE_URL;
const integrationTest = connectionString ? test : test.skip;

const gstAlphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function gstinCheckDigit(prefix: string): string {
  let factor = 2;
  let sum = 0;
  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    const product = gstAlphabet.indexOf(prefix[index]!) * factor;
    sum += Math.floor(product / 36) + (product % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return gstAlphabet[(36 - (sum % 36)) % 36]!;
}

integrationTest("scheduled invoice and standing-order notifications are materialized once with safe tenant payloads", async () => {
  const pool = createDatabasePool({ connectionString: connectionString!, applicationName: "notification-scheduler-integration-test", maxConnections: 3, sslMode: "disable" });
  const suffix = uuidV7().replaceAll("-", "").slice(-8);
  const registration = String(Number.parseInt(suffix.slice(0, 4), 16) % 10_000).padStart(4, "0");
  const agencyGstinPrefix = `29ABCDE${registration}F1Z`;
  const tenantGstinPrefix = `27FGHIJ${registration}G1Z`;
  const now = new Date("2026-10-22T02:00:00.000Z");

  try {
    const administrator = (
      await pool.query<{ id: string }>(
        `select assignment.user_id::text as id
           from app.role_assignments assignment
           join app.roles role_row on role_row.id = assignment.role_id
          where role_row.role_type = 'super_admin' and assignment.status = 'active'
          order by assignment.id limit 1`,
      )
    ).rows[0];
    assert.ok(administrator, "bootstrap a Super Admin before this integration test");

    const agency = (
      await pool.query<{ id: string }>(
        `insert into app.agencies (
           public_id, legal_name, display_name, gstin, phone_e164, city, state_code,
           status, created_by_user_id, approved_by_user_id, approved_at
         ) values ($1, $2, $2, $3, $4, 'Bengaluru', 'KA', 'approved', $5, $5, now())
         returning id::text`,
        [uuidV7(), `Scheduler Agency ${suffix}`, `${agencyGstinPrefix}${gstinCheckDigit(agencyGstinPrefix)}`, `+9176${String(Number.parseInt(suffix, 16) % 100_000_000).padStart(8, "0")}`, administrator.id],
      )
    ).rows[0]!;
    const tenantPublicId = uuidV7();
    const tenant = (
      await pool.query<{ id: string }>(
        `insert into app.tenants (
           public_id, legal_name, display_name, business_type, gstin, status,
           created_by_user_id, approved_by_user_id, approved_at
         ) values ($1, $2, $2, 'restaurant', $3, 'active', $4, $4, now())
         returning id::text`,
        [tenantPublicId, `Scheduler Tenant ${suffix}`, `${tenantGstinPrefix}${gstinCheckDigit(tenantGstinPrefix)}`, administrator.id],
      )
    ).rows[0]!;
    const outletPublicId = uuidV7();
    const outlet = (
      await pool.query<{ id: string }>(
        `insert into app.outlets (
           public_id, tenant_id, label, address_line_1, city, state_code, pincode, latitude, longitude
         ) values ($1, $2, 'Main kitchen', '10 Scheduler Road', 'Bengaluru', 'KA', '560001', 12.9716, 77.5946)
         returning id::text`,
        [outletPublicId, tenant.id],
      )
    ).rows[0]!;
    const account = (
      await pool.query<{ id: string }>(
        `insert into app.commercial_accounts (
           public_id, tenant_id, agency_id, payment_mode, status, opened_by_user_id
         ) values ($1, $2, $3, 'credit', 'open', $4)
         returning id::text`,
        [uuidV7(), tenant.id, agency.id, administrator.id],
      )
    ).rows[0]!;
    const requirementPublicId = uuidV7();
    const requirement = (
      await pool.query<{ id: string }>(
        `insert into app.tenant_requirements (
           public_id, tenant_id, outlet_id, period, preferred_delivery_days, preferred_slot
         ) values ($1, $2, $3, 'week', array[5]::smallint[], 'before_opening')
         returning id::text`,
        [requirementPublicId, tenant.id, outlet.id],
      )
    ).rows[0]!;
    await pool.query(
      `insert into app.tenant_requirement_items (tenant_requirement_id, cylinder_type_id, expected_quantity)
       select $1, id, 7 from app.cylinder_types where code = 'commercial_19kg'`,
      [requirement.id],
    );

    const invoicePublicIds: string[] = [];
    for (const [label, dueAt] of [["DUE", new Date(now.getTime() + 12 * 60 * 60 * 1_000)], ["OVERDUE", new Date(now.getTime() - 60 * 60 * 1_000)]] as const) {
      const quote = (
        await pool.query<{ id: string }>(
          `insert into app.order_quotes (
             public_id, tenant_id, outlet_id, agency_id, commercial_account_id, quoted_by_user_id,
             delivery_slot, payment_method, subtotal, delivery_fee, slot_surcharge, taxable_amount,
             gst_rate, gst_amount, total_amount, pricing_signature, expires_at, consumed_at
           ) values ($1, $2, $3, $4, $5, $6, 'standard', 'credit', 1000, 0, 0, 1000,
                     18, 180, 1180, decode('01', 'hex'), now() + interval '1 hour', now())
           returning id::text`,
          [uuidV7(), tenant.id, outlet.id, agency.id, account.id, administrator.id],
        )
      ).rows[0]!;
      const order = (
        await pool.query<{ id: string }>(
          `insert into app.orders (
             public_id, order_number, tenant_id, outlet_id, agency_id, commercial_account_id,
             placed_by_user_id, source_quote_id, status, payment_method, payment_status, delivery_slot,
             subtotal, delivery_fee, slot_surcharge, taxable_amount, gst_rate, gst_amount, total_amount,
             placed_at, delivered_at
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'delivered', 'credit', 'credit_reserved', 'standard',
                     1000, 0, 0, 1000, 18, 180, 1180, $9, $9)
           returning id::text`,
          [uuidV7(), `ORD-SCHED-${label}-${suffix}`, tenant.id, outlet.id, agency.id, account.id, administrator.id, quote.id, new Date(now.getTime() - 48 * 60 * 60 * 1_000)],
        )
      ).rows[0]!;
      const invoicePublicId = uuidV7();
      invoicePublicIds.push(invoicePublicId);
      await pool.query(
        `insert into app.invoices (
           public_id, invoice_number, order_id, tenant_id, commercial_account_id, status,
           taxable_amount, gst_amount, total_amount, outstanding_amount, issued_at, due_at
         ) values ($1, $2, $3, $4, $5, 'open', 1000, 180, 1180, 1180, $6, $7)`,
        [invoicePublicId, `INV-SCHED-${label}-${suffix}`, order.id, tenant.id, account.id, new Date(now.getTime() - 48 * 60 * 60 * 1_000), dueAt],
      );
    }

    const first = await enqueueScheduledPushEvents({
      pool,
      now,
      invoiceDueReminderHours: 24,
      standingOrderReminderLocalHour: 7,
      businessTimeZone: "Asia/Kolkata",
    });
    assert.equal(first.dueSoon >= 1, true);
    assert.equal(first.overdue >= 1, true);
    assert.equal(first.standingOrder >= 1, true);

    const second = await enqueueScheduledPushEvents({
      pool,
      now,
      invoiceDueReminderHours: 24,
      standingOrderReminderLocalHour: 7,
      businessTimeZone: "Asia/Kolkata",
    });
    assert.deepEqual(second, { dueSoon: 0, overdue: 0, standingOrder: 0 });

    const events = await pool.query<{ event_type: string; payload: Record<string, unknown> }>(
      `select event_type, payload
         from app.outbox_events
        where payload->>'tenantPublicId' = $1
          and event_type in ('invoice.due_soon', 'invoice.overdue', 'standing_order.reminder')
        order by event_type`,
      [tenantPublicId],
    );
    assert.deepEqual(events.rows.map((event) => event.event_type), ["invoice.due_soon", "invoice.overdue", "standing_order.reminder"]);
    assert.equal(events.rows.every((event) => !Object.hasOwn(event.payload, "reason") && !Object.hasOwn(event.payload, "deliveryInstructions")), true);
    const standing = events.rows.find((event) => event.event_type === "standing_order.reminder")!.payload;
    assert.deepEqual({ requirementPublicId: standing.requirementPublicId, outletPublicId: standing.outletPublicId, deliveryDate: standing.deliveryDate, totalQuantity: standing.totalQuantity }, {
      requirementPublicId,
      outletPublicId,
      deliveryDate: "2026-10-23",
      totalQuantity: 7,
    });
    assert.equal(
      (await pool.query<{ count: string }>("select count(*)::text as count from app.invoices where public_id = any($1::uuid[]) and status = 'overdue'", [invoicePublicIds])).rows[0]!.count,
      "1",
    );
  } finally {
    await pool.end();
  }
});
