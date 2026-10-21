import { createHash, randomUUID } from "node:crypto";
import type pg from "pg";
import { Router } from "express";
import { withTransaction } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { assertPlatformWorkflowEnabled, platformSettingValue } from "../domain/platform-settings";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";

const tenantId = z.string().uuid();
const outletId = z.string().uuid();
const safeIdempotencyKey = /^[A-Za-z0-9._:-]{8,128}$/;
const quoteRequestSchema = z.object({
  outletPublicId: outletId,
  deliverySlot: z.enum(["before_opening", "standard", "evening", "express"]),
  paymentMethod: z.enum(["cod", "credit"]),
  items: z.array(z.object({
    cylinderTypeCode: z.string().trim().min(1).max(64),
    quantity: z.number().int().positive().max(500),
  })).min(1).max(10).refine(
    (items) => new Set(items.map((item) => item.cylinderTypeCode)).size === items.length,
    "cylinder types must be unique",
  ),
}).strict();
const orderRequestSchema = z.object({
  quotePublicId: z.string().uuid(),
  requestedDeliveryDate: z.string().date().optional(),
  emptiesExpected: z.number().int().min(0).max(10_000).default(0),
  deliveryInstructions: z.string().trim().min(3).max(1_000).optional(),
}).strict();

type PaymentMethod = "cod" | "credit";
type DeliverySlot = "before_opening" | "standard" | "evening" | "express";

interface TenantContextRow {
  tenant_id: string;
  tenant_public_id: string;
  tenant_display_name: string;
  tenant_gstin: string;
  outlet_id: string;
  outlet_public_id: string;
  outlet_label: string;
  agency_id: string;
  agency_public_id: string;
  agency_display_name: string;
  cod_enabled: boolean;
  credit_enabled: boolean;
  max_cylinders_per_order: number;
  delivery_fee: string;
  gst_rate: string;
  commercial_account_id: string;
  commercial_account_public_id: string;
  payment_mode: "prepaid" | "credit";
  credit_account_id: string | null;
  credit_status: "approved" | "suspended" | "closed" | null;
  credit_limit: string | null;
  net_term_days: number | null;
}

interface PriceRow {
  cylinder_type_id: string;
  code: string;
  display_name: string;
  weight_kg: string;
  base_unit_price: string;
  negotiated_unit_price: string | null;
  slab_unit_price: string | null;
}

interface QuoteLine {
  cylinderTypeId: string;
  cylinderTypeCode: string;
  displayName: string;
  weightKg: number;
  quantity: number;
  baseUnitPricePaise: number;
  effectiveUnitPricePaise: number;
  priceSource: "base" | "slab" | "negotiated";
  lineSubtotalPaise: number;
}

interface CalculatedQuote {
  deliverySlot: DeliverySlot;
  paymentMethod: PaymentMethod;
  subtotalPaise: number;
  deliveryFeePaise: number;
  slotSurchargePaise: number;
  taxableAmountPaise: number;
  gstRate: number;
  gstAmountPaise: number;
  totalAmountPaise: number;
  items: QuoteLine[];
}

function toPaise(value: string | number): number {
  const paise = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(paise)) throw new Error("money value exceeds safe range");
  return paise;
}

function money(paise: number): string {
  return (paise / 100).toFixed(2);
}

function quoteSignature(context: TenantContextRow, quote: CalculatedQuote): Buffer {
  return createHash("sha256").update(JSON.stringify({
    tenantId: context.tenant_id,
    outletId: context.outlet_id,
    agencyId: context.agency_id,
    commercialAccountId: context.commercial_account_id,
    deliverySlot: quote.deliverySlot,
    paymentMethod: quote.paymentMethod,
    subtotalPaise: quote.subtotalPaise,
    deliveryFeePaise: quote.deliveryFeePaise,
    slotSurchargePaise: quote.slotSurchargePaise,
    taxableAmountPaise: quote.taxableAmountPaise,
    gstRate: quote.gstRate,
    gstAmountPaise: quote.gstAmountPaise,
    totalAmountPaise: quote.totalAmountPaise,
    items: quote.items.map((item) => ({
      cylinderTypeId: item.cylinderTypeId,
      quantity: item.quantity,
      baseUnitPricePaise: item.baseUnitPricePaise,
      effectiveUnitPricePaise: item.effectiveUnitPricePaise,
      priceSource: item.priceSource,
      lineSubtotalPaise: item.lineSubtotalPaise,
    })),
  }), "utf8").digest();
}

