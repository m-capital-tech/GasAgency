import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { Router } from "express";
import { withTransaction, type AuthPrincipal } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { assertPlatformWorkflowEnabled } from "../domain/platform-settings";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { assertAuthorized } from "../security/rbac";

const publicId = z.string().uuid();
const safeIdempotencyKey = /^[A-Za-z0-9._:-]{8,128}$/;
const orderStatuses = ["placed", "accepted", "assigned", "out_for_delivery", "delivery_failed", "delivered", "rejected", "cancelled"] as const;
const transitionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept") }).strict(),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(500) }).strict(),
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3).max(500) }).strict(),
  z.object({ action: z.literal("assign"), deliveryStaffPublicId: publicId }).strict(),
  z.object({ action: z.literal("dispatch") }).strict(),
  z.object({ action: z.literal("fail_delivery"), reason: z.string().trim().min(3).max(500) }).strict(),
  z.object({ action: z.literal("reschedule") }).strict(),
  z.object({
    action: z.literal("deliver"),
    cashCollected: z.boolean().default(false),
    emptiesCollected: z.array(z.object({ cylinderTypeCode: z.string().trim().min(1).max(64), quantity: z.number().int().positive().max(500) })).max(10)
      .refine((items) => new Set(items.map((item) => item.cylinderTypeCode)).size === items.length, "cylinder types must be unique"),
  }).strict(),
]);
type Transition = z.infer<typeof transitionSchema>;

interface AgencyRow { id: string; public_id: string; display_name: string; city: string; }
interface LockedOrder {
  id: string;
  public_id: string;
  order_number: string;
  status: typeof orderStatuses[number];
  payment_method: "cod" | "credit" | "upi" | "card" | "netbanking";
  payment_status: string;
  outlet_id: string;
  tenant_id: string;
  tenant_public_id: string;
  commercial_account_id: string;
  assigned_delivery_staff_id: string | null;
  total_amount: string;
  taxable_amount: string;
  gst_amount: string;
  outlet_empty_count: number;
  net_term_days: number | null;
}
interface OrderItemRow { cylinder_type_id: string; cylinder_code: string; quantity: number; }
interface InventoryRow {
  id: string;
  cylinder_type_id: string;
  cylinder_code: string;
  full_on_hand: number;
  empty_on_hand: number;
  reserved_full: number;
  with_accounts: number;
}

function actorRoles(principal: AuthPrincipal): string {
  return [...new Set(principal.assignments.map((assignment) => assignment.roleType))].join(",");
}

function requiredPermission(action: Transition["action"]): "order.edit" | "order.execute" {
  return ["dispatch", "fail_delivery", "deliver"].includes(action) ? "order.execute" : "order.edit";
}

async function agencyContext(client: pg.Pool | pg.PoolClient, principal: AuthPrincipal, agencyPublicId: string, permission = "order.view"): Promise<AgencyRow> {
  const agency = (
    await client.query<AgencyRow>(
      "select id::text, public_id::text, display_name, city from app.agencies where public_id = $1 and status = 'approved'",
      [agencyPublicId],
    )
  ).rows[0];
  if (!agency) throw new HttpError(404, "agency_not_found", "The agency was not found or is unavailable.");
  assertAuthorized(principal, permission, { agencyPublicId: agency.public_id, city: agency.city });
  return agency;
}

