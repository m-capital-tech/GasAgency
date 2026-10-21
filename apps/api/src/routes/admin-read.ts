import type pg from "pg";
import { Router } from "express";
import type { AuthPrincipal } from "@platform/database";
import { z } from "zod";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { hasPermission, hasRoleType, isAuthorized } from "../security/rbac";

const tenantStatuses = ["draft", "pending_approval", "changes_requested", "rejected", "active", "suspended", "archived"] as const;
const tenantListSchema = z.object({
  status: z.enum(tenantStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(500).optional(),
});
const publicId = z.string().uuid();

interface PermissionScope {
  global: boolean;
  regions: string[];
  cities: string[];
  agencyPublicIds: string[];
  tenantPublicIds: string[];
}

function scopeFor(principal: AuthPrincipal, permission: string): PermissionScope {
  const assignments = principal.assignments.filter((assignment) => assignment.permissions.includes(permission));
  const agencyPublicIds = new Set<string>();
  const regions = new Set<string>();
  const cities = new Set<string>();
  const tenantPublicIds = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.scopeKind === "region" && assignment.scopeValue) regions.add(assignment.scopeValue.toLocaleLowerCase("en-IN"));
    if (assignment.scopeKind === "city" && assignment.scopeValue) cities.add(assignment.scopeValue.toLocaleLowerCase("en-IN"));
    if (assignment.scopeKind === "agency" && assignment.scopeValue) agencyPublicIds.add(assignment.scopeValue);
    if (assignment.scopeKind === "tenant" && assignment.scopeValue) tenantPublicIds.add(assignment.scopeValue);
    assignment.agencyPublicIds.forEach((id) => agencyPublicIds.add(id));
  }
  return {
    global: assignments.some((assignment) => assignment.scopeKind === "global"),
    regions: [...regions], cities: [...cities], agencyPublicIds: [...agencyPublicIds], tenantPublicIds: [...tenantPublicIds],
  };
}

function requirePermissionScope(principal: AuthPrincipal, permission: string): PermissionScope {
  if (!hasPermission(principal, permission)) throw new HttpError(403, "permission_denied", `The ${permission} permission is required.`);
  return scopeFor(principal, permission);
}

function tenantScopeParams(scope: PermissionScope): [boolean, string[], string[], string[], string[]] {
  return [scope.global, scope.regions, scope.cities, scope.agencyPublicIds, scope.tenantPublicIds];
}

const tenantScopeSql = `(
  $1::boolean
  or lower(outlet.state_code) = any($2::text[])
  or lower(outlet.city) = any($3::text[])
  or agency.public_id = any($4::uuid[])
  or tenant.public_id = any($5::uuid[])
)`;

function encodeCursor(createdAt: Date, tenantPublicId: string) {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), tenantPublicId }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined): { createdAt: string; tenantPublicId: string } | null {
  if (!cursor) return null;
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return z.object({ createdAt: z.string().datetime(), tenantPublicId: z.string().uuid() }).parse(value);
  } catch {
    throw new HttpError(400, "invalid_cursor", "The pagination cursor is invalid.");
  }
}

