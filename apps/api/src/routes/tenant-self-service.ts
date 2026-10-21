import type pg from "pg";
import { Router } from "express";
import { withTransaction } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";

const publicId = z.string().uuid();
const phoneE164 = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
const periodSchema = z.enum(["daily", "weekly", "monthly"]);
const supportCategory = z.enum(["onboarding", "ordering", "delivery", "billing", "credit", "agency", "technical", "other"]);
const controlledField = z.enum(["business_name", "gstin_fssai", "registered_phone", "outlet_address", "serving_agency"]);

const requirementSchema = z.object({
  period: z.enum(["week", "month"]),
  preferredDeliveryDays: z.array(z.number().int().min(0).max(6)).max(7).refine((days) => new Set(days).size === days.length, "delivery days must be unique"),
  preferredSlot: z.enum(["before_opening", "standard", "evening", "express"]).nullable(),
  items: z.array(z.object({
    cylinderTypeCode: z.string().trim().min(1).max(64),
    expectedQuantity: z.number().int().positive().max(10_000),
  }).strict()).min(1).max(10).refine((items) => new Set(items.map((item) => item.cylinderTypeCode)).size === items.length, "cylinder types must be unique"),
}).strict();

const outletUpdateSchema = z.object({
  contactName: z.string().trim().min(2).max(120).nullable().optional(),
  contactPhoneE164: phoneE164.nullable().optional(),
  deliveryInstructions: z.string().trim().min(3).max(1_000).nullable().optional(),
  stock: z.object({
    inUse: z.number().int().min(0).max(100_000),
    spareFull: z.number().int().min(0).max(100_000),
    empty: z.number().int().min(0).max(100_000),
  }).strict().optional(),
  requirement: requirementSchema.optional(),
}).strict().refine((value) => Object.values(value).some((item) => item !== undefined), "at least one field is required");

const supportCreateSchema = z.object({
  kind: z.enum(["support", "change_request"]).default("support"),
  category: supportCategory.default("other"),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(5).max(5_000),
  orderPublicId: publicId.optional(),
  changeField: controlledField.optional(),
}).strict().superRefine((value, context) => {
  if (value.kind === "change_request" && !value.changeField) {
    context.addIssue({ code: "custom", path: ["changeField"], message: "A controlled field is required for a change request." });
  }
  if (value.kind === "support" && value.changeField) {
    context.addIssue({ code: "custom", path: ["changeField"], message: "Controlled fields apply only to change requests." });
  }
});

interface TenantAccessRow {
  tenant_id: string;
  tenant_public_id: string;
  legal_name: string;
  display_name: string;
  business_type: string;
  gstin: string;
  fssai_number: string | null;
  alternate_phone_e164: string | null;
  tenant_status: string;
  membership_type: "owner" | "manager" | "staff";
  user_public_id: string;
  user_name: string;
  user_phone_e164: string;
  preferred_language: "en" | "hi" | "te";
  agency_id: string;
  agency_public_id: string;
  agency_display_name: string;
  agency_phone_e164: string;
  account_id: string;
  payment_mode: "prepaid" | "credit";
  credit_status: "approved" | "suspended" | "closed" | null;
  credit_limit: string | null;
  net_term_days: number | null;
}

