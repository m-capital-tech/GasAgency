import type pg from "pg";
import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";

const publicIdSchema = z.string().uuid();
const orderStatusSchema = z.enum([
  "pending_payment",
  "payment_failed",
  "placed",
  "accepted",
  "assigned",
  "out_for_delivery",
  "delivery_failed",
  "delivered",
  "rejected",
  "cancelled",
]);
const invoiceStatusSchema = z.enum(["open", "overdue", "paid", "void"]);
const orderListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(512).optional(),
  status: orderStatusSchema.optional(),
});
const invoiceListSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().trim().min(1).max(512).optional(),
  status: invoiceStatusSchema.optional(),
});
const pageCursorSchema = z.object({ at: z.string().datetime(), publicId: z.string().uuid() }).strict();

export interface TenantPageCursor {
  at: string;
  publicId: string;
}

export function encodeTenantPageCursor(cursor: TenantPageCursor): string {
  return Buffer.from(JSON.stringify(pageCursorSchema.parse(cursor)), "utf8").toString("base64url");
}

export function decodeTenantPageCursor(value: string | undefined): TenantPageCursor | null {
  if (!value) return null;
  try {
    return pageCursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
  } catch {
    throw new HttpError(400, "invalid_cursor", "The page cursor is invalid or has expired.");
  }
}

export function effectiveInvoiceStatus(
  status: "open" | "overdue" | "paid" | "void",
  dueAt: Date | null,
  outstandingAmount: string,
  now = new Date(),
): "open" | "overdue" | "paid" | "void" {
  if (status === "open" && dueAt && dueAt.getTime() < now.getTime() && Number(outstandingAmount) > 0) return "overdue";
  return status;
}

interface ActiveTenantRow {
  tenant_id: string;
  tenant_public_id: string;
  tenant_display_name: string;
  tenant_gstin: string;
  commercial_account_id: string;
  payment_mode: "prepaid" | "credit";
  credit_status: "approved" | "suspended" | "closed" | null;
  credit_limit: string | null;
  net_term_days: number | null;
}