async function tenantContext(
  client: pg.Pool | pg.PoolClient,
  userId: string,
  tenantPublicId: string,
  outletPublicId: string,
  lockAccount = false,
): Promise<TenantContextRow> {
  const row = (
    await client.query<TenantContextRow>(
      `select tenant.id::text as tenant_id,
              tenant.public_id::text as tenant_public_id,
              tenant.display_name as tenant_display_name,
              tenant.gstin as tenant_gstin,
              outlet.id::text as outlet_id,
              outlet.public_id::text as outlet_public_id,
              outlet.label as outlet_label,
              agency.id::text as agency_id,
              agency.public_id::text as agency_public_id,
              agency.display_name as agency_display_name,
              agency.cod_enabled,
              agency.credit_enabled,
              agency.max_cylinders_per_order,
              agency.delivery_fee::text,
              agency.gst_rate::text,
              account.id::text as commercial_account_id,
              account.public_id::text as commercial_account_public_id,
              account.payment_mode,
              credit.id::text as credit_account_id,
              credit.status as credit_status,
              credit.credit_limit::text,
              credit.net_term_days
         from app.tenant_memberships membership
         join app.tenants tenant on tenant.id = membership.tenant_id
         join app.outlets outlet on outlet.tenant_id = tenant.id
         join app.agency_assignments assignment
           on assignment.tenant_id = tenant.id
          and assignment.status = 'active'
          and assignment.ends_at is null
         join app.agencies agency on agency.id = assignment.agency_id
         join app.commercial_accounts account
           on account.tenant_id = tenant.id
          and account.agency_id = agency.id
          and account.status = 'open'
         left join app.credit_accounts credit on credit.commercial_account_id = account.id
        where membership.user_id = $1
          and membership.status = 'active'
          and tenant.public_id = $2
          and tenant.status = 'active'
          and outlet.public_id = $3
          and outlet.status = 'active'
          and agency.status = 'approved'
        ${lockAccount ? "for update of account" : ""}`,
      [userId, tenantPublicId, outletPublicId],
    )
  ).rows[0];
  if (!row) throw new HttpError(404, "tenant_ordering_context_not_found", "This tenant, outlet, or serving account is unavailable.");
  if (lockAccount && row.credit_account_id) {
    await client.query("select id from app.credit_accounts where id = $1 for update", [row.credit_account_id]);
  }
  return row;
}

