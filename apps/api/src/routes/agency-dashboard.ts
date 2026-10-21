import type pg from "pg";
import { Router } from "express";
import { z } from "zod";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { assertAuthorized } from "../security/rbac";

const publicId = z.string().uuid();
const querySchema = z.object({ period: z.enum(["daily", "weekly", "monthly"]).default("daily") });

const periods = {
  daily: { unit: "day", interval: "1 day", trendInterval: "4 hours", label: "Today" },
  weekly: { unit: "week", interval: "1 week", trendInterval: "1 day", label: "This week" },
  monthly: { unit: "month", interval: "1 month", trendInterval: "1 day", label: "This month" },
} as const;

interface AgencyRow {
  id: string;
  public_id: string;
  display_name: string;
  city: string;
  credit_enabled: boolean;
}

function number(value: string | number | null): number {
  return Number(value ?? 0);
}

export function agencyDashboardRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.get("/agencies/:agencyPublicId/dashboard", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId);
      const parsed = querySchema.safeParse(request.query);
      if (!agencyId.success || !parsed.success) {
        throw new HttpError(400, "invalid_request", "The agency identifier or dashboard period is invalid.");
      }

      const principal = authenticatedPrincipal(response);
      const agency = (
        await options.pool.query<AgencyRow>(
          `select id::text, public_id::text, display_name, city, credit_enabled
             from app.agencies
            where public_id = $1 and status = 'approved'`,
          [agencyId.data],
        )
      ).rows[0];
      if (!agency) throw new HttpError(404, "agency_not_found", "The agency was not found or is unavailable.");
      assertAuthorized(principal, "agency.view", { agencyPublicId: agency.public_id, city: agency.city });

      const config = periods[parsed.data.period];
      const boundaries = `
        select
          date_trunc('${config.unit}', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as current_start,
          (date_trunc('${config.unit}', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata') - interval '${config.interval}' as previous_start`;

      const [summaryResult, statesResult, inventoryResult, trendResult, exceptionsResult, activityResult] = await Promise.all([
        options.pool.query<{
          current_start: Date; previous_start: Date;
          orders_current: string; orders_previous: string; gmv_current: string; gmv_previous: string;
          delivered_current: string; delivered_previous: string; delivered_value_current: string; delivered_value_previous: string;
          cylinders_current: string; cylinders_previous: string; collections_current: string; collections_previous: string;
          active_fulfillment: string; unaccepted_orders: string; unassigned_orders: string; delivery_failures: string;
          median_acceptance_minutes: string | null; median_delivery_minutes: string | null;
          account_count: string; credit_account_count: string; approved_credit_limit: string;
          outstanding: string; overdue: string; open_invoice_count: string;
          staff_total: string; staff_active: string; staff_with_drops: string;
        }>(
          `with boundaries as (${boundaries})
           select boundaries.current_start, boundaries.previous_start,
             (select count(*) from app.orders o where o.agency_id = $1 and o.created_at >= boundaries.current_start)::text as orders_current,
             (select count(*) from app.orders o where o.agency_id = $1 and o.created_at >= boundaries.previous_start and o.created_at < boundaries.current_start)::text as orders_previous,
             (select coalesce(sum(o.total_amount), 0) from app.orders o where o.agency_id = $1 and o.created_at >= boundaries.current_start)::text as gmv_current,
             (select coalesce(sum(o.total_amount), 0) from app.orders o where o.agency_id = $1 and o.created_at >= boundaries.previous_start and o.created_at < boundaries.current_start)::text as gmv_previous,
             (select count(*) from app.orders o where o.agency_id = $1 and o.delivered_at >= boundaries.current_start)::text as delivered_current,
             (select count(*) from app.orders o where o.agency_id = $1 and o.delivered_at >= boundaries.previous_start and o.delivered_at < boundaries.current_start)::text as delivered_previous,
             (select coalesce(sum(o.total_amount), 0) from app.orders o where o.agency_id = $1 and o.delivered_at >= boundaries.current_start)::text as delivered_value_current,
             (select coalesce(sum(o.total_amount), 0) from app.orders o where o.agency_id = $1 and o.delivered_at >= boundaries.previous_start and o.delivered_at < boundaries.current_start)::text as delivered_value_previous,
             (select coalesce(sum(item.quantity), 0) from app.order_items item join app.orders o on o.id = item.order_id where o.agency_id = $1 and o.created_at >= boundaries.current_start)::text as cylinders_current,
             (select coalesce(sum(item.quantity), 0) from app.order_items item join app.orders o on o.id = item.order_id where o.agency_id = $1 and o.created_at >= boundaries.previous_start and o.created_at < boundaries.current_start)::text as cylinders_previous,
             (select coalesce(sum(payment.amount), 0) from app.payment_collections payment where payment.agency_id = $1 and payment.received_at >= boundaries.current_start)::text as collections_current,
             (select coalesce(sum(payment.amount), 0) from app.payment_collections payment where payment.agency_id = $1 and payment.received_at >= boundaries.previous_start and payment.received_at < boundaries.current_start)::text as collections_previous,
             (select count(*) from app.orders o where o.agency_id = $1 and o.status in ('accepted', 'assigned', 'out_for_delivery'))::text as active_fulfillment,
             (select count(*) from app.orders o where o.agency_id = $1 and o.status = 'placed')::text as unaccepted_orders,
             (select count(*) from app.orders o where o.agency_id = $1 and o.status = 'accepted' and o.assigned_delivery_staff_id is null)::text as unassigned_orders,
             (select count(*) from app.orders o where o.agency_id = $1 and o.status = 'delivery_failed')::text as delivery_failures,
             (select percentile_cont(0.5) within group (order by extract(epoch from (o.accepted_at - o.placed_at)) / 60)
                from app.orders o where o.agency_id = $1 and o.accepted_at >= boundaries.current_start and o.placed_at is not null)::text as median_acceptance_minutes,
             (select percentile_cont(0.5) within group (order by extract(epoch from (o.delivered_at - o.placed_at)) / 60)
                from app.orders o where o.agency_id = $1 and o.delivered_at >= boundaries.current_start and o.placed_at is not null)::text as median_delivery_minutes,
             (select count(*) from app.commercial_accounts account where account.agency_id = $1 and account.status in ('open', 'suspended'))::text as account_count,
             (select count(*) from app.commercial_accounts account where account.agency_id = $1 and account.payment_mode = 'credit' and account.status in ('open', 'suspended'))::text as credit_account_count,
             (select coalesce(sum(credit.credit_limit), 0) from app.credit_accounts credit join app.commercial_accounts account on account.id = credit.commercial_account_id where account.agency_id = $1 and credit.status in ('approved', 'suspended'))::text as approved_credit_limit,
             (select coalesce(sum(invoice.outstanding_amount), 0) from app.invoices invoice join app.commercial_accounts account on account.id = invoice.commercial_account_id where account.agency_id = $1 and invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0)::text as outstanding,
             (select coalesce(sum(invoice.outstanding_amount), 0) from app.invoices invoice join app.commercial_accounts account on account.id = invoice.commercial_account_id where account.agency_id = $1 and invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0 and invoice.due_at < now())::text as overdue,
             (select count(*) from app.invoices invoice join app.commercial_accounts account on account.id = invoice.commercial_account_id where account.agency_id = $1 and invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0)::text as open_invoice_count,
             (select count(*) from app.delivery_staff staff where staff.agency_id = $1 and staff.status <> 'archived')::text as staff_total,
             (select count(*) from app.delivery_staff staff where staff.agency_id = $1 and staff.status = 'active')::text as staff_active,
             (select count(distinct o.assigned_delivery_staff_id) from app.orders o where o.agency_id = $1 and o.assigned_delivery_staff_id is not null and o.status in ('assigned', 'out_for_delivery'))::text as staff_with_drops
           from boundaries`,
          [agency.id],
        ),
        options.pool.query<{ status: string; count: string; value: string; cylinders: string }>(
          `with boundaries as (${boundaries})
           select o.status, count(*)::text as count,
                  coalesce(sum(o.total_amount), 0)::text as value,
                  coalesce(sum(item.cylinders), 0)::text as cylinders
             from app.orders o
             cross join boundaries
             left join lateral (
               select coalesce(sum(order_item.quantity), 0)::int as cylinders
                 from app.order_items order_item where order_item.order_id = o.id
             ) item on true
            where o.agency_id = $1 and o.created_at >= boundaries.current_start
            group by o.status order by count(*) desc, o.status`,
          [agency.id],
        ),
        options.pool.query<{ public_id: string; code: string; display_name: string; full_on_hand: number; reserved_full: number; available_full: number; empty_on_hand: number; with_accounts: number; low_stock_threshold: number }>(
          `select inventory.public_id::text, cylinder.code, cylinder.display_name,
                  inventory.full_on_hand, inventory.reserved_full,
                  inventory.full_on_hand - inventory.reserved_full as available_full,
                  inventory.empty_on_hand, inventory.with_accounts, inventory.low_stock_threshold
             from app.agency_inventory inventory
             join app.cylinder_types cylinder on cylinder.id = inventory.cylinder_type_id
            where inventory.agency_id = $1 order by cylinder.weight_kg`,
          [agency.id],
        ),
        options.pool.query<{ bucket_start: Date; orders: string; delivered: string; gmv: string }>(
          `with boundaries as (${boundaries}),
           buckets as (
             select generate_series(boundaries.current_start, now(), $2::interval) as bucket_start
               from boundaries
           )
           select bucket.bucket_start,
                  (select count(*) from app.orders o where o.agency_id = $1 and o.created_at >= bucket.bucket_start and o.created_at < bucket.bucket_start + $2::interval)::text as orders,
                  (select count(*) from app.orders o where o.agency_id = $1 and o.delivered_at >= bucket.bucket_start and o.delivered_at < bucket.bucket_start + $2::interval)::text as delivered,
                  (select coalesce(sum(o.total_amount), 0) from app.orders o where o.agency_id = $1 and o.created_at >= bucket.bucket_start and o.created_at < bucket.bucket_start + $2::interval)::text as gmv
             from buckets bucket order by bucket.bucket_start`,
          [agency.id, config.trendInterval],
        ),
        options.pool.query<{ kind: string; public_id: string; label: string; detail: string; severity: string; amount: string | null; occurred_at: Date }>(
          `select kind, public_id, label, detail, severity, amount, occurred_at
             from (
               select 'delivery_failure'::text as kind, o.public_id::text as public_id,
                      o.order_number as label, tenant.display_name || ' · delivery failed' as detail,
                      'critical'::text as severity, o.total_amount::text as amount,
                      coalesce(o.dispatched_at, o.created_at) as occurred_at, 1 as priority
                 from app.orders o join app.tenants tenant on tenant.id = o.tenant_id
                where o.agency_id = $1 and o.status = 'delivery_failed'
               union all
               select 'acceptance_delay', o.public_id::text, o.order_number,
                      tenant.display_name || ' · waiting ' || greatest(0, floor(extract(epoch from (now() - o.created_at)) / 60))::int || ' min for acceptance',
                      'warning', o.total_amount::text, o.created_at, 2
                 from app.orders o join app.tenants tenant on tenant.id = o.tenant_id
                where o.agency_id = $1 and o.status = 'placed' and o.created_at < now() - interval '30 minutes'
               union all
               select 'assignment_delay', o.public_id::text, o.order_number,
                      tenant.display_name || ' · accepted but not assigned',
                      'warning', o.total_amount::text, coalesce(o.accepted_at, o.created_at), 2
                 from app.orders o join app.tenants tenant on tenant.id = o.tenant_id
                where o.agency_id = $1 and o.status = 'accepted' and o.assigned_delivery_staff_id is null and o.accepted_at < now() - interval '30 minutes'
               union all
               select 'low_stock', inventory.public_id::text, cylinder.display_name,
                      (inventory.full_on_hand - inventory.reserved_full)::text || ' available · threshold ' || inventory.low_stock_threshold,
                      'critical', null::text, inventory.updated_at, 1
                 from app.agency_inventory inventory join app.cylinder_types cylinder on cylinder.id = inventory.cylinder_type_id
                where inventory.agency_id = $1 and inventory.full_on_hand - inventory.reserved_full <= inventory.low_stock_threshold
               union all
               select 'overdue_account', account.public_id::text, tenant.display_name,
                      count(invoice.id)::text || ' overdue invoice' || case when count(invoice.id) = 1 then '' else 's' end,
                      'critical', sum(invoice.outstanding_amount)::text, min(invoice.due_at), 1
                 from app.commercial_accounts account
                 join app.tenants tenant on tenant.id = account.tenant_id
                 join app.invoices invoice on invoice.commercial_account_id = account.id
                where account.agency_id = $1 and invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0 and invoice.due_at < now()
                group by account.id, tenant.id
             ) exception
            order by priority, occurred_at nulls last
            limit 12`,
          [agency.id],
        ),
        options.pool.query<{ public_id: string; order_public_id: string; order_number: string; to_status: string; actor_name: string | null; reason: string | null; occurred_at: Date }>(
          `select event.public_id::text, o.public_id::text as order_public_id, o.order_number,
                  event.to_status, actor.full_name as actor_name, event.reason, event.occurred_at
             from app.order_status_events event
             join app.orders o on o.id = event.order_id
             left join app.users actor on actor.id = event.actor_user_id
            where o.agency_id = $1
            order by event.occurred_at desc, event.id desc limit 10`,
          [agency.id],
        ),
      ]);

      const summary = summaryResult.rows[0]!;
      const inventory = inventoryResult.rows.map((row) => ({
        publicId: row.public_id,
        cylinderTypeCode: row.code,
        displayName: row.display_name,
        fullOnHand: row.full_on_hand,
        reservedFull: row.reserved_full,
        availableFull: row.available_full,
        emptyOnHand: row.empty_on_hand,
        withAccounts: row.with_accounts,
        lowStockThreshold: row.low_stock_threshold,
      }));

      response.status(200).json({
        period: parsed.data.period,
        periodLabel: config.label,
        timezone: "Asia/Kolkata",
        window: { currentStart: summary.current_start.toISOString(), previousStart: summary.previous_start.toISOString(), currentEnd: new Date().toISOString() },
        agency: { publicId: agency.public_id, displayName: agency.display_name, city: agency.city, creditEnabled: agency.credit_enabled },
        performance: {
          current: { orders: number(summary.orders_current), gmv: summary.gmv_current, cylinders: number(summary.cylinders_current), delivered: number(summary.delivered_current), deliveredValue: summary.delivered_value_current, collections: summary.collections_current },
          previous: { orders: number(summary.orders_previous), gmv: summary.gmv_previous, cylinders: number(summary.cylinders_previous), delivered: number(summary.delivered_previous), deliveredValue: summary.delivered_value_previous, collections: summary.collections_previous },
        },
        fulfillment: {
          active: number(summary.active_fulfillment),
          awaitingAcceptance: number(summary.unaccepted_orders),
          awaitingAssignment: number(summary.unassigned_orders),
          deliveryFailures: number(summary.delivery_failures),
          medianAcceptanceMinutes: summary.median_acceptance_minutes === null ? null : number(summary.median_acceptance_minutes),
          medianDeliveryMinutes: summary.median_delivery_minutes === null ? null : number(summary.median_delivery_minutes),
        },
        accounts: {
          total: number(summary.account_count),
          credit: number(summary.credit_account_count),
          approvedCreditLimit: summary.approved_credit_limit,
          outstanding: summary.outstanding,
          overdue: summary.overdue,
          openInvoices: number(summary.open_invoice_count),
        },
        staff: { total: number(summary.staff_total), active: number(summary.staff_active), withActiveDrops: number(summary.staff_with_drops) },
        inventory: {
          fullOnHand: inventory.reduce((sum, item) => sum + item.fullOnHand, 0),
          availableFull: inventory.reduce((sum, item) => sum + item.availableFull, 0),
          reservedFull: inventory.reduce((sum, item) => sum + item.reservedFull, 0),
          emptyOnHand: inventory.reduce((sum, item) => sum + item.emptyOnHand, 0),
          withAccounts: inventory.reduce((sum, item) => sum + item.withAccounts, 0),
          lowStockItems: inventory.filter((item) => item.availableFull <= item.lowStockThreshold).length,
          items: inventory,
        },
        orderStates: statesResult.rows.map((row) => ({ status: row.status, count: number(row.count), value: row.value, cylinders: number(row.cylinders) })),
        trend: trendResult.rows.map((row) => ({ bucketStart: row.bucket_start.toISOString(), orders: number(row.orders), delivered: number(row.delivered), gmv: row.gmv })),
        exceptions: exceptionsResult.rows.map((row) => ({ kind: row.kind, publicId: row.public_id, label: row.label, detail: row.detail, severity: row.severity, amount: row.amount, occurredAt: row.occurred_at.toISOString() })),
        recentActivity: activityResult.rows.map((row) => ({ publicId: row.public_id, orderPublicId: row.order_public_id, orderNumber: row.order_number, toStatus: row.to_status, actorName: row.actor_name, reason: row.reason, occurredAt: row.occurred_at.toISOString() })),
      });
    } catch (error) { next(error); }
  });

  return router;
}