async function activeTenant(
  pool: pg.Pool,
  userId: string,
  tenantPublicId: string,
): Promise<ActiveTenantRow> {
  const row = (
    await pool.query<ActiveTenantRow>(
      `select tenant.id::text as tenant_id,
              tenant.public_id::text as tenant_public_id,
              tenant.display_name as tenant_display_name,
              tenant.gstin as tenant_gstin,
              account.id::text as commercial_account_id,
              account.payment_mode,
              credit.status as credit_status,
              credit.credit_limit::text,
              credit.net_term_days
         from app.tenant_memberships membership
         join app.tenants tenant on tenant.id = membership.tenant_id
         join app.agency_assignments assignment
           on assignment.tenant_id = tenant.id
          and assignment.status = 'active'
          and assignment.ends_at is null
         join app.agencies agency
           on agency.id = assignment.agency_id
          and agency.status = 'approved'
         join app.commercial_accounts account
           on account.tenant_id = tenant.id
          and account.agency_id = agency.id
          and account.status = 'open'
         left join app.credit_accounts credit on credit.commercial_account_id = account.id
        where membership.user_id = $1
          and membership.status = 'active'
          and tenant.public_id = $2
          and tenant.status = 'active'`,
      [userId, tenantPublicId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "tenant_not_found", "The tenant or its serving account is unavailable.");
  return row;
}

interface OrderListRow {
  public_id: string;
  order_number: string;
  status: z.infer<typeof orderStatusSchema>;
  payment_method: string;
  payment_status: string;
  delivery_slot: string;
  requested_delivery_date: string | null;
  total_amount: string;
  placed_at: Date | null;
  delivered_at: Date | null;
  created_at: Date;
  updated_at: Date;
  outlet_public_id: string;
  outlet_label: string;
  agency_public_id: string;
  agency_display_name: string;
  invoice_public_id: string | null;
  invoice_number: string | null;
  invoice_status: "open" | "overdue" | "paid" | "void" | null;
  invoice_outstanding_amount: string | null;
  invoice_due_at: Date | null;
  cylinder_count: string;
  items: Array<{
    cylinderTypeCode: string;
    displayName: string;
    quantity: number;
    unitPrice: string;
    lineSubtotal: string;
  }>;
}

function orderListBody(row: OrderListRow) {
  return {
    publicId: row.public_id,
    orderNumber: row.order_number,
    status: row.status,
    payment: { method: row.payment_method, status: row.payment_status },
    deliverySlot: row.delivery_slot,
    requestedDeliveryDate: row.requested_delivery_date,
    totalAmount: row.total_amount,
    currency: "INR" as const,
    placedAt: row.placed_at?.toISOString() ?? null,
    deliveredAt: row.delivered_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    outlet: { publicId: row.outlet_public_id, label: row.outlet_label },
    agency: { publicId: row.agency_public_id, displayName: row.agency_display_name },
    cylinderCount: Number(row.cylinder_count),
    items: row.items ?? [],
    invoice: row.invoice_public_id && row.invoice_status
      ? {
          publicId: row.invoice_public_id,
          invoiceNumber: row.invoice_number,
          status: effectiveInvoiceStatus(row.invoice_status, row.invoice_due_at, row.invoice_outstanding_amount ?? "0"),
          outstandingAmount: row.invoice_outstanding_amount,
          dueAt: row.invoice_due_at?.toISOString() ?? null,
        }
      : null,
  };
}

const orderSelectColumns = `select order_row.public_id::text,
                                   order_row.order_number,
                                   order_row.status,
                                   order_row.payment_method,
                                   order_row.payment_status,
                                   order_row.delivery_slot,
                                   order_row.requested_delivery_date::text,
                                   order_row.total_amount::text,
                                   order_row.placed_at,
                                   order_row.delivered_at,
                                   order_row.created_at,
                                   order_row.updated_at,
                                   outlet.public_id::text as outlet_public_id,
                                   outlet.label as outlet_label,
                                   agency.public_id::text as agency_public_id,
                                   agency.display_name as agency_display_name,
                                   invoice.public_id::text as invoice_public_id,
                                   invoice.invoice_number,
                                   invoice.status as invoice_status,
                                   invoice.outstanding_amount::text as invoice_outstanding_amount,
                                   invoice.due_at as invoice_due_at,
                                   coalesce(items.cylinder_count, 0)::text as cylinder_count,
                                   coalesce(items.value, '[]'::jsonb) as items`;

const orderFrom = `from app.orders order_row
                   join app.outlets outlet on outlet.id = order_row.outlet_id
                   join app.agencies agency on agency.id = order_row.agency_id
                   left join app.invoices invoice on invoice.order_id = order_row.id
                   left join lateral (
                     select sum(item.quantity) as cylinder_count,
                            jsonb_agg(jsonb_build_object(
                              'cylinderTypeCode', item.cylinder_code,
                              'displayName', item.cylinder_display_name,
                              'quantity', item.quantity,
                              'unitPrice', item.unit_price::text,
                              'lineSubtotal', item.line_subtotal::text
                            ) order by item.cylinder_display_name, item.cylinder_code) as value
                       from app.order_items item
                      where item.order_id = order_row.id
                   ) items on true`;

interface InvoiceListRow {
  public_id: string;
  invoice_number: string;
  status: "open" | "overdue" | "paid" | "void";
  taxable_amount: string;
  gst_amount: string;
  total_amount: string;
  outstanding_amount: string;
  issued_at: Date;
  due_at: Date | null;
  paid_at: Date | null;
  order_public_id: string;
  order_number: string;
  outlet_label: string;
}

function invoiceListBody(row: InvoiceListRow) {
  return {
    publicId: row.public_id,
    invoiceNumber: row.invoice_number,
    status: effectiveInvoiceStatus(row.status, row.due_at, row.outstanding_amount),
    taxableAmount: row.taxable_amount,
    gstAmount: row.gst_amount,
    totalAmount: row.total_amount,
    outstandingAmount: row.outstanding_amount,
    currency: "INR" as const,
    issuedAt: row.issued_at.toISOString(),
    dueAt: row.due_at?.toISOString() ?? null,
    paidAt: row.paid_at?.toISOString() ?? null,
    order: { publicId: row.order_public_id, orderNumber: row.order_number },
    outletLabel: row.outlet_label,
  };
}

export function tenantAccountRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.get("/tenants/:tenantPublicId/orders", async (request, response, next) => {
    try {
      const tenantPublicId = publicIdSchema.safeParse(request.params.tenantPublicId);
      const query = orderListSchema.safeParse(request.query);
      if (!tenantPublicId.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      if (!query.success) throw new HttpError(400, "invalid_request", "The order-list filters are invalid.", query.error.flatten());
      const principal = authenticatedPrincipal(response);
      const tenant = await activeTenant(options.pool, principal.userId, tenantPublicId.data);
      const cursor = decodeTenantPageCursor(query.data.cursor);
      const rows = await options.pool.query<OrderListRow>(
        `${orderSelectColumns}
          ${orderFrom}
          where order_row.tenant_id = $1
            and ($2::text is null or order_row.status = $2)
            and ($3::timestamptz is null or (order_row.created_at, order_row.public_id) < ($3::timestamptz, $4::uuid))
          order by order_row.created_at desc, order_row.public_id desc
          limit $5`,
        [tenant.tenant_id, query.data.status ?? null, cursor?.at ?? null, cursor?.publicId ?? null, query.data.limit + 1],
      );
      const hasMore = rows.rows.length > query.data.limit;
      const page = hasMore ? rows.rows.slice(0, query.data.limit) : rows.rows;
      const last = page.at(-1);
      response.status(200).json({
        orders: page.map(orderListBody),
        nextCursor: hasMore && last ? encodeTenantPageCursor({ at: last.created_at.toISOString(), publicId: last.public_id }) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/tenants/:tenantPublicId/orders/:orderPublicId", async (request, response, next) => {
    try {
      const tenantPublicId = publicIdSchema.safeParse(request.params.tenantPublicId);
      const orderPublicId = publicIdSchema.safeParse(request.params.orderPublicId);
      if (!tenantPublicId.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      if (!orderPublicId.success) throw new HttpError(400, "invalid_order_id", "The order identifier is invalid.");
      const principal = authenticatedPrincipal(response);
      const tenant = await activeTenant(options.pool, principal.userId, tenantPublicId.data);
      const row = (
        await options.pool.query<OrderListRow & {
          subtotal: string;
          delivery_fee: string;
          slot_surcharge: string;
          taxable_amount: string;
          gst_rate: string;
          gst_amount: string;
          empties_expected: number;
          empties_collected: number;
          delivery_instructions: string | null;
          accepted_at: Date | null;
          assigned_at: Date | null;
          dispatched_at: Date | null;
          cancelled_at: Date | null;
          failure_reason: string | null;
          outlet_address_line_1: string;
          outlet_address_line_2: string | null;
          outlet_city: string;
          outlet_state_code: string;
          outlet_pincode: string;
          agency_phone_e164: string;
          delivery_staff_name: string | null;
          delivery_vehicle_type: string | null;
          delivery_vehicle_number: string | null;
          invoice_taxable_amount: string | null;
          invoice_gst_amount: string | null;
          invoice_total_amount: string | null;
          invoice_issued_at: Date | null;
          invoice_paid_at: Date | null;
        }>(
          `${orderSelectColumns},
                  order_row.subtotal::text,
                  order_row.delivery_fee::text,
                  order_row.slot_surcharge::text,
                  order_row.taxable_amount::text,
                  order_row.gst_rate::text,
                  order_row.gst_amount::text,
                  order_row.empties_expected,
                  order_row.empties_collected,
                  order_row.delivery_instructions,
                  order_row.accepted_at,
                  order_row.assigned_at,
                  order_row.dispatched_at,
                  order_row.cancelled_at,
                  order_row.failure_reason,
                  outlet.address_line_1 as outlet_address_line_1,
                  outlet.address_line_2 as outlet_address_line_2,
                  outlet.city as outlet_city,
                  outlet.state_code as outlet_state_code,
                  outlet.pincode as outlet_pincode,
                  agency.phone_e164 as agency_phone_e164,
                  staff_user.full_name as delivery_staff_name,
                  staff.vehicle_type as delivery_vehicle_type,
                  staff.vehicle_number as delivery_vehicle_number,
                  invoice.taxable_amount::text as invoice_taxable_amount,
                  invoice.gst_amount::text as invoice_gst_amount,
                  invoice.total_amount::text as invoice_total_amount,
                  invoice.issued_at as invoice_issued_at,
                  invoice.paid_at as invoice_paid_at
             ${orderFrom}
             left join app.delivery_staff staff on staff.id = order_row.assigned_delivery_staff_id
             left join app.users staff_user on staff_user.id = staff.user_id
            where order_row.tenant_id = $1 and order_row.public_id = $2`,
          [tenant.tenant_id, orderPublicId.data],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "order_not_found", "The order was not found.");
      const timeline = await options.pool.query<{
        public_id: string;
        from_status: string | null;
        to_status: string;
        reason: string | null;
        occurred_at: Date;
      }>(
        `select event.public_id::text, event.from_status, event.to_status,
                case when event.to_status in ('delivery_failed', 'rejected', 'cancelled') then event.reason else null end as reason,
                event.occurred_at
           from app.order_status_events event
           join app.orders order_row on order_row.id = event.order_id
          where order_row.tenant_id = $1 and order_row.public_id = $2
          order by event.occurred_at, event.id`,
        [tenant.tenant_id, orderPublicId.data],
      );
      response.status(200).json({
        order: {
          ...orderListBody(row),
          subtotal: row.subtotal,
          deliveryFee: row.delivery_fee,
          slotSurcharge: row.slot_surcharge,
          taxableAmount: row.taxable_amount,
          gstRate: Number(row.gst_rate),
          gstAmount: row.gst_amount,
          emptiesExpected: row.empties_expected,
          emptiesCollected: row.empties_collected,
          deliveryInstructions: row.delivery_instructions,
          acceptedAt: row.accepted_at?.toISOString() ?? null,
          assignedAt: row.assigned_at?.toISOString() ?? null,
          dispatchedAt: row.dispatched_at?.toISOString() ?? null,
          cancelledAt: row.cancelled_at?.toISOString() ?? null,
          failureReason: row.failure_reason,
          outlet: {
            publicId: row.outlet_public_id,
            label: row.outlet_label,
            addressLine1: row.outlet_address_line_1,
            addressLine2: row.outlet_address_line_2,
            city: row.outlet_city,
            stateCode: row.outlet_state_code,
            pincode: row.outlet_pincode,
          },
          agency: {
            publicId: row.agency_public_id,
            displayName: row.agency_display_name,
            phoneE164: row.agency_phone_e164,
          },
          deliveryPartner: row.delivery_staff_name
            ? { name: row.delivery_staff_name, vehicleType: row.delivery_vehicle_type, vehicleNumber: row.delivery_vehicle_number }
            : null,
          invoice: row.invoice_public_id && row.invoice_status
            ? {
                publicId: row.invoice_public_id,
                invoiceNumber: row.invoice_number,
                status: effectiveInvoiceStatus(row.invoice_status, row.invoice_due_at, row.invoice_outstanding_amount ?? "0"),
                taxableAmount: row.invoice_taxable_amount,
                gstAmount: row.invoice_gst_amount,
                totalAmount: row.invoice_total_amount,
                outstandingAmount: row.invoice_outstanding_amount,
                issuedAt: row.invoice_issued_at?.toISOString() ?? null,
                dueAt: row.invoice_due_at?.toISOString() ?? null,
                paidAt: row.invoice_paid_at?.toISOString() ?? null,
              }
            : null,
          timeline: timeline.rows.map((event) => ({
            publicId: event.public_id,
            fromStatus: event.from_status,
            toStatus: event.to_status,
            note: event.reason,
            occurredAt: event.occurred_at.toISOString(),
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/tenants/:tenantPublicId/billing", async (request, response, next) => {
    try {
      const tenantPublicId = publicIdSchema.safeParse(request.params.tenantPublicId);
      const query = invoiceListSchema.safeParse(request.query);
      if (!tenantPublicId.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      if (!query.success) throw new HttpError(400, "invalid_request", "The billing filters are invalid.", query.error.flatten());
      const principal = authenticatedPrincipal(response);
      const tenant = await activeTenant(options.pool, principal.userId, tenantPublicId.data);
      const cursor = decodeTenantPageCursor(query.data.cursor);
      const [summary, rows] = await Promise.all([
        options.pool.query<{
          outstanding_amount: string;
          overdue_amount: string;
          paid_last_30_days: string;
          current_account_outstanding: string;
          pending_credit_orders: string;
        }>(
          `select
             coalesce(sum(invoice.outstanding_amount) filter (where invoice.status in ('open', 'overdue')), 0)::text as outstanding_amount,
             coalesce(sum(invoice.outstanding_amount) filter (
               where invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0
                 and (invoice.status = 'overdue' or invoice.due_at < now())
             ), 0)::text as overdue_amount,
             coalesce(sum(invoice.total_amount) filter (where invoice.status = 'paid' and invoice.paid_at >= now() - interval '30 days'), 0)::text as paid_last_30_days,
             coalesce((select sum(account_invoice.outstanding_amount)
                         from app.invoices account_invoice
                        where account_invoice.commercial_account_id = $2
                          and account_invoice.status in ('open', 'overdue')), 0)::text as current_account_outstanding,
             coalesce((select sum(order_row.total_amount)
                         from app.orders order_row
                        where order_row.commercial_account_id = $2
                          and order_row.payment_method = 'credit'
                          and order_row.status not in ('delivered', 'rejected', 'cancelled')), 0)::text as pending_credit_orders
             from app.invoices invoice
            where invoice.tenant_id = $1`,
          [tenant.tenant_id, tenant.commercial_account_id],
        ),
        options.pool.query<InvoiceListRow>(
          `select invoice.public_id::text, invoice.invoice_number, invoice.status,
                  invoice.taxable_amount::text, invoice.gst_amount::text,
                  invoice.total_amount::text, invoice.outstanding_amount::text,
                  invoice.issued_at, invoice.due_at, invoice.paid_at,
                  order_row.public_id::text as order_public_id, order_row.order_number,
                  outlet.label as outlet_label
             from app.invoices invoice
             join app.orders order_row on order_row.id = invoice.order_id
             join app.outlets outlet on outlet.id = order_row.outlet_id
            where invoice.tenant_id = $1
              and (
                $2::text is null
                or ($2 = 'overdue' and invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0 and (invoice.status = 'overdue' or invoice.due_at < now()))
                or ($2 = 'open' and invoice.status = 'open' and (invoice.due_at is null or invoice.due_at >= now()))
                or ($2 in ('paid', 'void') and invoice.status = $2)
              )
              and ($3::timestamptz is null or (invoice.issued_at, invoice.public_id) < ($3::timestamptz, $4::uuid))
            order by invoice.issued_at desc, invoice.public_id desc
            limit $5`,
          [tenant.tenant_id, query.data.status ?? null, cursor?.at ?? null, cursor?.publicId ?? null, query.data.limit + 1],
        ),
      ]);
      const totals = summary.rows[0]!;
      const limitAmount = tenant.credit_limit ?? "0.00";
      const usedAmount = Number(totals.current_account_outstanding) + Number(totals.pending_credit_orders);
      const hasMore = rows.rows.length > query.data.limit;
      const page = hasMore ? rows.rows.slice(0, query.data.limit) : rows.rows;
      const last = page.at(-1);
      response.status(200).json({
        tenant: { publicId: tenant.tenant_public_id, displayName: tenant.tenant_display_name, gstin: tenant.tenant_gstin },
        account: {
          paymentMode: tenant.payment_mode,
          credit: tenant.credit_limit
            ? {
                status: tenant.credit_status,
                limit: Number(limitAmount).toFixed(2),
                used: usedAmount.toFixed(2),
                available: Math.max(0, Number(limitAmount) - usedAmount).toFixed(2),
                netTermDays: tenant.net_term_days,
              }
            : null,
        },
        summary: {
          outstandingAmount: Number(totals.outstanding_amount).toFixed(2),
          overdueAmount: Number(totals.overdue_amount).toFixed(2),
          paidLast30Days: Number(totals.paid_last_30_days).toFixed(2),
          currency: "INR",
        },
        invoices: page.map(invoiceListBody),
        nextCursor: hasMore && last ? encodeTenantPageCursor({ at: last.issued_at.toISOString(), publicId: last.public_id }) : null,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/tenants/:tenantPublicId/invoices/:invoicePublicId", async (request, response, next) => {
    try {
      const tenantPublicId = publicIdSchema.safeParse(request.params.tenantPublicId);
      const invoicePublicId = publicIdSchema.safeParse(request.params.invoicePublicId);
      if (!tenantPublicId.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      if (!invoicePublicId.success) throw new HttpError(400, "invalid_invoice_id", "The invoice identifier is invalid.");
      const principal = authenticatedPrincipal(response);
      const tenant = await activeTenant(options.pool, principal.userId, tenantPublicId.data);
      const row = (
        await options.pool.query<InvoiceListRow & {
          agency_display_name: string;
          agency_gstin: string;
          agency_city: string;
          agency_state_code: string;
          tenant_legal_name: string;
          address_line_1: string;
          address_line_2: string | null;
          city: string;
          state_code: string;
          pincode: string;
          items: Array<{ cylinderTypeCode: string; displayName: string; quantity: number; unitPrice: string; lineSubtotal: string }>;
          payments: Array<{
            publicId: string;
            amount: string;
            paymentMethod: string;
            reference: string | null;
            receivedAt: string;
          }>;
        }>(
          `select invoice.public_id::text, invoice.invoice_number, invoice.status,
                  invoice.taxable_amount::text, invoice.gst_amount::text,
                  invoice.total_amount::text, invoice.outstanding_amount::text,
                  invoice.issued_at, invoice.due_at, invoice.paid_at,
                  order_row.public_id::text as order_public_id, order_row.order_number,
                  outlet.label as outlet_label, outlet.address_line_1, outlet.address_line_2,
                  outlet.city, outlet.state_code, outlet.pincode,
                  tenant.legal_name as tenant_legal_name,
                  agency.display_name as agency_display_name, agency.gstin as agency_gstin,
                  agency.city as agency_city, agency.state_code as agency_state_code,
                  coalesce(items.value, '[]'::jsonb) as items,
                  coalesce(payment_rows.value, '[]'::jsonb) as payments
             from app.invoices invoice
             join app.orders order_row on order_row.id = invoice.order_id
             join app.outlets outlet on outlet.id = order_row.outlet_id
             join app.tenants tenant on tenant.id = invoice.tenant_id
             join app.agencies agency on agency.id = order_row.agency_id
             left join lateral (
               select jsonb_agg(jsonb_build_object(
                 'cylinderTypeCode', item.cylinder_code,
                 'displayName', item.cylinder_display_name,
                 'quantity', item.quantity,
                 'unitPrice', item.unit_price::text,
                 'lineSubtotal', item.line_subtotal::text
               ) order by item.cylinder_display_name, item.cylinder_code) as value
                 from app.order_items item
                where item.order_id = order_row.id
             ) items on true
             left join lateral (
               select jsonb_agg(jsonb_build_object(
                 'publicId', payment.public_id::text,
                 'amount', allocation.amount::text,
                 'paymentMethod', payment.payment_method,
                 'reference', payment.reference,
                 'receivedAt', payment.received_at
               ) order by payment.received_at desc, payment.id desc) as value
                 from app.payment_allocations allocation
                 join app.payment_collections payment on payment.id = allocation.payment_collection_id
                where allocation.invoice_id = invoice.id
             ) payment_rows on true
            where invoice.tenant_id = $1 and invoice.public_id = $2`,
          [tenant.tenant_id, invoicePublicId.data],
        )
      ).rows[0];
      if (!row) throw new HttpError(404, "invoice_not_found", "The invoice was not found.");
      response.status(200).json({
        invoice: {
          ...invoiceListBody(row),
          tenant: {
            legalName: row.tenant_legal_name,
            gstin: tenant.tenant_gstin,
            outletLabel: row.outlet_label,
            addressLine1: row.address_line_1,
            addressLine2: row.address_line_2,
            city: row.city,
            stateCode: row.state_code,
            pincode: row.pincode,
          },
          agency: {
            displayName: row.agency_display_name,
            gstin: row.agency_gstin,
            city: row.agency_city,
            stateCode: row.agency_state_code,
          },
          items: row.items ?? [],
          payments: row.payments ?? [],
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
