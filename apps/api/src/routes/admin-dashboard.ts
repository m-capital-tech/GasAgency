import type pg from "pg";
import { Router } from "express";
import { z } from "zod";
import { platformReportingParams, platformReportingScope, scopedTenantsSql } from "../domain/platform-reporting";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { hasPermission, hasRoleType } from "../security/rbac";

const querySchema = z.object({ period: z.enum(["daily", "weekly", "monthly"]).default("daily") });
const periodSql = {
  daily: { unit: "day", interval: "1 day", label: "Today" },
  weekly: { unit: "week", interval: "1 week", label: "This week" },
  monthly: { unit: "month", interval: "1 month", label: "This month" },
} as const;

interface SummaryRow {
  period_start: Date;
  previous_start: Date;
  orders_current: string;
  orders_previous: string;
  gmv_current: string;
  gmv_previous: string;
  cylinders_current: string;
  cylinders_previous: string;
  delivered_current: string;
  delivered_previous: string;
  collections_current: string;
  collections_previous: string;
  active_tenants: string;
  active_agencies: string;
  tenant_drafts: string;
  pending_approvals: string;
  sla_breaches: string;
  approvals_current: string;
  rejections_current: string;
  invitations_current: string;
  first_logins_current: string;
  first_orders_current: string;
  credit_limit: string;
  credit_outstanding: string;
  credit_overdue: string;
  overdue_accounts: string;
  low_stock_agencies: string;
  delivery_failures: string;
  messaging_failures: string;
}

function number(value: string | number | null): number {
  return Number(value ?? 0);
}