async function calculateQuote(
  client: pg.Pool | pg.PoolClient,
  context: TenantContextRow,
  request: z.infer<typeof quoteRequestSchema>,
): Promise<CalculatedQuote> {
  const quantity = request.items.reduce((total, item) => total + item.quantity, 0);
  if (quantity > context.max_cylinders_per_order) {
    throw new HttpError(422, "order_quantity_exceeded", `This agency allows at most ${context.max_cylinders_per_order} cylinders per order.`);
  }

  const slot = (
    await client.query<{ surcharge: string; max_cylinders: number | null }>(
      `select surcharge::text, max_cylinders
         from app.agency_delivery_slots
        where agency_id = $1 and slot_code = $2 and active`,
      [context.agency_id, request.deliverySlot],
    )
  ).rows[0];
  if (!slot) throw new HttpError(422, "delivery_slot_unavailable", "The selected delivery slot is unavailable.");
  if (slot.max_cylinders !== null && quantity > slot.max_cylinders) {
    throw new HttpError(422, "delivery_slot_capacity_exceeded", `This delivery slot allows at most ${slot.max_cylinders} cylinders per order.`);
  }
  if (request.paymentMethod === "cod" && !context.cod_enabled) {
    throw new HttpError(422, "cod_disabled", "Cash on delivery is disabled by the serving agency.");
  }
  if (request.paymentMethod === "credit" && (!context.credit_enabled || context.payment_mode !== "credit" || context.credit_status !== "approved")) {
    throw new HttpError(422, "credit_unavailable", "Credit is not active for this tenant and serving agency.");
  }

  const items: QuoteLine[] = [];
  for (const requested of [...request.items].sort((left, right) => left.cylinderTypeCode.localeCompare(right.cylinderTypeCode))) {
    const price = (
      await client.query<PriceRow>(
        `select cylinder.id::text as cylinder_type_id,
                cylinder.code,
                cylinder.display_name,
                cylinder.weight_kg::text,
                price.base_unit_price::text,
                negotiated.unit_price::text as negotiated_unit_price,
                slab.unit_price::text as slab_unit_price
           from app.cylinder_types cylinder
           join app.agency_prices price
             on price.cylinder_type_id = cylinder.id
            and price.agency_id = $1
            and price.active
           left join app.commercial_account_prices negotiated
             on negotiated.commercial_account_id = $2
            and negotiated.cylinder_type_id = cylinder.id
            and negotiated.active
           left join lateral (
             select candidate.unit_price
               from app.agency_price_slabs candidate
              where candidate.agency_price_id = price.id
                and candidate.min_quantity <= $4
              order by candidate.min_quantity desc
              limit 1
           ) slab on true
          where cylinder.code = $3 and cylinder.active`,
        [context.agency_id, context.commercial_account_id, requested.cylinderTypeCode, requested.quantity],
      )
    ).rows[0];
    if (!price) throw new HttpError(422, "cylinder_type_unavailable", `Cylinder type ${requested.cylinderTypeCode} is not priced by the serving agency.`);

    const base = toPaise(price.base_unit_price);
    const slab = price.slab_unit_price === null ? null : toPaise(price.slab_unit_price);
    const negotiated = price.negotiated_unit_price === null ? null : toPaise(price.negotiated_unit_price);
    let effective = base;
    let source: QuoteLine["priceSource"] = "base";
    if (slab !== null && slab < effective) {
      effective = slab;
      source = "slab";
    }
    if (negotiated !== null && negotiated < effective) {
      effective = negotiated;
      source = "negotiated";
    }
    items.push({
      cylinderTypeId: price.cylinder_type_id,
      cylinderTypeCode: price.code,
      displayName: price.display_name,
      weightKg: Number(price.weight_kg),
      quantity: requested.quantity,
      baseUnitPricePaise: base,
      effectiveUnitPricePaise: effective,
      priceSource: source,
      lineSubtotalPaise: effective * requested.quantity,
    });
  }

  const subtotalPaise = items.reduce((total, item) => total + item.lineSubtotalPaise, 0);
  const deliveryFeePaise = toPaise(context.delivery_fee);
  const slotSurchargePaise = toPaise(slot.surcharge);
  const taxableAmountPaise = subtotalPaise + deliveryFeePaise + slotSurchargePaise;
  const gstRate = Number(context.gst_rate);
  const gstAmountPaise = Math.round(taxableAmountPaise * gstRate / 100);
  return {
    deliverySlot: request.deliverySlot,
    paymentMethod: request.paymentMethod,
    subtotalPaise,
    deliveryFeePaise,
    slotSurchargePaise,
    taxableAmountPaise,
    gstRate,
    gstAmountPaise,
    totalAmountPaise: taxableAmountPaise + gstAmountPaise,
    items,
  };
}

interface CreditExposure {
  pending_orders: string;
  outstanding_invoices: string;
  overdue_invoices: string;
}