export function adminReadRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.get("/admin/overview", async (_request, response, next) => {
    try {
      const principal = authenticatedPrincipal(response);
      const scope = requirePermissionScope(principal, "report.view");
      const row = (await options.pool.query<{
        tenants_total: string; tenants_active: string; pending_approvals: string; changes_requested: string;
        pending_credit_decisions: string; approval_sla_breaches: string; orders_today: string; orders_week: string;
        orders_month: string; gmv_today: string; gmv_week: string; gmv_month: string; delivered_today: string;
        open_receivables: string; overdue_receivables: string;
      }>(
        `with scoped_tenants as materialized (
           select distinct tenant.id
             from app.tenants tenant
             join lateral (
               select candidate.city, candidate.state_code from app.outlets candidate
                where candidate.tenant_id = tenant.id order by candidate.id limit 1
             ) outlet on true
             join app.agency_assignments assignment on assignment.tenant_id = tenant.id and assignment.ends_at is null
             join app.agencies agency on agency.id = assignment.agency_id
            where ${tenantScopeSql}
         ), boundaries as (
           select
             date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as day_start,
             date_trunc('week', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as week_start,
             date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' as month_start
         )
         select
           (select count(*) from scoped_tenants)::text as tenants_total,
           (select count(*) from app.tenants tenant join scoped_tenants scoped on scoped.id = tenant.id where tenant.status = 'active')::text as tenants_active,
           (select count(*) from app.tenants tenant join scoped_tenants scoped on scoped.id = tenant.id where tenant.status = 'pending_approval')::text as pending_approvals,
           (select count(*) from app.tenants tenant join scoped_tenants scoped on scoped.id = tenant.id where tenant.status = 'changes_requested')::text as changes_requested,
           (select count(*) from app.tenant_commercial_proposals proposal join scoped_tenants scoped on scoped.id = proposal.tenant_id where proposal.decision_status = 'pending')::text as pending_credit_decisions,
           (select count(*) from app.tenants tenant join scoped_tenants scoped on scoped.id = tenant.id where tenant.status = 'pending_approval' and tenant.submitted_at < now() - interval '24 hours')::text as approval_sla_breaches,
           (select count(*) from app.orders order_row join scoped_tenants scoped on scoped.id = order_row.tenant_id cross join boundaries where order_row.created_at >= boundaries.day_start and order_row.status not in ('payment_failed', 'rejected', 'cancelled'))::text as orders_today,
           (select count(*) from app.orders order_row join scoped_tenants scoped on scoped.id = order_row.tenant_id cross join boundaries where order_row.created_at >= boundaries.week_start and order_row.status not in ('payment_failed', 'rejected', 'cancelled'))::text as orders_week,
           (select count(*) from app.orders order_row join scoped_tenants scoped on scoped.id = order_row.tenant_id cross join boundaries where order_row.created_at >= boundaries.month_start and order_row.status not in ('payment_failed', 'rejected', 'cancelled'))::text as orders_month,
           (select coalesce(sum(order_row.total_amount), 0) from app.orders order_row join scoped_tenants scoped on scoped.id = order_row.tenant_id cross join boundaries where order_row.created_at >= boundaries.day_start and order_row.status not in ('payment_failed', 'rejected', 'cancelled'))::text as gmv_today,
           (select coalesce(sum(order_row.total_amount), 0) from app.orders order_row join scoped_tenants scoped on scoped.id = order_row.tenant_id cross join boundaries where order_row.created_at >= boundaries.week_start and order_row.status not in ('payment_failed', 'rejected', 'cancelled'))::text as gmv_week,
           (select coalesce(sum(order_row.total_amount), 0) from app.orders order_row join scoped_tenants scoped on scoped.id = order_row.tenant_id cross join boundaries where order_row.created_at >= boundaries.month_start and order_row.status not in ('payment_failed', 'rejected', 'cancelled'))::text as gmv_month,
           (select count(*) from app.orders order_row join scoped_tenants scoped on scoped.id = order_row.tenant_id cross join boundaries where order_row.delivered_at >= boundaries.day_start and order_row.status = 'delivered')::text as delivered_today,
           (select coalesce(sum(invoice.outstanding_amount), 0) from app.invoices invoice join scoped_tenants scoped on scoped.id = invoice.tenant_id where invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0)::text as open_receivables,
           (select coalesce(sum(invoice.outstanding_amount), 0) from app.invoices invoice join scoped_tenants scoped on scoped.id = invoice.tenant_id where invoice.status in ('open', 'overdue') and invoice.outstanding_amount > 0 and invoice.due_at < now())::text as overdue_receivables`,
        tenantScopeParams(scope),
      )).rows[0]!;
      response.status(200).json({
        timezone: "Asia/Kolkata",
        onboarding: { total: Number(row.tenants_total), active: Number(row.tenants_active), pendingApprovals: Number(row.pending_approvals), changesRequested: Number(row.changes_requested), pendingCreditDecisions: Number(row.pending_credit_decisions), approvalSlaBreaches: Number(row.approval_sla_breaches) },
        today: { orders: Number(row.orders_today), gmv: row.gmv_today, delivered: Number(row.delivered_today) },
        week: { orders: Number(row.orders_week), gmv: row.gmv_week },
        month: { orders: Number(row.orders_month), gmv: row.gmv_month },
        receivables: { open: row.open_receivables, overdue: row.overdue_receivables },
      });
    } catch (error) { next(error); }
  });

  router.get("/admin/agencies", async (_request, response, next) => {
    try {
      const principal = authenticatedPrincipal(response);
      const permission = hasPermission(principal, "agency.view") ? "agency.view" : "tenant.create";
      const scope = requirePermissionScope(principal, permission);
      const rows = await options.pool.query<{ public_id: string; display_name: string; legal_name: string; gstin: string; phone_e164: string; city: string; state_code: string; credit_enabled: boolean; status: string }>(
        `select agency.public_id::text, agency.display_name, agency.legal_name, agency.gstin,
                agency.phone_e164, agency.city, agency.state_code, agency.credit_enabled, agency.status
           from app.agencies agency
          where agency.status = 'approved'
            and ($1::boolean or lower(agency.state_code) = any($2::text[]) or lower(agency.city) = any($3::text[]) or agency.public_id = any($4::uuid[]))
          order by agency.display_name, agency.public_id`,
        [scope.global, scope.regions, scope.cities, scope.agencyPublicIds],
      );
      response.status(200).json({ agencies: rows.rows.map((row) => ({ publicId: row.public_id, displayName: row.display_name, legalName: row.legal_name, gstin: row.gstin, phoneE164: row.phone_e164, city: row.city, stateCode: row.state_code, creditEnabled: row.credit_enabled, status: row.status })) });
    } catch (error) { next(error); }
  });

  router.get("/admin/tenants", async (request, response, next) => {
    try {
      const parsed = tenantListSchema.safeParse(request.query);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The tenant-list filters are invalid.", parsed.error.flatten());
      const principal = authenticatedPrincipal(response);
      const scope = requirePermissionScope(principal, "tenant.view");
      const cursor = decodeCursor(parsed.data.cursor);
      const rows = await options.pool.query<{
        public_id: string; display_name: string; legal_name: string; business_type: string; gstin: string; status: string;
        created_at: Date; submitted_at: Date | null; city: string; owner_name: string; owner_phone_e164: string;
        agency_public_id: string; agency_display_name: string; requested_payment_mode: string; proposed_credit_limit: string | null;
        proposed_net_term_days: number | null; proposal_status: string; creator_name: string;
      }>(
        `select tenant.public_id::text, tenant.display_name, tenant.legal_name, tenant.business_type,
                tenant.gstin, tenant.status, tenant.created_at, tenant.submitted_at,
                outlet.city, owner_user.full_name as owner_name, owner_user.phone_e164 as owner_phone_e164,
                agency.public_id::text as agency_public_id, agency.display_name as agency_display_name,
                proposal.requested_payment_mode, proposal.proposed_credit_limit::text,
                proposal.proposed_net_term_days, proposal.decision_status as proposal_status,
                creator.full_name as creator_name
           from app.tenants tenant
           join app.users creator on creator.id = tenant.created_by_user_id
           join lateral (select candidate.id, candidate.city, candidate.state_code from app.outlets candidate where candidate.tenant_id = tenant.id order by candidate.id limit 1) outlet on true
           join app.tenant_memberships owner_membership on owner_membership.tenant_id = tenant.id and owner_membership.membership_type = 'owner'
           join app.users owner_user on owner_user.id = owner_membership.user_id
           join app.agency_assignments assignment on assignment.tenant_id = tenant.id and assignment.ends_at is null
           join app.agencies agency on agency.id = assignment.agency_id
           join app.tenant_commercial_proposals proposal on proposal.tenant_id = tenant.id
          where ${tenantScopeSql}
            and ($6::text is null or tenant.status = $6)
            and ($7::timestamptz is null or (tenant.created_at, tenant.public_id) < ($7::timestamptz, $8::uuid))
          order by tenant.created_at desc, tenant.public_id desc
          limit $9`,
        [...tenantScopeParams(scope), parsed.data.status ?? null, cursor?.createdAt ?? null, cursor?.tenantPublicId ?? null, parsed.data.limit + 1],
      );
      const hasMore = rows.rows.length > parsed.data.limit;
      const page = hasMore ? rows.rows.slice(0, parsed.data.limit) : rows.rows;
      const last = page.at(-1);
      response.status(200).json({
        tenants: page.map((row) => ({
          publicId: row.public_id, displayName: row.display_name, legalName: row.legal_name, businessType: row.business_type,
          gstin: row.gstin, status: row.status, createdAt: row.created_at.toISOString(), submittedAt: row.submitted_at?.toISOString() ?? null,
          city: row.city, owner: { fullName: row.owner_name, phoneE164: row.owner_phone_e164 },
          agency: { publicId: row.agency_public_id, displayName: row.agency_display_name }, creatorName: row.creator_name,
          commercialProposal: { requestedPaymentMode: row.requested_payment_mode, proposedCreditLimit: row.proposed_credit_limit, proposedNetTermDays: row.proposed_net_term_days, decisionStatus: row.proposal_status },
        })),
        nextCursor: hasMore && last ? encodeCursor(last.created_at, last.public_id) : null,
      });
    } catch (error) { next(error); }
  });

  router.get("/admin/tenants/:tenantPublicId", async (request, response, next) => {
    try {
      const id = publicId.safeParse(request.params.tenantPublicId);
      if (!id.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      const principal = authenticatedPrincipal(response);
      requirePermissionScope(principal, "tenant.view");
      const row = (await options.pool.query<{
        public_id: string; legal_name: string; display_name: string; business_type: string; gstin: string; fssai_number: string | null;
        alternate_phone_e164: string | null; internal_notes: string | null; status: string; created_at: Date; submitted_at: Date | null;
        approved_at: Date | null; suspended_at: Date | null; creator_name: string; creator_public_id: string; owner_public_id: string; owner_name: string;
        owner_phone_e164: string; owner_email: string | null; outlet_public_id: string; outlet_label: string; address_line_1: string;
        address_line_2: string | null; city: string; state_code: string; pincode: string; latitude: string; longitude: string;
        contact_name: string | null; contact_phone_e164: string | null; delivery_instructions: string | null;
        in_use_count: number; spare_full_count: number; empty_count: number; agency_public_id: string; agency_display_name: string;
        agency_legal_name: string; agency_credit_enabled: boolean; assignment_reason: string; assignment_status: string;
        requirement_period: string; preferred_delivery_days: number[]; preferred_slot: string | null; requirement_items: unknown[];
        proposal_public_id: string; requested_payment_mode: string; proposed_credit_limit: string | null; proposed_net_term_days: number | null;
        proposal_note: string | null; proposal_status: string; decision_note: string | null; reviews: unknown[];
        commercial_account_public_id: string | null; commercial_account_status: string | null; payment_mode: string | null;
        credit_account_public_id: string | null; credit_status: string | null; credit_limit: string | null;
        net_term_days: number | null; credit_suspended_at: Date | null; credit_decisions: unknown[];
        pending_credit_orders: string; outstanding_invoices: string; overdue_invoices: string;
      }>(
        `select tenant.public_id::text, tenant.legal_name, tenant.display_name, tenant.business_type,
                tenant.gstin, tenant.fssai_number, tenant.alternate_phone_e164, tenant.internal_notes,
                tenant.status, tenant.created_at, tenant.submitted_at, tenant.approved_at, tenant.suspended_at,
                creator.full_name as creator_name, creator.public_id::text as creator_public_id,
                owner_user.public_id::text as owner_public_id, owner_user.full_name as owner_name,
                owner_user.phone_e164 as owner_phone_e164, owner_user.email as owner_email,
                outlet.public_id::text as outlet_public_id, outlet.label as outlet_label,
                outlet.address_line_1, outlet.address_line_2, outlet.city, outlet.state_code, outlet.pincode,
                outlet.latitude::text, outlet.longitude::text, outlet.contact_name, outlet.contact_phone_e164,
                outlet.delivery_instructions, outlet.in_use_count, outlet.spare_full_count, outlet.empty_count,
                agency.public_id::text as agency_public_id, agency.display_name as agency_display_name,
                agency.legal_name as agency_legal_name, agency.credit_enabled as agency_credit_enabled,
                assignment.reason as assignment_reason, assignment.status as assignment_status,
                requirement.period as requirement_period, requirement.preferred_delivery_days,
                requirement.preferred_slot, coalesce(requirement_items.value, '[]'::jsonb) as requirement_items,
                proposal.public_id::text as proposal_public_id, proposal.requested_payment_mode,
                proposal.proposed_credit_limit::text, proposal.proposed_net_term_days, proposal.proposal_note,
                proposal.decision_status as proposal_status, proposal.decision_note,
                coalesce(reviews.value, '[]'::jsonb) as reviews,
                account.public_id::text as commercial_account_public_id,
                account.status as commercial_account_status, account.payment_mode,
                credit.public_id::text as credit_account_public_id, credit.status as credit_status,
                credit.credit_limit::text, credit.net_term_days, credit.suspended_at as credit_suspended_at,
                coalesce(credit_decisions.value, '[]'::jsonb) as credit_decisions,
                coalesce(exposure.pending_credit_orders, 0)::text as pending_credit_orders,
                coalesce(exposure.outstanding_invoices, 0)::text as outstanding_invoices,
                coalesce(exposure.overdue_invoices, 0)::text as overdue_invoices
           from app.tenants tenant
           join app.users creator on creator.id = tenant.created_by_user_id
           join app.tenant_memberships owner_membership on owner_membership.tenant_id = tenant.id and owner_membership.membership_type = 'owner'
           join app.users owner_user on owner_user.id = owner_membership.user_id
           join lateral (select candidate.* from app.outlets candidate where candidate.tenant_id = tenant.id order by candidate.id limit 1) outlet on true
           join app.tenant_requirements requirement on requirement.tenant_id = tenant.id and requirement.outlet_id = outlet.id
           join app.agency_assignments assignment on assignment.tenant_id = tenant.id and assignment.ends_at is null
           join app.agencies agency on agency.id = assignment.agency_id
           join app.tenant_commercial_proposals proposal on proposal.tenant_id = tenant.id
           left join lateral (
             select candidate.*
               from app.commercial_accounts candidate
              where candidate.tenant_id = tenant.id
              order by (candidate.status in ('open', 'suspended')) desc, candidate.created_at desc, candidate.id desc
              limit 1
           ) account on true
           left join app.credit_accounts credit on credit.commercial_account_id = account.id
           left join lateral (
             select jsonb_agg(jsonb_build_object('cylinderTypeCode', cylinder.code, 'displayName', cylinder.display_name, 'expectedQuantity', item.expected_quantity) order by cylinder.weight_kg) as value
               from app.tenant_requirement_items item join app.cylinder_types cylinder on cylinder.id = item.cylinder_type_id
              where item.tenant_requirement_id = requirement.id
           ) requirement_items on true
           left join lateral (
             select jsonb_agg(jsonb_build_object('publicId', review.public_id, 'decision', review.decision, 'fromStatus', review.from_status, 'toStatus', review.to_status, 'reason', review.reason, 'overrideUsed', review.override_used, 'reviewerName', reviewer.full_name, 'createdAt', review.created_at) order by review.created_at desc, review.id desc) as value
               from app.tenant_reviews review join app.users reviewer on reviewer.id = review.reviewer_user_id
              where review.tenant_id = tenant.id
           ) reviews on true
           left join lateral (
             select jsonb_agg(jsonb_build_object(
                      'publicId', decision.public_id,
                      'decision', decision.decision,
                      'previousLimit', decision.previous_limit::text,
                      'newLimit', decision.new_limit::text,
                      'previousNetTermDays', decision.previous_net_term_days,
                      'newNetTermDays', decision.new_net_term_days,
                      'reason', decision.reason,
                      'decidedByName', decider.full_name,
                      'createdAt', decision.created_at
                    ) order by decision.created_at desc, decision.id desc) as value
               from app.credit_decisions decision
               join app.users decider on decider.id = decision.decided_by_user_id
              where decision.credit_account_id = credit.id
           ) credit_decisions on true
           left join lateral (
             select
               coalesce((select sum(order_row.total_amount)
                           from app.orders order_row
                          where order_row.commercial_account_id = account.id
                            and order_row.payment_method = 'credit'
                            and order_row.status not in ('delivered', 'rejected', 'cancelled')), 0) as pending_credit_orders,
               coalesce((select sum(invoice.outstanding_amount)
                           from app.invoices invoice
                          where invoice.commercial_account_id = account.id
                            and invoice.status in ('open', 'overdue')
                            and invoice.outstanding_amount > 0), 0) as outstanding_invoices,
               (select count(*)
                  from app.invoices invoice
                 where invoice.commercial_account_id = account.id
                   and invoice.status in ('open', 'overdue')
                   and invoice.outstanding_amount > 0
                   and (invoice.status = 'overdue' or invoice.due_at < now())) as overdue_invoices
           ) exposure on account.id is not null
          where tenant.public_id = $1`,
        [id.data],
      )).rows[0];
      if (!row) throw new HttpError(404, "tenant_not_found", "The tenant was not found.");
      const target = { city: row.city, region: row.state_code, agencyPublicId: row.agency_public_id, tenantPublicId: row.public_id };
      if (!isAuthorized(principal, "tenant.view", target)) throw new HttpError(403, "permission_denied", "You do not have permission to view this tenant.");
      const canViewCredit = isAuthorized(principal, "credit.view", target)
        || isAuthorized(principal, "credit.approve", target)
        || isAuthorized(principal, "credit.suspend", target);
      const exposureTotal = Number(row.pending_credit_orders) + Number(row.outstanding_invoices);
      response.status(200).json({
        tenant: {
          publicId: row.public_id, legalName: row.legal_name, displayName: row.display_name, businessType: row.business_type,
          gstin: row.gstin, fssaiNumber: row.fssai_number, alternatePhoneE164: row.alternate_phone_e164, internalNotes: row.internal_notes,
          status: row.status, createdAt: row.created_at.toISOString(), submittedAt: row.submitted_at?.toISOString() ?? null,
          approvedAt: row.approved_at?.toISOString() ?? null, suspendedAt: row.suspended_at?.toISOString() ?? null,
          creator: { publicId: row.creator_public_id, fullName: row.creator_name },
          owner: { publicId: row.owner_public_id, fullName: row.owner_name, phoneE164: row.owner_phone_e164, email: row.owner_email },
          outlet: { publicId: row.outlet_public_id, label: row.outlet_label, addressLine1: row.address_line_1, addressLine2: row.address_line_2, city: row.city, stateCode: row.state_code, pincode: row.pincode, latitude: Number(row.latitude), longitude: Number(row.longitude), contactName: row.contact_name, contactPhoneE164: row.contact_phone_e164, deliveryInstructions: row.delivery_instructions, stock: { inUse: row.in_use_count, spareFull: row.spare_full_count, empty: row.empty_count } },
          agency: { publicId: row.agency_public_id, displayName: row.agency_display_name, legalName: row.agency_legal_name, creditEnabled: row.agency_credit_enabled, assignmentReason: row.assignment_reason, assignmentStatus: row.assignment_status },
          requirement: { period: row.requirement_period, preferredDeliveryDays: row.preferred_delivery_days, preferredSlot: row.preferred_slot, items: row.requirement_items },
          commercialProposal: { publicId: row.proposal_public_id, requestedPaymentMode: row.requested_payment_mode, proposedCreditLimit: row.proposed_credit_limit, proposedNetTermDays: row.proposed_net_term_days, proposalNote: row.proposal_note, decisionStatus: row.proposal_status, decisionNote: row.decision_note },
          commercialAccount: row.commercial_account_public_id ? {
            publicId: row.commercial_account_public_id,
            status: row.commercial_account_status,
            paymentMode: row.payment_mode,
            creditAccount: canViewCredit && row.credit_account_public_id ? {
              publicId: row.credit_account_public_id,
              status: row.credit_status,
              creditLimit: row.credit_limit,
              netTermDays: row.net_term_days,
              suspendedAt: row.credit_suspended_at?.toISOString() ?? null,
              exposure: {
                pendingOrders: row.pending_credit_orders,
                outstandingInvoices: row.outstanding_invoices,
                total: exposureTotal.toFixed(2),
                available: Math.max(0, Number(row.credit_limit ?? 0) - exposureTotal).toFixed(2),
                overdueInvoices: Number(row.overdue_invoices),
              },
              decisions: row.credit_decisions,
            } : null,
          } : null,
          reviews: row.reviews,
          capabilities: {
            canSubmit: isAuthorized(principal, "tenant.submit", target),
            canApprove: isAuthorized(principal, "tenant.approve", target) && row.creator_public_id !== principal.userPublicId,
            canOverrideApproval: hasRoleType(principal, "super_admin") && isAuthorized(principal, "tenant.approve", target),
            canReject: isAuthorized(principal, "tenant.reject", target),
            canApproveCredit: isAuthorized(principal, "credit.approve", target),
            canSuspendTenant: row.status === "active" && isAuthorized(principal, "tenant.suspend", target),
            canReinstateTenant: row.status === "suspended" && isAuthorized(principal, "tenant.suspend", target),
            canViewCredit,
            canApprovePostActivationCredit: ["active", "suspended"].includes(row.status)
              && !row.credit_account_public_id
              && row.agency_credit_enabled
              && isAuthorized(principal, "credit.approve", target),
            canUpdateCredit: ["approved", "suspended"].includes(row.credit_status ?? "")
              && isAuthorized(principal, "credit.approve", target),
            canSuspendCredit: row.credit_status === "approved" && isAuthorized(principal, "credit.suspend", target),
            canReinstateCredit: row.credit_status === "suspended"
              && row.agency_credit_enabled
              && isAuthorized(principal, "credit.suspend", target),
          },
        },
      });
    } catch (error) { next(error); }
  });

  router.get("/admin/permissions", async (_request, response, next) => {
    try {
      const principal = authenticatedPrincipal(response);
      if (!hasPermission(principal, "role.view") && !hasPermission(principal, "role.manage")) throw new HttpError(403, "permission_denied", "Role management access is required.");
      const actorPermissions = new Set(principal.assignments.flatMap((assignment) => assignment.permissions));
      const rows = await options.pool.query<{ key: string; resource: string; action: string; description: string; reserved: boolean }>(
        "select resource || '.' || action as key, resource, action, description, reserved from app.permissions order by resource, action",
      );
      response.status(200).json({ permissions: rows.rows.filter((permission) => actorPermissions.has(permission.key)) });
    } catch (error) { next(error); }
  });

  router.get("/admin/roles", async (_request, response, next) => {
    try {
      const principal = authenticatedPrincipal(response);
      if (!hasPermission(principal, "role.view") && !hasPermission(principal, "role.manage")) throw new HttpError(403, "permission_denied", "Role management access is required.");
      const superAdmin = hasRoleType(principal, "super_admin");
      const rows = await options.pool.query<{ public_id: string; name: string; role_type: string; status: string; managed_by_name: string | null; permissions: string[] }>(
        `select role_row.public_id::text, role_row.name, role_row.role_type, role_row.status,
                manager.full_name as managed_by_name, coalesce(permission_list.value, array[]::text[]) as permissions
           from app.roles role_row
           left join app.users manager on manager.id = role_row.managed_by_user_id
           left join lateral (
             select array_agg(permission.resource || '.' || permission.action order by permission.resource, permission.action) as value
               from app.role_permissions granted join app.permissions permission on permission.id = granted.permission_id
              where granted.role_id = role_row.id
           ) permission_list on true
          where role_row.status in ('active', 'suspended') and role_row.role_type in ('platform_admin', 'platform_team')
            and ($1::boolean or role_row.managed_by_user_id = $2)
          order by role_row.role_type, role_row.name`,
        [superAdmin, principal.userId],
      );
      response.status(200).json({ roles: rows.rows.map((row) => ({ publicId: row.public_id, name: row.name, roleType: row.role_type, status: row.status, managedByName: row.managed_by_name, permissionKeys: row.permissions })) });
    } catch (error) { next(error); }
  });

  router.get("/admin/team-members", async (_request, response, next) => {
    try {
      const principal = authenticatedPrincipal(response);
      requirePermissionScope(principal, "user.view");
      const superAdmin = hasRoleType(principal, "super_admin");
      const rows = await options.pool.query<{ assignment_public_id: string; user_public_id: string; full_name: string; phone_e164: string; email: string | null; user_status: string; mfa_required: boolean; role_public_id: string; role_name: string; role_type: string; scope_kind: string; scope_value: string | null; assignment_status: string; created_at: Date; agencies: unknown[] }>(
        `select assignment.public_id::text as assignment_public_id,
                user_row.public_id::text as user_public_id, user_row.full_name, user_row.phone_e164,
                user_row.email, user_row.status as user_status, user_row.mfa_required,
                role_row.public_id::text as role_public_id, role_row.name as role_name, role_row.role_type, assignment.scope_kind, assignment.scope_value,
                assignment.status as assignment_status, assignment.created_at,
                coalesce(scoped_agencies.value, '[]'::jsonb) as agencies
           from app.role_assignments assignment
           join app.users user_row on user_row.id = assignment.user_id
           join app.roles role_row on role_row.id = assignment.role_id
           left join lateral (
             select jsonb_agg(jsonb_build_object('publicId', agency.public_id, 'displayName', agency.display_name) order by agency.display_name) as value
               from app.role_assignment_agencies selected join app.agencies agency on agency.id = selected.agency_id
              where selected.role_assignment_id = assignment.id
           ) scoped_agencies on true
          where assignment.status in ('active', 'suspended') and role_row.role_type in ('platform_admin', 'platform_team')
            and ($1::boolean or role_row.managed_by_user_id = $2)
          order by assignment.created_at desc, assignment.id desc limit 200`,
        [superAdmin, principal.userId],
      );
      response.status(200).json({ teamMembers: rows.rows.map((row) => ({ assignmentPublicId: row.assignment_public_id, publicId: row.user_public_id, fullName: row.full_name, phoneE164: row.phone_e164, email: row.email, status: row.user_status, mfaRequired: row.mfa_required, rolePublicId: row.role_public_id, roleName: row.role_name, roleType: row.role_type, scope: { kind: row.scope_kind, value: row.scope_value, agencies: row.agencies }, assignmentStatus: row.assignment_status, assignedAt: row.created_at.toISOString() })) });
    } catch (error) { next(error); }
  });

  return router;
}