export function adminDashboardRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.get("/admin/dashboard", async (request, response, next) => {
    try {
      const parsed = querySchema.parse(request.query);
      const principal = authenticatedPrincipal(response);
      const scope = platformReportingScope(principal, "report.view");
      const params = platformReportingParams(scope);
      const config = periodSql[parsed.period];
      const boundariesSql = `boundaries as (
        select current_start,
               current_start - interval '${config.interval}' as previous_start,
               now() as current_end
          from (select date_trunc('${config.unit}', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as current_start) value
      )`;

      const [summaryResult, statusResult, agencyResult, agingResult] = await Promise.all([
        options.pool.query<SummaryRow>(
          `with ${scopedTenantsSql}, ${boundariesSql},
           scoped_agencies as materialized (
             select distinct agency.id
               from app.agencies agency
              where $1::boolean
                 or exists (
                   select 1 from app.agency_assignments assignment
                   join scoped_tenants scoped on scoped.id = assignment.tenant_id
                    where assignment.agency_id = agency.id and assignment.ends_at is null
                 )
           ), scoped_orders as materialized (
             select order_row.* from app.orders order_row join scoped_tenants scoped on scoped.id = order_row.tenant_id
           )
           select boundaries.current_start as period_start,
                  boundaries.previous_start,
                  count(*) filter (where orders.created_at >= boundaries.current_start and orders.status not in ('payment_failed', 'rejected', 'cancelled'))::text as orders_current,
                  count(*) filter (where orders.created_at >= boundaries.previous_start and orders.created_at < boundaries.current_start and orders.status not in ('payment_failed', 'rejected', 'cancelled'))::text as orders_previous,
                  coalesce(sum(orders.total_amount) filter (where orders.created_at >= boundaries.current_start and orders.status not in ('payment_failed', 'rejected', 'cancelled')), 0)::text as gmv_current,
                  coalesce(sum(orders.total_amount) filter (where orders.created_at >= boundaries.previous_start and orders.created_at < boundaries.current_start and orders.status not in ('payment_failed', 'rejected', 'cancelled')), 0)::text as gmv_previous,
                  coalesce((select sum(item.quantity) from app.order_items item join scoped_orders order_row on order_row.id = item.order_id where order_row.created_at >= boundaries.current_start and order_row.status not in ('payment_failed', 'rejected', 'cancelled')), 0)::text as cylinders_current,
                  coalesce((select sum(item.quantity) from app.order_items item join scoped_orders order_row on order_row.id = item.order_id where order_row.created_at >= boundaries.previous_start and order_row.created_at < boundaries.current_start and order_row.status not in ('payment_failed', 'rejected', 'cancelled')), 0)::text as cylinders_previous,
                  count(*) filter (where orders.delivered_at >= boundaries.current_start and orders.status = 'delivered')::text as delivered_current,
                  count(*) filter (where orders.delivered_at >= boundaries.previous_start and orders.delivered_at < boundaries.current_start and orders.status = 'delivered')::text as delivered_previous,
                  coalesce((select sum(payment.amount) from app.payment_collections payment join scoped_tenants scoped on scoped.id = payment.tenant_id where payment.received_at >= boundaries.current_start), 0)::text as collections_current,
                  coalesce((select sum(payment.amount) from app.payment_collections payment join scoped_tenants scoped on scoped.id = payment.tenant_id where payment.received_at >= boundaries.previous_start and payment.received_at < boundaries.current_start), 0)::text as collections_previous,
                  (select count(*) from app.tenants tenant join scoped_tenants scoped on scoped.id = tenant.id where tenant.status = 'active')::text as active_tenants,
                  (select count(*) from app.agencies agency join scoped_agencies scoped on scoped.id = agency.id where agency.status = 'approved')::text as active_agencies,
                  (select count(*) from app.tenants tenant join scoped_tenants scoped on scoped.id = tenant.id where tenant.status in ('draft', 'changes_requested'))::text as tenant_drafts,
                  (select count(*) from app.tenants tenant join scoped_tenants scoped on scoped.id = tenant.id where tenant.status = 'pending_approval')::text as pending_approvals,
                  (select count(*) from app.tenants tenant join scoped_tenants scoped on scoped.id = tenant.id where tenant.status = 'pending_approval' and tenant.submitted_at < now() - interval '24 hours')::text as sla_breaches,
                  (select count(*) from app.tenants tenant join scoped_tenants scoped on scoped.id = tenant.id where tenant.approved_at >= boundaries.current_start)::text as approvals_current,
                  (select count(*) from app.tenant_reviews review join scoped_tenants scoped on scoped.id = review.tenant_id where review.created_at >= boundaries.current_start and review.decision = 'rejected')::text as rejections_current,
                  (select count(*) from app.invitations invitation join scoped_tenants scoped on scoped.id = invitation.tenant_id where invitation.created_at >= boundaries.current_start)::text as invitations_current,
                  (select count(distinct invitation.tenant_id) from app.invitations invitation join scoped_tenants scoped on scoped.id = invitation.tenant_id where invitation.completed_at >= boundaries.current_start)::text as first_logins_current,
                  (select count(*) from scoped_tenants scoped where (select min(first_order.created_at) from app.orders first_order where first_order.tenant_id = scoped.id) >= boundaries.current_start)::text as first_orders_current,
                  coalesce((select sum(credit.credit_limit) from app.credit_accounts credit join app.commercial_accounts account on account.id = credit.commercial_account_id join scoped_tenants scoped on scoped.id = account.tenant_id where credit.status in ('approved', 'suspended')), 0)::text as credit_limit,
                  coalesce((select sum(invoice.outstanding_amount) from app.invoices invoice join scoped_tenants scoped on scoped.id = invoice.tenant_id where invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0), 0)::text as credit_outstanding,
                  coalesce((select sum(invoice.outstanding_amount) from app.invoices invoice join scoped_tenants scoped on scoped.id = invoice.tenant_id where invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0 and invoice.due_at < now()), 0)::text as credit_overdue,
                  (select count(distinct invoice.commercial_account_id) from app.invoices invoice join scoped_tenants scoped on scoped.id = invoice.tenant_id where invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0 and invoice.due_at < now())::text as overdue_accounts,
                  (select count(distinct inventory.agency_id) from app.agency_inventory inventory join scoped_agencies scoped on scoped.id = inventory.agency_id where inventory.full_on_hand - inventory.reserved_full <= inventory.low_stock_threshold)::text as low_stock_agencies,
                  count(*) filter (where orders.created_at >= boundaries.current_start and orders.status = 'delivery_failed')::text as delivery_failures,
                  (select count(*) from app.message_deliveries delivery join app.invitations invitation on invitation.public_id = delivery.aggregate_public_id join scoped_tenants scoped on scoped.id = invitation.tenant_id where delivery.created_at >= boundaries.current_start and delivery.status = 'failed')::text as messaging_failures
             from boundaries left join scoped_orders orders on orders.created_at >= boundaries.previous_start
            group by boundaries.current_start, boundaries.previous_start`,
          params,
        ),
        options.pool.query<{ status: string; count: string; value: string; cylinders: string }>(
          `with ${scopedTenantsSql}, ${boundariesSql}
           select order_row.status,
                  count(*)::text,
                  coalesce(sum(order_row.total_amount), 0)::text as value,
                  coalesce(sum(items.quantity), 0)::text as cylinders
             from app.orders order_row
             join scoped_tenants scoped on scoped.id = order_row.tenant_id
             cross join boundaries
             left join lateral (select sum(item.quantity) as quantity from app.order_items item where item.order_id = order_row.id) items on true
            where order_row.created_at >= boundaries.current_start
            group by order_row.status
            order by count(*) desc, order_row.status`,
          params,
        ),
        options.pool.query<{ public_id: string; display_name: string; city: string; orders: string; gmv: string; delivered: string; backlog: string; failures: string; median_acceptance_minutes: string | null; low_stock_items: string }>(
          `with ${scopedTenantsSql}, ${boundariesSql},
           scoped_agencies as materialized (
             select distinct agency.id, agency.public_id, agency.display_name, agency.city
               from app.agencies agency
              where $1::boolean or exists (
                select 1 from app.agency_assignments assignment join scoped_tenants scoped on scoped.id = assignment.tenant_id
                 where assignment.agency_id = agency.id and assignment.ends_at is null
              )
           )
           select agency.public_id::text, agency.display_name, agency.city,
                  count(distinct order_row.id)::text as orders,
                  coalesce(sum(order_row.total_amount) filter (where order_row.status not in ('payment_failed', 'rejected', 'cancelled')), 0)::text as gmv,
                  count(*) filter (where order_row.status = 'delivered')::text as delivered,
                  count(*) filter (where order_row.status in ('placed', 'accepted', 'assigned', 'out_for_delivery', 'delivery_failed'))::text as backlog,
                  count(*) filter (where order_row.status = 'delivery_failed')::text as failures,
                  (percentile_cont(0.5) within group (order by extract(epoch from (order_row.accepted_at - order_row.created_at)) / 60.0) filter (where order_row.accepted_at is not null))::text as median_acceptance_minutes,
                  (select count(*) from app.agency_inventory inventory where inventory.agency_id = agency.id and inventory.full_on_hand - inventory.reserved_full <= inventory.low_stock_threshold)::text as low_stock_items
             from scoped_agencies agency
             cross join boundaries
             left join app.orders order_row on order_row.agency_id = agency.id and order_row.created_at >= boundaries.current_start
            group by agency.id, agency.public_id, agency.display_name, agency.city
            order by count(distinct order_row.id) desc, agency.display_name
            limit 20`,
          params,
        ),
        options.pool.query<{ current: string; days_1_30: string; days_31_60: string; days_61_90: string; days_90_plus: string }>(
          `with ${scopedTenantsSql}
           select coalesce(sum(invoice.outstanding_amount) filter (where invoice.due_at is null or invoice.due_at >= now()), 0)::text as current,
                  coalesce(sum(invoice.outstanding_amount) filter (where invoice.due_at < now() and invoice.due_at >= now() - interval '30 days'), 0)::text as days_1_30,
                  coalesce(sum(invoice.outstanding_amount) filter (where invoice.due_at < now() - interval '30 days' and invoice.due_at >= now() - interval '60 days'), 0)::text as days_31_60,
                  coalesce(sum(invoice.outstanding_amount) filter (where invoice.due_at < now() - interval '60 days' and invoice.due_at >= now() - interval '90 days'), 0)::text as days_61_90,
                  coalesce(sum(invoice.outstanding_amount) filter (where invoice.due_at < now() - interval '90 days'), 0)::text as days_90_plus
             from app.invoices invoice join scoped_tenants scoped on scoped.id = invoice.tenant_id
            where invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0`,
          params,
        ),
      ]);

      const summary = summaryResult.rows[0]!;
      const superAdmin = hasRoleType(principal, "super_admin");
      const canSeeAudit = hasPermission(principal, "audit.view");
      const [activityResult, systemResult] = await Promise.all([
        canSeeAudit
          ? options.pool.query<{ public_id: string; action: string; entity_type: string; entity_public_id: string | null; actor_name: string | null; actor_role: string | null; reason: string | null; occurred_at: Date }>(
              `with ${scopedTenantsSql}
               select audit.public_id::text, audit.action, audit.entity_type, audit.entity_public_id::text,
                      actor.full_name as actor_name, audit.actor_role, audit.reason, audit.occurred_at
                 from app.audit_events audit
                 left join app.users actor on actor.id = audit.actor_user_id
                where $1::boolean
                   or audit.actor_user_id = $6
                   or (audit.entity_type = 'tenant' and audit.entity_public_id in (select public_id from scoped_tenants))
                   or (audit.entity_type = 'order' and exists (select 1 from app.orders order_row join scoped_tenants scoped on scoped.id = order_row.tenant_id where order_row.public_id = audit.entity_public_id))
                order by audit.occurred_at desc, audit.id desc
                limit 20`,
              [...params, principal.userId],
            )
          : Promise.resolve({ rows: [] }),
        superAdmin && hasPermission(principal, "system.view")
          ? options.pool.query<{ queued_jobs: string; failed_jobs: string; active_sessions: string; suspended_users: string }>(
              `select
                 (select count(*) from app.outbox_events where processed_at is null and available_at <= now())::text as queued_jobs,
                 (select count(*) from app.outbox_events where processed_at is null and last_error is not null)::text as failed_jobs,
                 (select count(*) from app.device_sessions where revoked_at is null and expires_at > now())::text as active_sessions,
                 (select count(*) from app.users where status = 'suspended')::text as suspended_users`,
            )
          : Promise.resolve({ rows: [] }),
      ]);

      response.status(200).json({
        period: parsed.period,
        periodLabel: config.label,
        timezone: "Asia/Kolkata",
        audience: superAdmin ? "super_admin" : "platform_operations",
        scope: { global: scope.global, regions: scope.regions, cities: scope.cities, agencyCount: scope.agencyPublicIds.length, tenantCount: scope.tenantPublicIds.length },
        window: { currentStart: summary.period_start.toISOString(), previousStart: summary.previous_start.toISOString(), currentEnd: new Date().toISOString() },
        performance: {
          current: { orders: number(summary.orders_current), gmv: summary.gmv_current, cylinders: number(summary.cylinders_current), delivered: number(summary.delivered_current), collections: summary.collections_current },
          previous: { orders: number(summary.orders_previous), gmv: summary.gmv_previous, cylinders: number(summary.cylinders_previous), delivered: number(summary.delivered_previous), collections: summary.collections_previous },
        },
        footprint: { activeTenants: number(summary.active_tenants), activeAgencies: number(summary.active_agencies) },
        onboarding: { drafts: number(summary.tenant_drafts), pendingApprovals: number(summary.pending_approvals), approvalSlaBreaches: number(summary.sla_breaches), approvals: number(summary.approvals_current), rejections: number(summary.rejections_current), invitations: number(summary.invitations_current), firstLogins: number(summary.first_logins_current), firstOrders: number(summary.first_orders_current) },
        credit: { approvedLimit: summary.credit_limit, outstanding: summary.credit_outstanding, overdue: summary.credit_overdue, overdueAccounts: number(summary.overdue_accounts), aging: agingResult.rows[0] ?? { current: "0", days_1_30: "0", days_31_60: "0", days_61_90: "0", days_90_plus: "0" } },
        attention: { approvalSlaBreaches: number(summary.sla_breaches), lowStockAgencies: number(summary.low_stock_agencies), overdueAccounts: number(summary.overdue_accounts), deliveryFailures: number(summary.delivery_failures), messagingFailures: number(summary.messaging_failures) },
        orderStates: statusResult.rows.map((row) => ({ status: row.status, count: number(row.count), value: row.value, cylinders: number(row.cylinders) })),
        agencies: agencyResult.rows.map((row) => ({ publicId: row.public_id, displayName: row.display_name, city: row.city, orders: number(row.orders), gmv: row.gmv, delivered: number(row.delivered), backlog: number(row.backlog), failures: number(row.failures), medianAcceptanceMinutes: row.median_acceptance_minutes === null ? null : number(row.median_acceptance_minutes), lowStockItems: number(row.low_stock_items) })),
        recentActivity: activityResult.rows.map((row) => ({ publicId: row.public_id, action: row.action, entityType: row.entity_type, entityPublicId: row.entity_public_id, actorName: row.actor_name, actorRole: row.actor_role, reason: row.reason, occurredAt: row.occurred_at.toISOString() })),
        systemHealth: systemResult.rows[0] ? { queuedJobs: number(systemResult.rows[0].queued_jobs), failedJobs: number(systemResult.rows[0].failed_jobs), activeSessions: number(systemResult.rows[0].active_sessions), suspendedUsers: number(systemResult.rows[0].suspended_users) } : null,
        dataCoverage: { platformRevenue: "not_configured", supportCases: "not_configured", forecasts: "not_configured" },
      });
    } catch (error) { next(error); }
  });

  return router;
}