async function tenantAccess(client: pg.Pool | pg.PoolClient, userId: string, tenantPublicId: string): Promise<TenantAccessRow> {
  const row = (await client.query<TenantAccessRow>(
    `select tenant.id::text as tenant_id, tenant.public_id::text as tenant_public_id,
            tenant.legal_name, tenant.display_name, tenant.business_type, tenant.gstin,
            tenant.fssai_number, tenant.alternate_phone_e164, tenant.status as tenant_status,
            membership.membership_type,
            user_row.public_id::text as user_public_id, user_row.full_name as user_name,
            user_row.phone_e164 as user_phone_e164, user_row.preferred_language,
            agency.id::text as agency_id, agency.public_id::text as agency_public_id,
            agency.display_name as agency_display_name, agency.phone_e164 as agency_phone_e164,
            account.id::text as account_id, account.payment_mode,
            credit.status as credit_status, credit.credit_limit::text, credit.net_term_days
       from app.tenant_memberships membership
       join app.users user_row on user_row.id = membership.user_id and user_row.status = 'active'
       join app.tenants tenant on tenant.id = membership.tenant_id and tenant.status = 'active'
       join app.agency_assignments assignment on assignment.tenant_id = tenant.id and assignment.status = 'active' and assignment.ends_at is null
       join app.agencies agency on agency.id = assignment.agency_id and agency.status = 'approved'
       join app.commercial_accounts account on account.tenant_id = tenant.id and account.agency_id = agency.id and account.status = 'open'
       left join app.credit_accounts credit on credit.commercial_account_id = account.id
      where membership.user_id = $1 and membership.status = 'active' and tenant.public_id = $2`,
    [userId, tenantPublicId],
  )).rows[0];
  if (!row) throw new HttpError(404, "tenant_not_found", "The tenant or its serving account is unavailable.");
  return row;
}

function assertCanManageTenant(access: TenantAccessRow): void {
  if (access.membership_type === "staff") {
    throw new HttpError(403, "tenant_management_required", "Only a tenant owner or manager can update outlet and requirement details.");
  }
}