async function creditSnapshot(client: pg.Pool | pg.PoolClient, context: TenantContextRow, nextOrderPaise = 0) {
  if (!context.credit_account_id || !context.credit_limit) return null;
  const exposure = (
    await client.query<CreditExposure>(
      `select
         coalesce((select sum(total_amount) from app.orders
                    where commercial_account_id = $1 and payment_method = 'credit'
                      and status not in ('delivered', 'rejected', 'cancelled')), 0)::text as pending_orders,
         coalesce((select sum(outstanding_amount) from app.invoices
                    where commercial_account_id = $1 and status in ('open', 'overdue')), 0)::text as outstanding_invoices,
         (select count(*) from app.invoices
           where commercial_account_id = $1 and status in ('open', 'overdue')
             and outstanding_amount > 0 and (status = 'overdue' or due_at < now()))::text as overdue_invoices`,
      [context.commercial_account_id],
    )
  ).rows[0]!;
  const limitPaise = toPaise(context.credit_limit);
  const usedPaise = toPaise(exposure.pending_orders) + toPaise(exposure.outstanding_invoices);
  const overdue = Number(exposure.overdue_invoices) > 0;
  return {
    status: context.credit_status,
    limit: money(limitPaise),
    used: money(usedPaise),
    available: money(Math.max(0, limitPaise - usedPaise)),
    netTermDays: context.net_term_days,
    overdue,
    eligible: context.credit_enabled && context.credit_status === "approved" && !overdue && usedPaise + nextOrderPaise <= limitPaise,
  };
}

function quoteBody(publicId: string, expiresAt: Date, quote: CalculatedQuote, credit: Awaited<ReturnType<typeof creditSnapshot>>) {
  return {
    publicId,
    expiresAt: expiresAt.toISOString(),
    currency: "INR" as const,
    deliverySlot: quote.deliverySlot,
    paymentMethod: quote.paymentMethod,
    items: quote.items.map((item) => ({
      cylinderTypeCode: item.cylinderTypeCode,
      displayName: item.displayName,
      weightKg: item.weightKg,
      quantity: item.quantity,
      unitPrice: money(item.effectiveUnitPricePaise),
      priceSource: item.priceSource,
      lineSubtotal: money(item.lineSubtotalPaise),
    })),
    subtotal: money(quote.subtotalPaise),
    deliveryFee: money(quote.deliveryFeePaise),
    slotSurcharge: money(quote.slotSurchargePaise),
    taxableAmount: money(quote.taxableAmountPaise),
    gstRate: quote.gstRate,
    gstAmount: money(quote.gstAmountPaise),
    totalAmount: money(quote.totalAmountPaise),
    credit,
  };
}