async function orderView(client: pg.Pool | pg.PoolClient, agencyId: string, orderPublicId: string) {
  const row = (
    await client.query<{
      public_id: string; order_number: string; status: string; payment_method: string; payment_status: string;
      delivery_slot: string; requested_delivery_date: string | null; empties_expected: number; empties_collected: number;
      delivery_instructions: string | null; subtotal: string; delivery_fee: string; slot_surcharge: string;
      taxable_amount: string; gst_rate: string; gst_amount: string; total_amount: string; placed_at: Date | null;
      accepted_at: Date | null; assigned_at: Date | null; dispatched_at: Date | null; delivered_at: Date | null;
      failure_reason: string | null; tenant_public_id: string; tenant_display_name: string; business_type: string; gstin: string;
      outlet_public_id: string; outlet_label: string; address_line_1: string; address_line_2: string | null; city: string;
      pincode: string; contact_name: string | null; contact_phone_e164: string | null;
      staff_public_id: string | null; staff_name: string | null; vehicle_type: string | null; vehicle_number: string | null;
      invoice_public_id: string | null; invoice_number: string | null; invoice_status: string | null; due_at: Date | null;
      outstanding_amount: string | null; items: unknown[]; timeline: unknown[]; empty_collections: unknown[];
    }>(
      `select order_row.public_id::text, order_row.order_number, order_row.status,
              order_row.payment_method, order_row.payment_status, order_row.delivery_slot,
              order_row.requested_delivery_date::text, order_row.empties_expected, order_row.empties_collected,
              order_row.delivery_instructions, order_row.subtotal::text, order_row.delivery_fee::text,
              order_row.slot_surcharge::text, order_row.taxable_amount::text, order_row.gst_rate::text,
              order_row.gst_amount::text, order_row.total_amount::text, order_row.placed_at,
              order_row.accepted_at, order_row.assigned_at, order_row.dispatched_at, order_row.delivered_at,
              order_row.failure_reason, tenant.public_id::text as tenant_public_id,
              tenant.display_name as tenant_display_name, tenant.business_type, tenant.gstin,
              outlet.public_id::text as outlet_public_id, outlet.label as outlet_label,
              outlet.address_line_1, outlet.address_line_2, outlet.city, outlet.pincode,
              outlet.contact_name, outlet.contact_phone_e164,
              staff.public_id::text as staff_public_id, staff_user.full_name as staff_name,
              staff.vehicle_type, staff.vehicle_number,
              invoice.public_id::text as invoice_public_id, invoice.invoice_number,
              invoice.status as invoice_status, invoice.due_at, invoice.outstanding_amount::text,
              coalesce(items.value, '[]'::jsonb) as items,
              coalesce(timeline.value, '[]'::jsonb) as timeline,
              coalesce(empty_collections.value, '[]'::jsonb) as empty_collections
         from app.orders order_row
         join app.tenants tenant on tenant.id = order_row.tenant_id
         join app.outlets outlet on outlet.id = order_row.outlet_id
         left join app.delivery_staff staff on staff.id = order_row.assigned_delivery_staff_id
         left join app.users staff_user on staff_user.id = staff.user_id
         left join app.invoices invoice on invoice.order_id = order_row.id
         left join lateral (
           select jsonb_agg(jsonb_build_object(
                    'cylinderTypeCode', item.cylinder_code, 'displayName', item.cylinder_display_name,
                    'quantity', item.quantity, 'unitPrice', item.unit_price, 'priceSource', item.price_source,
                    'lineSubtotal', item.line_subtotal
                  ) order by item.cylinder_type_id) as value
             from app.order_items item where item.order_id = order_row.id
         ) items on true
         left join lateral (
           select jsonb_agg(jsonb_build_object(
                    'fromStatus', event.from_status, 'toStatus', event.to_status,
                    'actorName', actor.full_name, 'reason', event.reason, 'occurredAt', event.occurred_at
                  ) order by event.occurred_at, event.id) as value
             from app.order_status_events event
             left join app.users actor on actor.id = event.actor_user_id
            where event.order_id = order_row.id
         ) timeline on true
         left join lateral (
           select jsonb_agg(jsonb_build_object('cylinderTypeCode', cylinder.code, 'quantity', collected.quantity) order by cylinder.code) as value
             from app.order_empty_collections collected
             join app.cylinder_types cylinder on cylinder.id = collected.cylinder_type_id
            where collected.order_id = order_row.id
         ) empty_collections on true
        where order_row.agency_id = $1 and order_row.public_id = $2`,
      [agencyId, orderPublicId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "order_not_found", "The order was not found for this agency.");
  return {
    publicId: row.public_id,
    orderNumber: row.order_number,
    status: row.status,
    payment: { method: row.payment_method, status: row.payment_status },
    delivery: {
      slot: row.delivery_slot,
      requestedDate: row.requested_delivery_date,
      instructions: row.delivery_instructions,
      emptiesExpected: row.empties_expected,
      emptiesCollected: row.empties_collected,
      emptyCollections: row.empty_collections,
    },
    amounts: {
      subtotal: row.subtotal, deliveryFee: row.delivery_fee, slotSurcharge: row.slot_surcharge,
      taxableAmount: row.taxable_amount, gstRate: Number(row.gst_rate), gstAmount: row.gst_amount,
      totalAmount: row.total_amount, currency: "INR",
    },
    tenant: { publicId: row.tenant_public_id, displayName: row.tenant_display_name, businessType: row.business_type, gstin: row.gstin },
    outlet: {
      publicId: row.outlet_public_id, label: row.outlet_label,
      address: [row.address_line_1, row.address_line_2, row.city, row.pincode].filter(Boolean).join(", "),
      contactName: row.contact_name, contactPhoneE164: row.contact_phone_e164,
    },
    items: row.items,
    deliveryStaff: row.staff_public_id ? { publicId: row.staff_public_id, fullName: row.staff_name, vehicleType: row.vehicle_type, vehicleNumber: row.vehicle_number } : null,
    invoice: row.invoice_public_id ? { publicId: row.invoice_public_id, invoiceNumber: row.invoice_number, status: row.invoice_status, dueAt: row.due_at?.toISOString() ?? null, outstandingAmount: row.outstanding_amount } : null,
    timeline: row.timeline,
    timestamps: {
      placedAt: row.placed_at?.toISOString() ?? null, acceptedAt: row.accepted_at?.toISOString() ?? null,
      assignedAt: row.assigned_at?.toISOString() ?? null, dispatchedAt: row.dispatched_at?.toISOString() ?? null,
      deliveredAt: row.delivered_at?.toISOString() ?? null,
    },
    failureReason: row.failure_reason,
  };
}

async function lockedOrder(client: pg.PoolClient, agencyId: string, orderPublicId: string): Promise<LockedOrder> {
  const row = (
    await client.query<LockedOrder>(
      `select order_row.id::text, order_row.public_id::text, order_row.order_number,
              order_row.status, order_row.payment_method, order_row.payment_status,
              order_row.outlet_id::text, order_row.tenant_id::text,
              tenant.public_id::text as tenant_public_id,
              order_row.commercial_account_id::text, order_row.assigned_delivery_staff_id::text,
              order_row.total_amount::text, order_row.taxable_amount::text, order_row.gst_amount::text,
              outlet.empty_count as outlet_empty_count, credit.net_term_days
         from app.orders order_row
         join app.tenants tenant on tenant.id = order_row.tenant_id
         join app.outlets outlet on outlet.id = order_row.outlet_id
         left join app.credit_accounts credit on credit.commercial_account_id = order_row.commercial_account_id
        where order_row.agency_id = $1 and order_row.public_id = $2
        for update of order_row, outlet`,
      [agencyId, orderPublicId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "order_not_found", "The order was not found for this agency.");
  return row;
}

async function orderItems(client: pg.PoolClient, orderId: string): Promise<OrderItemRow[]> {
  return (await client.query<OrderItemRow>(
    `select cylinder_type_id::text, cylinder_code, quantity from app.order_items
      where order_id = $1 order by cylinder_type_id`,
    [orderId],
  )).rows;
}

async function lockedInventory(client: pg.PoolClient, agencyId: string, items: OrderItemRow[]): Promise<Map<string, InventoryRow>> {
  const ids = items.map((item) => item.cylinder_type_id);
  const rows = ids.length ? (await client.query<InventoryRow>(
    `select inventory.id::text, inventory.cylinder_type_id::text, cylinder.code as cylinder_code,
            inventory.full_on_hand, inventory.empty_on_hand, inventory.reserved_full, inventory.with_accounts
       from app.agency_inventory inventory
       join app.cylinder_types cylinder on cylinder.id = inventory.cylinder_type_id
      where inventory.agency_id = $1 and inventory.cylinder_type_id = any($2::bigint[])
      order by inventory.cylinder_type_id for update of inventory`,
    [agencyId, ids],
  )).rows : [];
  if (rows.length !== ids.length) {
    const found = new Set(rows.map((row) => row.cylinder_type_id));
    const missing = items.filter((item) => !found.has(item.cylinder_type_id)).map((item) => item.cylinder_code);
    throw new HttpError(422, "inventory_not_configured", "Agency inventory is not configured for every order item.", { missingCylinderTypes: missing });
  }
  return new Map(rows.map((row) => [row.cylinder_type_id, row]));
}

async function inventoryEvent(
  client: pg.PoolClient,
  inventoryId: string,
  orderId: string,
  actorUserId: string,
  eventType: string,
  delta: { full?: number; empty?: number; reserved?: number; withAccounts?: number },
  reason: string,
) {
  const balance = (await client.query<{ full_on_hand: number; empty_on_hand: number; reserved_full: number; with_accounts: number }>(
    "select full_on_hand, empty_on_hand, reserved_full, with_accounts from app.agency_inventory where id = $1",
    [inventoryId],
  )).rows[0]!;
  await client.query(
    `insert into app.agency_inventory_events (
       public_id, agency_inventory_id, order_id, actor_user_id, event_type,
       full_delta, empty_delta, reserved_delta, with_accounts_delta,
       full_balance, empty_balance, reserved_balance, with_accounts_balance, reason
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [uuidV7(), inventoryId, orderId, actorUserId, eventType, delta.full ?? 0, delta.empty ?? 0,
      delta.reserved ?? 0, delta.withAccounts ?? 0, balance.full_on_hand, balance.empty_on_hand,
      balance.reserved_full, balance.with_accounts, reason],
  );
}

async function reserveStock(client: pg.PoolClient, agencyId: string, order: LockedOrder, principal: AuthPrincipal, reason: string) {
  const items = await orderItems(client, order.id);
  const inventory = await lockedInventory(client, agencyId, items);
  for (const item of items) {
    const stock = inventory.get(item.cylinder_type_id)!;
    const available = stock.full_on_hand - stock.reserved_full;
    if (available < item.quantity) {
      throw new HttpError(422, "insufficient_inventory", `${item.cylinder_code} has ${available} unreserved cylinders; ${item.quantity} are required.`, { cylinderTypeCode: item.cylinder_code, available, required: item.quantity });
    }
  }
  for (const item of items) {
    const stock = inventory.get(item.cylinder_type_id)!;
    await client.query("update app.agency_inventory set reserved_full = reserved_full + $2, updated_by_user_id = $3, updated_at = now() where id = $1", [stock.id, item.quantity, principal.userId]);
    await inventoryEvent(client, stock.id, order.id, principal.userId, "reservation", { reserved: item.quantity }, reason);
  }
}

async function releaseReservation(client: pg.PoolClient, agencyId: string, order: LockedOrder, principal: AuthPrincipal, reason: string) {
  const items = await orderItems(client, order.id);
  const inventory = await lockedInventory(client, agencyId, items);
  for (const item of items) {
    const stock = inventory.get(item.cylinder_type_id)!;
    if (stock.reserved_full < item.quantity) throw new HttpError(409, "inventory_reservation_mismatch", `The ${item.cylinder_code} reservation is inconsistent and requires review.`);
  }
  for (const item of items) {
    const stock = inventory.get(item.cylinder_type_id)!;
    await client.query("update app.agency_inventory set reserved_full = reserved_full - $2, updated_by_user_id = $3, updated_at = now() where id = $1", [stock.id, item.quantity, principal.userId]);
    await inventoryEvent(client, stock.id, order.id, principal.userId, "reservation_release", { reserved: -item.quantity }, reason);
  }
}

async function dispatchStock(client: pg.PoolClient, agencyId: string, order: LockedOrder, principal: AuthPrincipal) {
  const items = await orderItems(client, order.id);
  const inventory = await lockedInventory(client, agencyId, items);
  for (const item of items) {
    const stock = inventory.get(item.cylinder_type_id)!;
    if (stock.full_on_hand < item.quantity || stock.reserved_full < item.quantity) throw new HttpError(409, "inventory_reservation_mismatch", `The ${item.cylinder_code} reservation is inconsistent and requires review.`);
  }
  for (const item of items) {
    const stock = inventory.get(item.cylinder_type_id)!;
    await client.query(
      "update app.agency_inventory set full_on_hand = full_on_hand - $2, reserved_full = reserved_full - $2, updated_by_user_id = $3, updated_at = now() where id = $1",
      [stock.id, item.quantity, principal.userId],
    );
    await inventoryEvent(client, stock.id, order.id, principal.userId, "dispatch", { full: -item.quantity, reserved: -item.quantity }, "Cylinders dispatched for delivery");
  }
}

async function returnDispatchedStock(client: pg.PoolClient, agencyId: string, order: LockedOrder, principal: AuthPrincipal) {
  const items = await orderItems(client, order.id);
  const inventory = await lockedInventory(client, agencyId, items);
  for (const item of items) {
    const stock = inventory.get(item.cylinder_type_id)!;
    await client.query("update app.agency_inventory set full_on_hand = full_on_hand + $2, updated_by_user_id = $3, updated_at = now() where id = $1", [stock.id, item.quantity, principal.userId]);
    await inventoryEvent(client, stock.id, order.id, principal.userId, "dispatch_return", { full: item.quantity }, "Failed delivery stock returned to agency");
  }
}

async function recordStatus(client: pg.PoolClient, order: LockedOrder, toStatus: string, principal: AuthPrincipal, reason: string) {
  await client.query(
    `insert into app.order_status_events (public_id, order_id, from_status, to_status, actor_user_id, reason)
     values ($1, $2, $3, $4, $5, $6)`,
    [uuidV7(), order.id, order.status, toStatus, principal.userId, reason],
  );
}

function requireStatus(order: LockedOrder, allowed: string[], action: string) {
  if (!allowed.includes(order.status)) throw new HttpError(409, "invalid_order_state", `An order in ${order.status} cannot be ${action}.`);
}

export function agencyOrdersRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.get("/agencies/:agencyPublicId/orders", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      const status = z.enum(orderStatuses).optional().safeParse(request.query.status || undefined);
      if (!agencyId.success || !status.success) throw new HttpError(400, "invalid_request", "The agency identifier or order status is invalid.");
      const principal = authenticatedPrincipal(response);
      const agency = await agencyContext(options.pool, principal, agencyId.data);
      const rows = await options.pool.query<{ public_id: string }>(
        `select public_id::text from app.orders
          where agency_id = $1 and ($2::text is null or status = $2)
          order by created_at desc, id desc limit 100`,
        [agency.id, status.data ?? null],
      );
      const orders = await Promise.all(rows.rows.map((row) => orderView(options.pool, agency.id, row.public_id)));
      response.status(200).json({ agency: { publicId: agency.public_id, displayName: agency.display_name }, orders });
    } catch (error) { next(error); }
  });

  router.get("/agencies/:agencyPublicId/orders/:orderPublicId", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      const orderId = publicId.safeParse(request.params.orderPublicId);
      if (!agencyId.success || !orderId.success) throw new HttpError(400, "invalid_request", "The agency or order identifier is invalid.");
      const principal = authenticatedPrincipal(response);
      const agency = await agencyContext(options.pool, principal, agencyId.data);
      response.status(200).json({ order: await orderView(options.pool, agency.id, orderId.data) });
    } catch (error) { next(error); }
  });

  router.get("/agencies/:agencyPublicId/delivery-staff", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      if (!agencyId.success) throw new HttpError(400, "invalid_request", "The agency identifier is invalid.");
      const principal = authenticatedPrincipal(response);
      const agency = await agencyContext(options.pool, principal, agencyId.data);
      const staff = await options.pool.query<{ public_id: string; full_name: string; phone_e164: string; vehicle_type: string; vehicle_number: string; status: string; active_drops: number }>(
        `select staff.public_id::text, user_row.full_name, user_row.phone_e164,
                staff.vehicle_type, staff.vehicle_number, staff.status,
                count(order_row.id) filter (where order_row.status in ('assigned', 'out_for_delivery'))::int as active_drops
           from app.delivery_staff staff
           join app.users user_row on user_row.id = staff.user_id
           left join app.orders order_row on order_row.assigned_delivery_staff_id = staff.id
          where staff.agency_id = $1
          group by staff.id, user_row.id order by user_row.full_name`,
        [agency.id],
      );
      response.status(200).json({ staff: staff.rows.map((row) => ({ publicId: row.public_id, fullName: row.full_name, phoneE164: row.phone_e164, vehicleType: row.vehicle_type, vehicleNumber: row.vehicle_number, status: row.status, activeDrops: row.active_drops })) });
    } catch (error) { next(error); }
  });

  router.get("/agencies/:agencyPublicId/inventory", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      if (!agencyId.success) throw new HttpError(400, "invalid_request", "The agency identifier is invalid.");
      const principal = authenticatedPrincipal(response);
      const agency = await agencyContext(options.pool, principal, agencyId.data, "agency.view");
      const inventory = await options.pool.query<{ public_id: string; code: string; display_name: string; full_on_hand: number; empty_on_hand: number; reserved_full: number; with_accounts: number; low_stock_threshold: number }>(
        `select inventory.public_id::text, cylinder.code, cylinder.display_name,
                inventory.full_on_hand, inventory.empty_on_hand, inventory.reserved_full,
                inventory.with_accounts, inventory.low_stock_threshold
           from app.agency_inventory inventory
           join app.cylinder_types cylinder on cylinder.id = inventory.cylinder_type_id
          where inventory.agency_id = $1 order by cylinder.weight_kg`,
        [agency.id],
      );
      response.status(200).json({ inventory: inventory.rows.map((row) => ({ publicId: row.public_id, cylinderTypeCode: row.code, displayName: row.display_name, fullOnHand: row.full_on_hand, reservedFull: row.reserved_full, availableFull: row.full_on_hand - row.reserved_full, emptyOnHand: row.empty_on_hand, withAccounts: row.with_accounts, lowStockThreshold: row.low_stock_threshold })) });
    } catch (error) { next(error); }
  });

  router.post("/agencies/:agencyPublicId/orders/:orderPublicId/transitions", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      const orderId = publicId.safeParse(request.params.orderPublicId);
      const parsed = transitionSchema.safeParse(request.body);
      if (!agencyId.success || !orderId.success || !parsed.success) throw new HttpError(400, "invalid_request", "The agency order transition is invalid.", parsed.success ? undefined : parsed.error.flatten());
      const idempotencyKey = request.header("idempotency-key")?.trim();
      if (!idempotencyKey || !safeIdempotencyKey.test(idempotencyKey)) throw new HttpError(400, "invalid_idempotency_key", "Idempotency-Key must contain 8–128 safe characters.");
      const principal = authenticatedPrincipal(response);
      await assertPlatformWorkflowEnabled(options.pool, "workflows.agency_fulfillment", "Agency fulfilment actions are temporarily paused by a Super Admin.");
      const hash = createHash("sha256").update(JSON.stringify(parsed.data), "utf8").digest();
      const scope = `agency.order.transition:${principal.userPublicId}:${agencyId.data}:${orderId.data}`;
      const result = await withTransaction(options.pool, async (client) => {
        const agency = await agencyContext(client, principal, agencyId.data, requiredPermission(parsed.data.action));
        const claimed = await client.query(
          `insert into app.idempotency_keys (scope, idempotency_key, request_hash, locked_until, expires_at)
           values ($1, $2, $3, now() + interval '30 seconds', now() + interval '24 hours')
           on conflict (scope, idempotency_key) do nothing`,
          [scope, idempotencyKey, hash],
        );
        if (claimed.rowCount === 0) {
          const prior = (await client.query<{ same_request: boolean; response_status: number | null; response_body: unknown }>(
            `select request_hash = $3 as same_request, response_status, response_body
               from app.idempotency_keys where scope = $1 and idempotency_key = $2 for update`,
            [scope, idempotencyKey, hash],
          )).rows[0];
          if (!prior?.same_request) throw new HttpError(409, "idempotency_key_reused", "This idempotency key was already used for another transition.");
          if (prior.response_status && prior.response_body) return { status: prior.response_status, body: prior.response_body, replayed: true };
          throw new HttpError(409, "request_in_progress", "This order transition is still in progress.");
        }

        const order = await lockedOrder(client, agency.id, orderId.data);
        let nextStatus = order.status;
        let reason = "Order updated";
        switch (parsed.data.action) {
          case "accept":
            requireStatus(order, ["placed"], "accepted");
            await reserveStock(client, agency.id, order, principal, "Inventory reserved when agency accepted order");
            nextStatus = "accepted"; reason = "Order accepted by agency";
            await client.query("update app.orders set status = 'accepted', accepted_at = now(), updated_at = now() where id = $1", [order.id]);
            break;
          case "reject":
            requireStatus(order, ["placed"], "rejected");
            nextStatus = "rejected"; reason = parsed.data.reason;
            await client.query("update app.orders set status = 'rejected', payment_status = 'voided', failure_reason = $2, updated_at = now() where id = $1", [order.id, reason]);
            break;
          case "cancel":
            requireStatus(order, ["placed", "accepted", "assigned", "delivery_failed"], "cancelled");
            if (["accepted", "assigned"].includes(order.status)) await releaseReservation(client, agency.id, order, principal, "Inventory reservation released when order was cancelled");
            nextStatus = "cancelled"; reason = parsed.data.reason;
            await client.query("update app.orders set status = 'cancelled', payment_status = 'voided', assigned_delivery_staff_id = null, cancelled_at = now(), failure_reason = $2, updated_at = now() where id = $1", [order.id, reason]);
            break;
          case "assign": {
            requireStatus(order, ["accepted", "assigned"], "assigned");
            const staff = (await client.query<{ id: string; full_name: string }>(
              `select staff.id::text, user_row.full_name from app.delivery_staff staff
                join app.users user_row on user_row.id = staff.user_id
               where staff.public_id = $1 and staff.agency_id = $2 and staff.status = 'active'`,
              [parsed.data.deliveryStaffPublicId, agency.id],
            )).rows[0];
            if (!staff) throw new HttpError(422, "delivery_staff_unavailable", "The selected delivery staff member is unavailable.");
            nextStatus = "assigned"; reason = `Assigned to ${staff.full_name}`;
            await client.query("update app.orders set status = 'assigned', assigned_delivery_staff_id = $2, assigned_at = now(), updated_at = now() where id = $1", [order.id, staff.id]);
            break;
          }
          case "dispatch":
            requireStatus(order, ["assigned"], "dispatched");
            await dispatchStock(client, agency.id, order, principal);
            nextStatus = "out_for_delivery"; reason = "Order dispatched from agency inventory";
            await client.query("update app.orders set status = 'out_for_delivery', dispatched_at = now(), updated_at = now() where id = $1", [order.id]);
            break;
          case "fail_delivery":
            requireStatus(order, ["out_for_delivery"], "marked as failed");
            await returnDispatchedStock(client, agency.id, order, principal);
            nextStatus = "delivery_failed"; reason = parsed.data.reason;
            await client.query("update app.orders set status = 'delivery_failed', assigned_delivery_staff_id = null, failure_reason = $2, updated_at = now() where id = $1", [order.id, reason]);
            break;
          case "reschedule":
            requireStatus(order, ["delivery_failed"], "rescheduled");
            await reserveStock(client, agency.id, order, principal, "Inventory reserved for rescheduled delivery");
            nextStatus = "accepted"; reason = "Failed delivery rescheduled";
            await client.query("update app.orders set status = 'accepted', failure_reason = null, accepted_at = now(), updated_at = now() where id = $1", [order.id]);
            break;
          case "deliver": {
            requireStatus(order, ["out_for_delivery"], "delivered");
            if (order.payment_method === "cod" && !parsed.data.cashCollected) throw new HttpError(422, "cash_collection_required", "Confirm cash collection before completing a COD delivery.");
            const items = await orderItems(client, order.id);
            const inventory = await lockedInventory(client, agency.id, items);
            const itemByCode = new Map(items.map((item) => [item.cylinder_code, item]));
            const collectedByType = new Map<string, number>();
            for (const collected of parsed.data.emptiesCollected) {
              const item = itemByCode.get(collected.cylinderTypeCode);
              if (!item) throw new HttpError(422, "invalid_empty_collection", `Empty ${collected.cylinderTypeCode} was not part of this order.`);
              collectedByType.set(item.cylinder_type_id, collected.quantity);
            }
            const totalCollected = [...collectedByType.values()].reduce((sum, quantity) => sum + quantity, 0);
            if (totalCollected > order.outlet_empty_count) throw new HttpError(422, "empty_stock_mismatch", "Collected empties exceed the outlet's recorded empty stock.", { recordedEmptyStock: order.outlet_empty_count, attemptedCollection: totalCollected });
            for (const item of items) {
              const stock = inventory.get(item.cylinder_type_id)!;
              const collected = collectedByType.get(item.cylinder_type_id) ?? 0;
              const accountDelta = item.quantity - collected;
              await client.query(
                `update app.agency_inventory set empty_on_hand = empty_on_hand + $2,
                        with_accounts = greatest(0, with_accounts + $3), updated_by_user_id = $4, updated_at = now()
                  where id = $1`,
                [stock.id, collected, accountDelta, principal.userId],
              );
              await inventoryEvent(client, stock.id, order.id, principal.userId, collected ? "empty_return" : "delivery", { empty: collected, withAccounts: accountDelta }, collected ? "Delivered cylinders and received account empties" : "Delivered cylinders to tenant account");
              if (collected) await client.query("insert into app.order_empty_collections (order_id, cylinder_type_id, quantity) values ($1, $2, $3)", [order.id, item.cylinder_type_id, collected]);
            }
            await client.query("update app.outlets set spare_full_count = spare_full_count + $2, empty_count = empty_count - $3, updated_at = now() where id = $1", [order.outlet_id, items.reduce((sum, item) => sum + item.quantity, 0), totalCollected]);
            const paymentStatus = order.payment_method === "cod" ? "cod_collected" : "credit_due";
            await client.query("update app.orders set status = 'delivered', payment_status = $2, empties_collected = $3, delivered_at = now(), updated_at = now() where id = $1", [order.id, paymentStatus, totalCollected]);
            const invoicePublicId = uuidV7();
            const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
            const credit = order.payment_method === "credit";
            if (credit && !order.net_term_days) throw new HttpError(409, "credit_terms_missing", "Approved credit terms are missing for this order.");
            await client.query(
              `insert into app.invoices (
                 public_id, invoice_number, order_id, tenant_id, commercial_account_id, status,
                 taxable_amount, gst_amount, total_amount, outstanding_amount, issued_at, due_at, paid_at
               ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(),
                         case when $11::int is null then null else now() + make_interval(days => $11) end,
                         case when $6 = 'paid' then now() else null end)`,
              [invoicePublicId, invoiceNumber, order.id, order.tenant_id, order.commercial_account_id,
                credit ? "open" : "paid", order.taxable_amount, order.gst_amount, order.total_amount,
                credit ? order.total_amount : "0.00", credit ? order.net_term_days : null],
            );
            await client.query(
              `insert into app.outbox_events (public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key)
               values ($1, 'invoice.issued', 'invoice', $2, $3::jsonb, $4)`,
              [uuidV7(), invoicePublicId, JSON.stringify({ invoicePublicId, invoiceNumber, orderPublicId: order.public_id, tenantPublicId: order.tenant_public_id, totalAmount: order.total_amount, paymentMethod: order.payment_method }), `invoice-issued:${invoicePublicId}`],
            );
            nextStatus = "delivered"; reason = `Delivery completed with ${totalCollected} empties collected`;
            break;
          }
        }

        await recordStatus(client, order, nextStatus, principal, reason);
        const body = { order: await orderView(client, agency.id, order.public_id) };
        await client.query(
          `insert into app.outbox_events (public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key)
           values ($1, 'order.status_changed', 'order', $2, $3::jsonb, $4)`,
          [uuidV7(), order.public_id, JSON.stringify({ orderPublicId: order.public_id, orderNumber: order.order_number, agencyPublicId: agency.public_id, tenantPublicId: order.tenant_public_id, fromStatus: order.status, toStatus: nextStatus, reason }), `order-status:${order.public_id}:${nextStatus}:${idempotencyKey}`],
        );
        await client.query(
          `insert into app.audit_events (
             public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
             reason, before_values, after_values, request_id, correlation_id, source_ip, user_agent
           ) values ($1, $2, $3, 'order.status_changed', 'order', $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11)`,
          [uuidV7(), principal.userId, actorRoles(principal), order.public_id, reason,
            JSON.stringify({ status: order.status, paymentStatus: order.payment_status }),
            JSON.stringify({ status: nextStatus, action: parsed.data.action }), uuidV7(), uuidV7(), request.ip || null, request.header("user-agent")?.slice(0, 500) ?? null],
        );
        await client.query(
          `update app.idempotency_keys set response_status = 200, response_body = $3::jsonb,
                  completed_at = now(), locked_until = null where scope = $1 and idempotency_key = $2`,
          [scope, idempotencyKey, JSON.stringify(body)],
        );
        return { status: 200, body, replayed: false };
      });
      if (result.replayed) response.setHeader("idempotent-replayed", "true");
      response.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });

  return router;
}