async function auditTenantAction(client: pg.PoolClient, userId: string, access: TenantAccessRow, input: {
  action: string;
  entityType: string;
  entityPublicId: string;
  reason: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  requestId: string;
}): Promise<void> {
  await client.query(
    `insert into app.audit_events (
       public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
       reason, before_values, after_values, request_id, correlation_id
     ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
    [uuidV7(), userId, `tenant_${access.membership_type}`, input.action, input.entityType, input.entityPublicId,
      input.reason, input.before ? JSON.stringify(input.before) : null, input.after ? JSON.stringify(input.after) : null,
      input.requestId, uuidV7()],
  );
}

function money(value: string | number | null | undefined): string {
  return Number(value ?? 0).toFixed(2);
}

function number(value: string | number | null | undefined): number {
  return Number(value ?? 0);
}

export function tenantSelfServiceRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.get("/tenants/:tenantPublicId/profile", async (request, response, next) => {
    try {
      const tenant = publicId.safeParse(request.params.tenantPublicId);
      if (!tenant.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      const principal = authenticatedPrincipal(response);
      const access = await tenantAccess(options.pool, principal.userId, tenant.data);
      const [outlets, cylinderTypes] = await Promise.all([options.pool.query<{
        public_id: string; label: string; address_line_1: string; address_line_2: string | null; city: string; state_code: string; pincode: string;
        contact_name: string | null; contact_phone_e164: string | null; delivery_instructions: string | null;
        in_use_count: number; spare_full_count: number; empty_count: number; requirement: null | {
          period: "week" | "month"; preferredDeliveryDays: number[]; preferredSlot: string | null;
          items: Array<{ cylinderTypeCode: string; displayName: string; expectedQuantity: number }>;
        };
      }>(
        `select outlet.public_id::text, outlet.label, outlet.address_line_1, outlet.address_line_2,
                outlet.city, outlet.state_code, outlet.pincode, outlet.contact_name,
                outlet.contact_phone_e164, outlet.delivery_instructions,
                outlet.in_use_count, outlet.spare_full_count, outlet.empty_count,
                case when requirement.id is null then null else jsonb_build_object(
                  'period', requirement.period,
                  'preferredDeliveryDays', requirement.preferred_delivery_days,
                  'preferredSlot', requirement.preferred_slot,
                  'items', coalesce(items.value, '[]'::jsonb)
                ) end as requirement
           from app.outlets outlet
           left join app.tenant_requirements requirement on requirement.outlet_id = outlet.id and requirement.tenant_id = outlet.tenant_id
           left join lateral (
             select jsonb_agg(jsonb_build_object(
               'cylinderTypeCode', cylinder.code,
               'displayName', cylinder.display_name,
               'expectedQuantity', item.expected_quantity
             ) order by cylinder.weight_kg) as value
               from app.tenant_requirement_items item
               join app.cylinder_types cylinder on cylinder.id = item.cylinder_type_id
              where item.tenant_requirement_id = requirement.id
           ) items on true
          where outlet.tenant_id = $1 and outlet.status = 'active'
          order by outlet.id`,
        [access.tenant_id],
      ), options.pool.query<{ code: string; display_name: string; weight_kg: string }>(
        "select code, display_name, weight_kg::text from app.cylinder_types where active order by weight_kg, code",
      )]);
      response.status(200).json({
        tenant: {
          publicId: access.tenant_public_id,
          legalName: access.legal_name,
          displayName: access.display_name,
          businessType: access.business_type,
          gstin: access.gstin,
          fssaiNumber: access.fssai_number,
          alternatePhoneE164: access.alternate_phone_e164,
          status: access.tenant_status,
        },
        user: {
          publicId: access.user_public_id,
          fullName: access.user_name,
          phoneE164: access.user_phone_e164,
          preferredLanguage: access.preferred_language,
          membershipType: access.membership_type,
          canManage: access.membership_type !== "staff",
        },
        agency: { publicId: access.agency_public_id, displayName: access.agency_display_name, phoneE164: access.agency_phone_e164 },
        account: { paymentMode: access.payment_mode, creditStatus: access.credit_status, creditLimit: access.credit_limit, netTermDays: access.net_term_days },
        cylinderTypes: cylinderTypes.rows.map((item) => ({ code: item.code, displayName: item.display_name, weightKg: Number(item.weight_kg) })),
        outlets: outlets.rows.map((outlet) => ({
          publicId: outlet.public_id,
          label: outlet.label,
          address: { line1: outlet.address_line_1, line2: outlet.address_line_2, city: outlet.city, stateCode: outlet.state_code, pincode: outlet.pincode },
          contact: { name: outlet.contact_name, phoneE164: outlet.contact_phone_e164 },
          deliveryInstructions: outlet.delivery_instructions,
          stock: { inUse: outlet.in_use_count, spareFull: outlet.spare_full_count, empty: outlet.empty_count },
          requirement: outlet.requirement,
        })),
      });
    } catch (error) { next(error); }
  });

  router.post("/tenants/:tenantPublicId/outlets/:outletPublicId", async (request, response, next) => {
    try {
      const tenant = publicId.safeParse(request.params.tenantPublicId);
      const outlet = publicId.safeParse(request.params.outletPublicId);
      const parsed = outletUpdateSchema.safeParse(request.body);
      if (!tenant.success || !outlet.success || !parsed.success) {
        throw new HttpError(400, "invalid_request", "The outlet update is invalid.", parsed.success ? undefined : parsed.error.flatten());
      }
      const principal = authenticatedPrincipal(response);
      const updated = await withTransaction(options.pool, async (client) => {
        const access = await tenantAccess(client, principal.userId, tenant.data);
        assertCanManageTenant(access);
        const current = (await client.query<{
          id: string; public_id: string; contact_name: string | null; contact_phone_e164: string | null; delivery_instructions: string | null;
          in_use_count: number; spare_full_count: number; empty_count: number;
        }>(
          `select id::text, public_id::text, contact_name, contact_phone_e164, delivery_instructions,
                  in_use_count, spare_full_count, empty_count
             from app.outlets
            where tenant_id = $1 and public_id = $2 and status = 'active'
            for update`,
          [access.tenant_id, outlet.data],
        )).rows[0];
        if (!current) throw new HttpError(404, "outlet_not_found", "The active outlet was not found.");

        const nextValues = {
          contactName: parsed.data.contactName === undefined ? current.contact_name : parsed.data.contactName,
          contactPhoneE164: parsed.data.contactPhoneE164 === undefined ? current.contact_phone_e164 : parsed.data.contactPhoneE164,
          deliveryInstructions: parsed.data.deliveryInstructions === undefined ? current.delivery_instructions : parsed.data.deliveryInstructions,
          inUse: parsed.data.stock?.inUse ?? current.in_use_count,
          spareFull: parsed.data.stock?.spareFull ?? current.spare_full_count,
          empty: parsed.data.stock?.empty ?? current.empty_count,
        };
        await client.query(
          `update app.outlets
              set contact_name = $2, contact_phone_e164 = $3, delivery_instructions = $4,
                  in_use_count = $5, spare_full_count = $6, empty_count = $7, updated_at = now()
            where id = $1`,
          [current.id, nextValues.contactName, nextValues.contactPhoneE164, nextValues.deliveryInstructions,
            nextValues.inUse, nextValues.spareFull, nextValues.empty],
        );

        let requirement: z.infer<typeof requirementSchema> | null = null;
        if (parsed.data.requirement) {
          const codes = parsed.data.requirement.items.map((item) => item.cylinderTypeCode);
          const cylinders = await client.query<{ id: string; code: string }>(
            "select id::text, code from app.cylinder_types where active and code = any($1::text[])", [codes],
          );
          if (cylinders.rowCount !== codes.length) throw new HttpError(422, "cylinder_type_unavailable", "One or more requirement cylinder types are unavailable.");
          const requirementId = (await client.query<{ id: string }>(
            `insert into app.tenant_requirements (public_id, tenant_id, outlet_id, period, preferred_delivery_days, preferred_slot)
             values ($1, $2, $3, $4, $5::smallint[], $6)
             on conflict (tenant_id, outlet_id) do update
               set period = excluded.period, preferred_delivery_days = excluded.preferred_delivery_days,
                   preferred_slot = excluded.preferred_slot, updated_at = now()
             returning id::text`,
            [uuidV7(), access.tenant_id, current.id, parsed.data.requirement.period,
              [...parsed.data.requirement.preferredDeliveryDays].sort((left, right) => left - right), parsed.data.requirement.preferredSlot],
          )).rows[0]!.id;
          await client.query("delete from app.tenant_requirement_items where tenant_requirement_id = $1", [requirementId]);
          for (const item of parsed.data.requirement.items) {
            const cylinder = cylinders.rows.find((candidate) => candidate.code === item.cylinderTypeCode)!;
            await client.query(
              "insert into app.tenant_requirement_items (tenant_requirement_id, cylinder_type_id, expected_quantity) values ($1, $2, $3)",
              [requirementId, cylinder.id, item.expectedQuantity],
            );
          }
          requirement = parsed.data.requirement;
        }

        const before = {
          contactName: current.contact_name, contactPhoneE164: current.contact_phone_e164,
          deliveryInstructions: current.delivery_instructions,
          stock: { inUse: current.in_use_count, spareFull: current.spare_full_count, empty: current.empty_count },
        };
        const after = {
          contactName: nextValues.contactName, contactPhoneE164: nextValues.contactPhoneE164,
          deliveryInstructions: nextValues.deliveryInstructions,
          stock: { inUse: nextValues.inUse, spareFull: nextValues.spareFull, empty: nextValues.empty },
          ...(requirement ? { requirement } : {}),
        };
        await auditTenantAction(client, principal.userId, access, {
          action: "tenant.outlet_self_service_updated", entityType: "outlet", entityPublicId: current.public_id,
          reason: "Tenant owner or manager updated permitted outlet fields", before, after,
          requestId: response.locals.requestId ?? uuidV7(),
        });
        return { publicId: current.public_id, ...after };
      });
      response.status(200).json({ outlet: updated });
    } catch (error) { next(error); }
  });

  router.get("/tenants/:tenantPublicId/dashboard", async (request, response, next) => {
    try {
      const tenant = publicId.safeParse(request.params.tenantPublicId);
      const parsedPeriod = periodSchema.safeParse(request.query.period ?? "daily");
      if (!tenant.success || !parsedPeriod.success) throw new HttpError(400, "invalid_request", "The tenant dashboard request is invalid.");
      const principal = authenticatedPrincipal(response);
      const access = await tenantAccess(options.pool, principal.userId, tenant.data);
      const unit = parsedPeriod.data === "daily" ? "day" : parsedPeriod.data === "weekly" ? "week" : "month";
      const bounds = (await options.pool.query<{ start_at: Date; end_at: Date; previous_start_at: Date }>(
        `select (date_trunc($1, now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') as start_at,
                ((date_trunc($1, now() at time zone 'Asia/Kolkata') + ('1 ' || $1)::interval) at time zone 'Asia/Kolkata') as end_at,
                ((date_trunc($1, now() at time zone 'Asia/Kolkata') - ('1 ' || $1)::interval) at time zone 'Asia/Kolkata') as previous_start_at`,
        [unit],
      )).rows[0]!;

      const [orders, invoices, collections, outletBreakdown, cylinderBreakdown, states, outlets, support] = await Promise.all([
        options.pool.query<{
          current_orders: string; previous_orders: string; current_cylinders: string; previous_cylinders: string;
          current_booked: string; previous_booked: string; current_delivered: string; previous_delivered: string;
          current_delivered_value: string; previous_delivered_value: string; current_empties_expected: string;
          current_empties_collected: string; average_delivery_minutes: string | null;
        }>(
          `with order_values as (
             select order_row.*,
                    coalesce((select sum(item.quantity) from app.order_items item where item.order_id = order_row.id), 0) as cylinders
               from app.orders order_row
              where order_row.tenant_id = $1 and order_row.created_at >= $2 and order_row.created_at < $4
           )
           select count(*) filter (where created_at >= $3 and status not in ('rejected','cancelled','payment_failed'))::text as current_orders,
                  count(*) filter (where created_at < $3 and status not in ('rejected','cancelled','payment_failed'))::text as previous_orders,
                  coalesce(sum(cylinders) filter (where created_at >= $3 and status not in ('rejected','cancelled','payment_failed')), 0)::text as current_cylinders,
                  coalesce(sum(cylinders) filter (where created_at < $3 and status not in ('rejected','cancelled','payment_failed')), 0)::text as previous_cylinders,
                  coalesce(sum(total_amount) filter (where created_at >= $3 and status not in ('rejected','cancelled','payment_failed')), 0)::text as current_booked,
                  coalesce(sum(total_amount) filter (where created_at < $3 and status not in ('rejected','cancelled','payment_failed')), 0)::text as previous_booked,
                  count(*) filter (where created_at >= $3 and status = 'delivered')::text as current_delivered,
                  count(*) filter (where created_at < $3 and status = 'delivered')::text as previous_delivered,
                  coalesce(sum(total_amount) filter (where created_at >= $3 and status = 'delivered'), 0)::text as current_delivered_value,
                  coalesce(sum(total_amount) filter (where created_at < $3 and status = 'delivered'), 0)::text as previous_delivered_value,
                  coalesce(sum(empties_expected) filter (where created_at >= $3 and status not in ('rejected','cancelled','payment_failed')), 0)::text as current_empties_expected,
                  coalesce(sum(empties_collected) filter (where created_at >= $3), 0)::text as current_empties_collected,
                  avg(extract(epoch from (delivered_at - placed_at)) / 60) filter (where created_at >= $3 and status = 'delivered' and placed_at is not null and delivered_at is not null)::text as average_delivery_minutes
             from order_values`,
          [access.tenant_id, bounds.previous_start_at, bounds.start_at, bounds.end_at],
        ),
        options.pool.query<{ current_taxable: string; current_gst: string; current_total: string; outstanding: string; overdue: string; due_soon: string }>(
          `select coalesce(sum(taxable_amount) filter (where issued_at >= $2 and issued_at < $3), 0)::text as current_taxable,
                  coalesce(sum(gst_amount) filter (where issued_at >= $2 and issued_at < $3), 0)::text as current_gst,
                  coalesce(sum(total_amount) filter (where issued_at >= $2 and issued_at < $3), 0)::text as current_total,
                  coalesce(sum(outstanding_amount) filter (where status in ('open','overdue')), 0)::text as outstanding,
                  coalesce(sum(outstanding_amount) filter (where status in ('open','overdue') and due_at < now()), 0)::text as overdue,
                  coalesce(sum(outstanding_amount) filter (where status in ('open','overdue') and due_at >= now() and due_at < now() + interval '7 days'), 0)::text as due_soon
             from app.invoices where tenant_id = $1`,
          [access.tenant_id, bounds.start_at, bounds.end_at],
        ),
        options.pool.query<{ current_collected: string }>(
          `select coalesce(sum(amount) filter (where received_at >= $2 and received_at < $3), 0)::text as current_collected
             from app.payment_collections where tenant_id = $1`,
          [access.tenant_id, bounds.start_at, bounds.end_at],
        ),
        options.pool.query<{ public_id: string; label: string; orders: string; cylinders: string; spend: string }>(
          `select outlet.public_id::text, outlet.label, count(distinct order_row.id)::text as orders,
                  coalesce(sum(item.quantity),0)::text as cylinders,
                  coalesce(sum(item.line_subtotal),0)::text as spend
             from app.outlets outlet
             left join app.orders order_row on order_row.outlet_id = outlet.id and order_row.created_at >= $2 and order_row.created_at < $3 and order_row.status not in ('rejected','cancelled','payment_failed')
             left join app.order_items item on item.order_id = order_row.id
            where outlet.tenant_id = $1 and outlet.status = 'active'
            group by outlet.id
           having count(distinct order_row.id) > 0
            order by outlet.label`,
          [access.tenant_id, bounds.start_at, bounds.end_at],
        ),
        options.pool.query<{ code: string; display_name: string; cylinders: string; spend: string }>(
          `select item.cylinder_code as code, item.cylinder_display_name as display_name,
                  sum(item.quantity)::text as cylinders, sum(item.line_subtotal)::text as spend
             from app.orders order_row join app.order_items item on item.order_id = order_row.id
            where order_row.tenant_id = $1 and order_row.created_at >= $2 and order_row.created_at < $3
              and order_row.status not in ('rejected','cancelled','payment_failed')
            group by item.cylinder_code, item.cylinder_display_name order by item.cylinder_display_name`,
          [access.tenant_id, bounds.start_at, bounds.end_at],
        ),
        options.pool.query<{ status: string; count: string }>(
          `select status, count(*)::text from app.orders
            where tenant_id = $1 and status not in ('delivered','rejected','cancelled','payment_failed') group by status order by status`,
          [access.tenant_id],
        ),
        options.pool.query<{ public_id: string; label: string; in_use_count: number; spare_full_count: number; empty_count: number; period: "week" | "month" | null; expected_quantity: string }>(
          `select outlet.public_id::text, outlet.label, outlet.in_use_count, outlet.spare_full_count, outlet.empty_count,
                  requirement.period, coalesce(sum(item.expected_quantity),0)::text as expected_quantity
             from app.outlets outlet
             left join app.tenant_requirements requirement on requirement.outlet_id = outlet.id and requirement.tenant_id = outlet.tenant_id
             left join app.tenant_requirement_items item on item.tenant_requirement_id = requirement.id
            where outlet.tenant_id = $1 and outlet.status = 'active'
            group by outlet.id, requirement.id order by outlet.id`,
          [access.tenant_id],
        ),
        options.pool.query<{ open_cases: string }>(
          "select count(*)::text as open_cases from app.support_cases where tenant_id = $1 and status not in ('resolved','closed')",
          [access.tenant_id],
        ),
      ]);

      const order = orders.rows[0]!;
      const invoice = invoices.rows[0]!;
      const collection = collections.rows[0]!;
      response.status(200).json({
        tenant: { publicId: access.tenant_public_id, displayName: access.display_name },
        period: parsedPeriod.data,
        timezone: "Asia/Kolkata",
        range: { startAt: bounds.start_at.toISOString(), endAt: bounds.end_at.toISOString(), previousStartAt: bounds.previous_start_at.toISOString() },
        current: {
          orders: number(order.current_orders), cylinders: number(order.current_cylinders), bookedValue: money(order.current_booked),
          deliveredOrders: number(order.current_delivered), deliveredValue: money(order.current_delivered_value),
          emptiesExpected: number(order.current_empties_expected), emptiesCollected: number(order.current_empties_collected),
          averageDeliveryMinutes: order.average_delivery_minutes === null ? null : Math.round(number(order.average_delivery_minutes)),
          taxableValue: money(invoice.current_taxable), gst: money(invoice.current_gst), invoicedValue: money(invoice.current_total),
          collected: money(collection.current_collected),
        },
        previous: {
          orders: number(order.previous_orders), cylinders: number(order.previous_cylinders), bookedValue: money(order.previous_booked),
          deliveredOrders: number(order.previous_delivered), deliveredValue: money(order.previous_delivered_value),
        },
        account: {
          paymentMode: access.payment_mode, creditStatus: access.credit_status,
          creditLimit: access.credit_limit === null ? null : money(access.credit_limit), netTermDays: access.net_term_days,
          outstanding: money(invoice.outstanding), overdue: money(invoice.overdue), dueNext7Days: money(invoice.due_soon),
        },
        activeOrders: Object.fromEntries(states.rows.map((row) => [row.status, number(row.count)])),
        outlets: outlets.rows.map((row) => {
          const expected = number(row.expected_quantity);
          const weeklyExpected = row.period === "month" ? expected / 4.345 : expected;
          const usable = row.spare_full_count + row.in_use_count * 0.5;
          return {
            publicId: row.public_id, label: row.label,
            stock: { inUse: row.in_use_count, spareFull: row.spare_full_count, empty: row.empty_count },
            requirementPeriod: row.period,
            expectedQuantity: expected,
            estimatedDaysRemaining: weeklyExpected > 0 ? Math.round((usable / weeklyExpected) * 70) / 10 : null,
          };
        }),
        breakdown: {
          outlets: outletBreakdown.rows.map((row) => ({ publicId: row.public_id, label: row.label, orders: number(row.orders), cylinders: number(row.cylinders), spend: money(row.spend) })),
          cylinderTypes: cylinderBreakdown.rows.map((row) => ({ code: row.code, displayName: row.display_name, cylinders: number(row.cylinders), spend: money(row.spend) })),
        },
        openSupportCases: number(support.rows[0]?.open_cases),
        definitions: {
          bookedValue: "Accepted order value in the selected period, excluding rejected, cancelled, and failed-payment orders.",
          deliveredValue: "Value of orders marked delivered in the selected period.",
          stockEstimate: "Operational estimate from tenant-maintained stock and requirement quantities; not an accounting record.",
        },
      });
    } catch (error) { next(error); }
  });

  router.get("/tenants/:tenantPublicId/support-cases", async (request, response, next) => {
    try {
      const tenant = publicId.safeParse(request.params.tenantPublicId);
      if (!tenant.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      const principal = authenticatedPrincipal(response);
      const access = await tenantAccess(options.pool, principal.userId, tenant.data);
      const cases = await options.pool.query<{
        public_id: string; case_number: string; category: string; priority: string; status: string; subject: string;
        description: string; response_due_at: Date; first_response_at: Date | null; resolved_at: Date | null; resolution: string | null;
        created_at: Date; updated_at: Date; events: Array<{ publicId: string; type: string; note: string; occurredAt: string }>;
      }>(
        `select support.public_id::text, support.case_number, support.category, support.priority, support.status,
                support.subject, support.description, support.response_due_at, support.first_response_at,
                support.resolved_at, support.resolution, support.created_at, support.updated_at,
                coalesce(events.value, '[]'::jsonb) as events
           from app.support_cases support
           left join lateral (
             select jsonb_agg(jsonb_build_object(
               'publicId', event.public_id::text, 'type', event.event_type,
               'note', event.note, 'occurredAt', event.occurred_at
             ) order by event.occurred_at, event.id) as value
               from app.support_case_events event where event.support_case_id = support.id
           ) events on true
          where support.tenant_id = $1 order by support.created_at desc, support.id desc limit 100`,
        [access.tenant_id],
      );
      response.status(200).json({ cases: cases.rows.map((row) => ({
        publicId: row.public_id, caseNumber: row.case_number, category: row.category, priority: row.priority,
        status: row.status, subject: row.subject, description: row.description,
        responseDueAt: row.response_due_at.toISOString(), firstResponseAt: row.first_response_at?.toISOString() ?? null,
        resolvedAt: row.resolved_at?.toISOString() ?? null, resolution: row.resolution,
        createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(), events: row.events,
      })) });
    } catch (error) { next(error); }
  });

  router.post("/tenants/:tenantPublicId/support-cases", async (request, response, next) => {
    try {
      const tenant = publicId.safeParse(request.params.tenantPublicId);
      const parsed = supportCreateSchema.safeParse(request.body);
      if (!tenant.success || !parsed.success) throw new HttpError(400, "invalid_request", "The support request is invalid.", parsed.success ? undefined : parsed.error.flatten());
      const principal = authenticatedPrincipal(response);
      const created = await withTransaction(options.pool, async (client) => {
        const access = await tenantAccess(client, principal.userId, tenant.data);
        if (parsed.data.orderPublicId) {
          const linked = await client.query("select 1 from app.orders where tenant_id = $1 and public_id = $2", [access.tenant_id, parsed.data.orderPublicId]);
          if (!linked.rowCount) throw new HttpError(422, "support_order_mismatch", "The selected order does not belong to this tenant.");
        }
        const category = parsed.data.kind === "change_request"
          ? parsed.data.changeField === "serving_agency" ? "agency" : "onboarding"
          : parsed.data.category;
        const priority = parsed.data.kind === "change_request" ? "normal" : parsed.data.priority;
        const slaHours = { high: 4, normal: 8, low: 24 }[priority];
        const casePublicId = uuidV7();
        const caseNumber = `CASE-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${casePublicId.replaceAll("-", "").slice(-8).toUpperCase()}`;
        const description = [
          parsed.data.kind === "change_request" ? `Controlled field: ${parsed.data.changeField}` : null,
          parsed.data.orderPublicId ? `Related order: ${parsed.data.orderPublicId}` : null,
          parsed.data.description,
        ].filter(Boolean).join("\n");
        const row = (await client.query<{ public_id: string; case_number: string; status: string; response_due_at: Date; created_at: Date }>(
          `insert into app.support_cases (
             public_id, case_number, tenant_id, agency_id, opened_by_user_id, category, priority,
             subject, description, response_due_at
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(hours => $10))
           returning public_id::text, case_number, status, response_due_at, created_at`,
          [casePublicId, caseNumber, access.tenant_id, access.agency_id, principal.userId, category, priority,
            parsed.data.subject, description, slaHours],
        )).rows[0]!;
        await client.query(
          `insert into app.support_case_events (public_id, support_case_id, actor_user_id, event_type, to_status, note)
           select $1, id, $2, 'created', 'open', $3 from app.support_cases where public_id = $4`,
          [uuidV7(), principal.userId, description, casePublicId],
        );
        await auditTenantAction(client, principal.userId, access, {
          action: parsed.data.kind === "change_request" ? "tenant.change_requested" : "support_case.created",
          entityType: "support_case", entityPublicId: casePublicId, reason: parsed.data.subject,
          after: { kind: parsed.data.kind, category, priority, status: "open", changeField: parsed.data.changeField ?? null, orderPublicId: parsed.data.orderPublicId ?? null },
          requestId: response.locals.requestId ?? uuidV7(),
        });
        return row;
      });
      response.status(201).json({ case: {
        publicId: created.public_id, caseNumber: created.case_number, status: created.status,
        responseDueAt: created.response_due_at.toISOString(), createdAt: created.created_at.toISOString(),
      } });
    } catch (error) { next(error); }
  });

  return router;
}