export function tenantOrdersRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.get("/tenants/:tenantPublicId/home", async (request, response, next) => {
    try {
      const parsedTenant = tenantId.safeParse(request.params.tenantPublicId);
      if (!parsedTenant.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      const principal = authenticatedPrincipal(response);
      const base = (
        await options.pool.query<{
          tenant_id: string; tenant_public_id: string; display_name: string; gstin: string;
          agency_id: string; agency_public_id: string; agency_name: string; account_id: string;
          cod_enabled: boolean; credit_enabled: boolean; payment_mode: "prepaid" | "credit";
          credit_account_id: string | null; credit_status: TenantContextRow["credit_status"];
          credit_limit: string | null; net_term_days: number | null;
        }>(
          `select tenant.id::text as tenant_id, tenant.public_id::text as tenant_public_id,
                  tenant.display_name, tenant.gstin,
                  agency.id::text as agency_id, agency.public_id::text as agency_public_id,
                  agency.display_name as agency_name, account.id::text as account_id,
                  agency.cod_enabled, agency.credit_enabled, account.payment_mode,
                  credit.id::text as credit_account_id, credit.status as credit_status,
                  credit.credit_limit::text, credit.net_term_days
             from app.tenant_memberships membership
             join app.tenants tenant on tenant.id = membership.tenant_id
             join app.agency_assignments assignment on assignment.tenant_id = tenant.id and assignment.status = 'active' and assignment.ends_at is null
             join app.agencies agency on agency.id = assignment.agency_id and agency.status = 'approved'
             join app.commercial_accounts account on account.tenant_id = tenant.id and account.agency_id = agency.id and account.status = 'open'
             left join app.credit_accounts credit on credit.commercial_account_id = account.id
            where membership.user_id = $1 and membership.status = 'active'
              and tenant.public_id = $2 and tenant.status = 'active'`,
          [principal.userId, parsedTenant.data],
        )
      ).rows[0];
      if (!base) throw new HttpError(404, "tenant_not_found", "The tenant or its serving account is unavailable.");

      const [outlets, catalog, slots, orderingEnabled, codEnabled, creditEnabled] = await Promise.all([
        options.pool.query<{ public_id: string; label: string; address_line_1: string; city: string; pincode: string; delivery_instructions: string | null; in_use_count: number; spare_full_count: number; empty_count: number }>(
          `select public_id::text, label, address_line_1, city, pincode, delivery_instructions, in_use_count, spare_full_count, empty_count
             from app.outlets where tenant_id = $1 and status = 'active' order by id`,
          [base.tenant_id],
        ),
        options.pool.query<{ code: string; display_name: string; weight_kg: string; base_unit_price: string; negotiated_unit_price: string | null; slabs: Array<{ minQuantity: number; unitPrice: number }> | null }>(
          `select cylinder.code, cylinder.display_name, cylinder.weight_kg::text,
                  price.base_unit_price::text,
                  negotiated.unit_price::text as negotiated_unit_price,
                  coalesce(jsonb_agg(jsonb_build_object('minQuantity', slab.min_quantity, 'unitPrice', slab.unit_price) order by slab.min_quantity)
                    filter (where slab.id is not null), '[]'::jsonb) as slabs
             from app.agency_prices price
             join app.cylinder_types cylinder on cylinder.id = price.cylinder_type_id and cylinder.active
             left join app.commercial_account_prices negotiated
               on negotiated.commercial_account_id = $2 and negotiated.cylinder_type_id = cylinder.id and negotiated.active
             left join app.agency_price_slabs slab on slab.agency_price_id = price.id
            where price.agency_id = $1 and price.active
            group by cylinder.id, price.id, negotiated.unit_price
            order by cylinder.weight_kg`,
          [base.agency_id, base.account_id],
        ),
        options.pool.query<{ code: DeliverySlot; display_name: string; surcharge: string; max_cylinders: number | null }>(
          `select slot_code as code, display_name, surcharge::text, max_cylinders
             from app.agency_delivery_slots where agency_id = $1 and active order by id`,
          [base.agency_id],
        ),
        platformSettingValue(options.pool, "workflows.ordering"),
        platformSettingValue(options.pool, "workflows.cod_orders"),
        platformSettingValue(options.pool, "workflows.credit_orders"),
      ]);

      const firstOutlet = outlets.rows[0];
      const context = firstOutlet ? await tenantContext(options.pool, principal.userId, parsedTenant.data, firstOutlet.public_id) : null;
      const credit = context ? await creditSnapshot(options.pool, context) : null;
      const paymentMethods: PaymentMethod[] = [];
      if (orderingEnabled === true && codEnabled === true && base.cod_enabled) paymentMethods.push("cod");
      if (orderingEnabled === true && creditEnabled === true && credit?.eligible) paymentMethods.push("credit");
      response.status(200).json({
        tenant: { publicId: base.tenant_public_id, displayName: base.display_name, gstin: base.gstin },
        agency: { publicId: base.agency_public_id, displayName: base.agency_name },
        outlets: outlets.rows.map((outlet) => ({
          publicId: outlet.public_id, label: outlet.label, address: `${outlet.address_line_1}, ${outlet.city} ${outlet.pincode}`,
          deliveryInstructions: outlet.delivery_instructions,
          stock: { inUse: outlet.in_use_count, spareFull: outlet.spare_full_count, empty: outlet.empty_count },
        })),
        catalog: catalog.rows.map((item) => ({
          cylinderTypeCode: item.code, displayName: item.display_name, weightKg: Number(item.weight_kg),
          baseUnitPrice: Number(item.base_unit_price).toFixed(2),
          negotiatedUnitPrice: item.negotiated_unit_price === null ? null : Number(item.negotiated_unit_price).toFixed(2),
          slabs: (item.slabs ?? []).map((slab) => ({ minQuantity: slab.minQuantity, unitPrice: Number(slab.unitPrice).toFixed(2) })),
        })),
        deliverySlots: slots.rows.map((slot) => ({ code: slot.code, displayName: slot.display_name, surcharge: Number(slot.surcharge).toFixed(2), maxCylinders: slot.max_cylinders })),
        paymentMethods,
        credit,
        currency: "INR",
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tenants/:tenantPublicId/quotes", async (request, response, next) => {
    try {
      const parsedTenant = tenantId.safeParse(request.params.tenantPublicId);
      const parsed = quoteRequestSchema.safeParse(request.body);
      if (!parsedTenant.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The quotation request is invalid.", parsed.error.flatten());
      const principal = authenticatedPrincipal(response);
      await assertPlatformWorkflowEnabled(options.pool, "workflows.ordering", "Order placement is temporarily paused by a Super Admin.");
      await assertPlatformWorkflowEnabled(options.pool, parsed.data.paymentMethod === "cod" ? "workflows.cod_orders" : "workflows.credit_orders", `${parsed.data.paymentMethod === "cod" ? "Cash-on-delivery" : "Credit"} orders are temporarily paused by a Super Admin.`);
      const result = await withTransaction(options.pool, async (client) => {
        const context = await tenantContext(client, principal.userId, parsedTenant.data, parsed.data.outletPublicId);
        const calculated = await calculateQuote(client, context, parsed.data);
        const credit = parsed.data.paymentMethod === "credit" ? await creditSnapshot(client, context, calculated.totalAmountPaise) : null;
        if (credit && !credit.eligible) {
          throw new HttpError(422, credit.overdue ? "credit_overdue" : "credit_limit_exceeded", credit.overdue ? "Credit ordering is blocked while an invoice is overdue." : "This order exceeds the available credit limit.", { credit });
        }
        const publicId = uuidV7();
        const expiresAt = new Date(Date.now() + 10 * 60_000);
        const signature = quoteSignature(context, calculated);
        const inserted = (
          await client.query<{ id: string }>(
            `insert into app.order_quotes (
               public_id, tenant_id, outlet_id, agency_id, commercial_account_id, quoted_by_user_id,
               delivery_slot, payment_method, subtotal, delivery_fee, slot_surcharge, taxable_amount,
               gst_rate, gst_amount, total_amount, pricing_signature, credit_snapshot, expires_at
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, $18)
             returning id::text`,
            [publicId, context.tenant_id, context.outlet_id, context.agency_id, context.commercial_account_id, principal.userId,
              calculated.deliverySlot, calculated.paymentMethod, money(calculated.subtotalPaise), money(calculated.deliveryFeePaise),
              money(calculated.slotSurchargePaise), money(calculated.taxableAmountPaise), calculated.gstRate,
              money(calculated.gstAmountPaise), money(calculated.totalAmountPaise), signature, JSON.stringify(credit), expiresAt],
          )
        ).rows[0]!;
        for (const item of calculated.items) {
          await client.query(
            `insert into app.order_quote_items (
               order_quote_id, cylinder_type_id, quantity, base_unit_price, effective_unit_price, price_source, line_subtotal
             ) values ($1, $2, $3, $4, $5, $6, $7)`,
            [inserted.id, item.cylinderTypeId, item.quantity, money(item.baseUnitPricePaise), money(item.effectiveUnitPricePaise), item.priceSource, money(item.lineSubtotalPaise)],
          );
        }
        return quoteBody(publicId, expiresAt, calculated, credit);
      });
      response.status(201).json({ quote: result });
    } catch (error) {
      next(error);
    }
  });

  router.post("/tenants/:tenantPublicId/orders", async (request, response, next) => {
    try {
      const parsedTenant = tenantId.safeParse(request.params.tenantPublicId);
      const parsed = orderRequestSchema.safeParse(request.body);
      if (!parsedTenant.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The order request is invalid.", parsed.error.flatten());
      const idempotencyKey = request.header("idempotency-key")?.trim();
      if (!idempotencyKey || !safeIdempotencyKey.test(idempotencyKey)) {
        throw new HttpError(400, "invalid_idempotency_key", "Idempotency-Key must contain 8–128 safe characters.");
      }
      const principal = authenticatedPrincipal(response);
      const scope = `order.create:${principal.userPublicId}:${parsedTenant.data}`;
      const hash = createHash("sha256").update(JSON.stringify(parsed.data), "utf8").digest();
      const result = await withTransaction(options.pool, async (client) => {
        const claimed = await client.query(
          `insert into app.idempotency_keys (scope, idempotency_key, request_hash, locked_until, expires_at)
           values ($1, $2, $3, now() + interval '30 seconds', now() + interval '24 hours')
           on conflict (scope, idempotency_key) do nothing`,
          [scope, idempotencyKey, hash],
        );
        if (claimed.rowCount === 0) {
          const prior = (
            await client.query<{ same_request: boolean; response_status: number | null; response_body: unknown }>(
              `select request_hash = $3 as same_request, response_status, response_body
                 from app.idempotency_keys where scope = $1 and idempotency_key = $2 for update`,
              [scope, idempotencyKey, hash],
            )
          ).rows[0];
          if (!prior?.same_request) throw new HttpError(409, "idempotency_key_reused", "This idempotency key was already used with a different order.");
          if (prior.response_status && prior.response_body) return { status: prior.response_status, body: prior.response_body, replayed: true };
          throw new HttpError(409, "request_in_progress", "An order with this idempotency key is still in progress.");
        }

        const stored = (
          await client.query<{
            id: string; public_id: string; outlet_public_id: string; delivery_slot: DeliverySlot; payment_method: PaymentMethod;
            expires_at: Date; consumed_at: Date | null; pricing_signature: Buffer;
          }>(
            `select quote.id::text, quote.public_id::text, outlet.public_id::text as outlet_public_id,
                    quote.delivery_slot, quote.payment_method, quote.expires_at, quote.consumed_at, quote.pricing_signature
               from app.order_quotes quote
               join app.tenants tenant on tenant.id = quote.tenant_id
               join app.outlets outlet on outlet.id = quote.outlet_id
              where quote.public_id = $1 and tenant.public_id = $2 and quote.quoted_by_user_id = $3
              for update of quote`,
            [parsed.data.quotePublicId, parsedTenant.data, principal.userId],
          )
        ).rows[0];
        if (!stored) throw new HttpError(404, "quote_not_found", "The quotation was not found.");
        await assertPlatformWorkflowEnabled(client, "workflows.ordering", "Order placement is temporarily paused by a Super Admin.");
        await assertPlatformWorkflowEnabled(client, stored.payment_method === "cod" ? "workflows.cod_orders" : "workflows.credit_orders", `${stored.payment_method === "cod" ? "Cash-on-delivery" : "Credit"} orders are temporarily paused by a Super Admin.`);
        if (stored.consumed_at) throw new HttpError(409, "quote_consumed", "This quotation has already been used.");
        if (stored.expires_at.getTime() <= Date.now()) throw new HttpError(409, "quote_expired", "This quotation has expired. Please request a new price.");

        const storedItems = await client.query<{ cylinder_type_code: string; quantity: number }>(
          `select cylinder.code as cylinder_type_code, item.quantity
             from app.order_quote_items item
             join app.cylinder_types cylinder on cylinder.id = item.cylinder_type_id
            where item.order_quote_id = $1 order by cylinder.code`,
          [stored.id],
        );
        const context = await tenantContext(client, principal.userId, parsedTenant.data, stored.outlet_public_id, true);
        const quoteRequest: z.infer<typeof quoteRequestSchema> = {
          outletPublicId: stored.outlet_public_id,
          deliverySlot: stored.delivery_slot,
          paymentMethod: stored.payment_method,
          items: storedItems.rows.map((item) => ({ cylinderTypeCode: item.cylinder_type_code, quantity: item.quantity })),
        };
        const calculated = await calculateQuote(client, context, quoteRequest);
        if (!quoteSignature(context, calculated).equals(stored.pricing_signature)) {
          throw new HttpError(409, "quote_changed", "Pricing or ordering policy changed. Please request a new quotation.");
        }
        const credit = stored.payment_method === "credit" ? await creditSnapshot(client, context, calculated.totalAmountPaise) : null;
        if (credit && !credit.eligible) {
          throw new HttpError(422, credit.overdue ? "credit_overdue" : "credit_limit_exceeded", credit.overdue ? "Credit ordering is blocked while an invoice is overdue." : "This order exceeds the available credit limit.", { credit });
        }

        const orderPublicId = uuidV7();
        const orderNumber = `ORD-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
        const paymentStatus = stored.payment_method === "credit" ? "credit_reserved" : "cod_pending";
        const order = (
          await client.query<{ id: string }>(
            `insert into app.orders (
               public_id, order_number, tenant_id, outlet_id, agency_id, commercial_account_id,
               placed_by_user_id, source_quote_id, status, payment_method, payment_status, delivery_slot,
               requested_delivery_date, empties_expected, delivery_instructions, subtotal, delivery_fee,
               slot_surcharge, taxable_amount, gst_rate, gst_amount, total_amount, placed_at
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'placed', $9, $10, $11, $12, $13, $14,
                       $15, $16, $17, $18, $19, $20, $21, now()) returning id::text`,
            [orderPublicId, orderNumber, context.tenant_id, context.outlet_id, context.agency_id, context.commercial_account_id,
              principal.userId, stored.id, stored.payment_method, paymentStatus, stored.delivery_slot,
              parsed.data.requestedDeliveryDate ?? null, parsed.data.emptiesExpected, parsed.data.deliveryInstructions ?? null,
              money(calculated.subtotalPaise), money(calculated.deliveryFeePaise), money(calculated.slotSurchargePaise),
              money(calculated.taxableAmountPaise), calculated.gstRate, money(calculated.gstAmountPaise), money(calculated.totalAmountPaise)],
          )
        ).rows[0]!;
        for (const item of calculated.items) {
          await client.query(
            `insert into app.order_items (
               order_id, cylinder_type_id, cylinder_code, cylinder_display_name, quantity,
               unit_price, price_source, line_subtotal
             ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [order.id, item.cylinderTypeId, item.cylinderTypeCode, item.displayName, item.quantity,
              money(item.effectiveUnitPricePaise), item.priceSource, money(item.lineSubtotalPaise)],
          );
        }
        await client.query(
          `insert into app.order_status_events (public_id, order_id, to_status, actor_user_id, reason)
           values ($1, $2, 'placed', $3, 'Order placed by authenticated tenant user')`,
          [uuidV7(), order.id, principal.userId],
        );
        await client.query("update app.order_quotes set consumed_at = now() where id = $1", [stored.id]);
        const body = {
          order: {
            publicId: orderPublicId,
            orderNumber,
            status: "placed",
            paymentMethod: stored.payment_method,
            paymentStatus,
            totalAmount: money(calculated.totalAmountPaise),
            currency: "INR",
            placedAt: new Date().toISOString(),
          },
        };
        await client.query(
          `insert into app.outbox_events (public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key)
           values ($1, 'order.placed', 'order', $2, $3::jsonb, $4)`,
          [uuidV7(), orderPublicId, JSON.stringify({ ...body.order, tenantPublicId: parsedTenant.data, outletPublicId: context.outlet_public_id, agencyPublicId: context.agency_public_id }), `order-placed:${orderPublicId}`],
        );
        await client.query(
          `insert into app.audit_events (
             public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
             after_values, request_id, correlation_id, source_ip, user_agent
           ) values ($1, $2, 'tenant_user', 'order.placed', 'order', $3, $4::jsonb, $5, $6, $7, $8)`,
          [uuidV7(), principal.userId, orderPublicId, JSON.stringify({ ...body.order, quotePublicId: stored.public_id, tenantPublicId: parsedTenant.data }), uuidV7(), uuidV7(), request.ip || null, request.header("user-agent")?.slice(0, 500) ?? null],
        );
        await client.query(
          `update app.idempotency_keys set response_status = 201, response_body = $3::jsonb,
                  completed_at = now(), locked_until = null where scope = $1 and idempotency_key = $2`,
          [scope, idempotencyKey, JSON.stringify(body)],
        );
        return { status: 201, body, replayed: false };
      });
      if (result.replayed) response.setHeader("idempotent-replayed", "true");
      response.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
