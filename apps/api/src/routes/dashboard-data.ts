import type pg from "pg";
import { Router } from "express";
import { withTransaction, type AuthPrincipal } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { platformReportingParams, platformReportingScope, scopedTenantsSql } from "../domain/platform-reporting";
import { enqueueTenantPushEvent } from "../domain/tenant-notifications";
import { HttpError } from "../http/error";
import { assertFreshMfa, authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { assertAuthorized, hasPermission, hasRoleType } from "../security/rbac";

const publicId = z.string().uuid();
const revenueSchema = z.object({
  revenueType: z.enum(["commission", "facilitation", "convenience", "express", "subscription", "refund", "reversal", "other"]),
  amount: z.string().regex(/^-?[0-9]{1,12}(?:\.[0-9]{1,2})?$/),
  sourceType: z.enum(["manual", "settlement", "provider", "subscription"]),
  externalReference: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().min(3).max(500),
  agencyPublicId: publicId.optional(),
  tenantPublicId: publicId.optional(),
  orderPublicId: publicId.optional(),
  occurredAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, context) => {
  const amount = Number(value.amount);
  const negative = value.revenueType === "refund" || value.revenueType === "reversal";
  if (!Number.isFinite(amount) || (negative ? amount >= 0 : amount <= 0)) {
    context.addIssue({ code: "custom", path: ["amount"], message: negative ? "Refunds and reversals must be negative." : "Revenue amounts must be positive." });
  }
});

const supportCreateSchema = z.object({
  tenantPublicId: publicId.optional(),
  agencyPublicId: publicId.optional(),
  category: z.enum(["onboarding", "ordering", "delivery", "billing", "credit", "agency", "technical", "other"]),
  priority: z.enum(["low", "normal", "high", "critical"]),
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(3).max(5_000),
}).strict();

const supportListSchema = z.object({
  status: z.enum(["open", "acknowledged", "in_progress", "resolved", "closed"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const supportTransitionSchema = z.object({
  action: z.enum(["acknowledge", "start", "resolve", "reopen", "close", "comment"]),
  note: z.string().trim().min(3).max(2_000),
}).strict();

interface SupportContext {
  id: string;
  public_id: string;
  case_number: string;
  status: "open" | "acknowledged" | "in_progress" | "resolved" | "closed";
  tenant_public_id: string | null;
  agency_public_id: string | null;
  city: string | null;
  state_code: string | null;
}

function actorRoles(principal: AuthPrincipal) {
  return [...new Set(principal.assignments.map((assignment) => assignment.roleType))].join(",");
}

function target(context: Pick<SupportContext, "tenant_public_id" | "agency_public_id" | "city" | "state_code">) {
  return {
    tenantPublicId: context.tenant_public_id ?? undefined,
    agencyPublicId: context.agency_public_id ?? undefined,
    city: context.city ?? undefined,
    region: context.state_code ?? undefined,
  };
}

async function audit(client: pg.PoolClient, principal: AuthPrincipal, input: { action: string; entityType: string; entityPublicId: string; reason: string; after: Record<string, unknown>; requestId: string }) {
  await client.query(
    `insert into app.audit_events (
       public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
       reason, after_values, request_id, correlation_id
     ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)`,
    [uuidV7(), principal.userId, actorRoles(principal), input.action, input.entityType, input.entityPublicId,
      input.reason, JSON.stringify(input.after), input.requestId, uuidV7()],
  );
}

function requireSuperAdmin(principal: AuthPrincipal) {
  if (!hasRoleType(principal, "super_admin") || !hasPermission(principal, "configuration.manage")) {
    throw new HttpError(403, "permission_denied", "Super Admin finance authority is required.");
  }
}

export function dashboardDataRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.post("/admin/revenue-entries", async (request, response, next) => {
    try {
      const parsed = revenueSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The revenue entry is invalid.", parsed.error.flatten());
      const principal = authenticatedPrincipal(response);
      requireSuperAdmin(principal);
      assertFreshMfa(principal);
      const entry = await withTransaction(options.pool, async (client) => {
        let tenantId: string | null = null;
        let agencyId: string | null = null;
        let orderId: string | null = null;
        if (parsed.data.tenantPublicId) {
          tenantId = (await client.query<{ id: string }>("select id::text from app.tenants where public_id = $1", [parsed.data.tenantPublicId])).rows[0]?.id ?? null;
          if (!tenantId) throw new HttpError(404, "tenant_not_found", "The linked tenant was not found.");
        }
        if (parsed.data.agencyPublicId) {
          agencyId = (await client.query<{ id: string }>("select id::text from app.agencies where public_id = $1", [parsed.data.agencyPublicId])).rows[0]?.id ?? null;
          if (!agencyId) throw new HttpError(404, "agency_not_found", "The linked agency was not found.");
        }
        if (parsed.data.orderPublicId) {
          const order = (await client.query<{ id: string; tenant_id: string; agency_id: string }>("select id::text, tenant_id::text, agency_id::text from app.orders where public_id = $1", [parsed.data.orderPublicId])).rows[0];
          if (!order) throw new HttpError(404, "order_not_found", "The linked order was not found.");
          if (tenantId && tenantId !== order.tenant_id) throw new HttpError(422, "revenue_link_mismatch", "The order does not belong to the selected tenant.");
          if (agencyId && agencyId !== order.agency_id) throw new HttpError(422, "revenue_link_mismatch", "The order does not belong to the selected agency.");
          orderId = order.id; tenantId ??= order.tenant_id; agencyId ??= order.agency_id;
        }
        const entryPublicId = uuidV7();
        try {
          const inserted = await client.query<{ public_id: string; occurred_at: Date; created_at: Date }>(
            `insert into app.platform_revenue_entries (
               public_id, revenue_type, amount, source_type, external_reference, description,
               agency_id, tenant_id, order_id, recorded_by_user_id, occurred_at
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             returning public_id::text, occurred_at, created_at`,
            [entryPublicId, parsed.data.revenueType, parsed.data.amount, parsed.data.sourceType,
              parsed.data.externalReference ?? null, parsed.data.description, agencyId, tenantId, orderId,
              principal.userId, new Date(parsed.data.occurredAt)],
          );
          await audit(client, principal, { action: "revenue.recorded", entityType: "platform_revenue_entry", entityPublicId: entryPublicId,
            reason: parsed.data.description, after: { revenueType: parsed.data.revenueType, amount: parsed.data.amount, currency: "INR", sourceType: parsed.data.sourceType }, requestId: response.locals.requestId ?? uuidV7() });
          return inserted.rows[0]!;
        } catch (error) {
          if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") throw new HttpError(409, "revenue_reference_exists", "That source reference has already been recorded.");
          throw error;
        }
      });
      response.status(201).json({ entry: { publicId: entry.public_id, ...parsed.data, currency: "INR", occurredAt: entry.occurred_at.toISOString(), createdAt: entry.created_at.toISOString() } });
    } catch (error) { next(error); }
  });

  router.get("/admin/support-cases", async (request, response, next) => {
    try {
      const parsed = supportListSchema.safeParse(request.query);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The support-case filters are invalid.", parsed.error.flatten());
      const principal = authenticatedPrincipal(response);
      const scope = platformReportingScope(principal, "support_case.view");
      const params = platformReportingParams(scope);
      const result = await options.pool.query<{
        public_id: string; case_number: string; tenant_public_id: string | null; tenant_name: string | null; agency_public_id: string | null; agency_name: string | null;
        category: string; priority: string; status: string; subject: string; response_due_at: Date; first_response_at: Date | null; resolved_at: Date | null; created_at: Date; updated_at: Date;
      }>(
        `with ${scopedTenantsSql}
         select support.public_id::text, support.case_number, tenant.public_id::text as tenant_public_id, tenant.display_name as tenant_name,
                agency.public_id::text as agency_public_id, agency.display_name as agency_name,
                support.category, support.priority, support.status, support.subject, support.response_due_at,
                support.first_response_at, support.resolved_at, support.created_at, support.updated_at
           from app.support_cases support
           left join app.tenants tenant on tenant.id = support.tenant_id
           left join app.agencies agency on agency.id = support.agency_id
          where ($6::text is null or support.status = $6)
            and ($1::boolean or support.tenant_id in (select id from scoped_tenants)
                 or support.agency_id in (select assignment.agency_id from app.agency_assignments assignment join scoped_tenants scoped on scoped.id = assignment.tenant_id where assignment.ends_at is null))
          order by case support.priority when 'critical' then 1 when 'high' then 2 when 'normal' then 3 else 4 end,
                   support.response_due_at, support.id desc
          limit $7`,
        [...params, parsed.data.status ?? null, parsed.data.limit],
      );
      response.status(200).json({ cases: result.rows.map((row) => ({ publicId: row.public_id, caseNumber: row.case_number,
        tenant: row.tenant_public_id ? { publicId: row.tenant_public_id, displayName: row.tenant_name } : null,
        agency: row.agency_public_id ? { publicId: row.agency_public_id, displayName: row.agency_name } : null,
        category: row.category, priority: row.priority, status: row.status, subject: row.subject,
        responseDueAt: row.response_due_at.toISOString(), firstResponseAt: row.first_response_at?.toISOString() ?? null,
        resolvedAt: row.resolved_at?.toISOString() ?? null, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() })) });
    } catch (error) { next(error); }
  });

  router.post("/admin/support-cases", async (request, response, next) => {
    try {
      const parsed = supportCreateSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The support case is invalid.", parsed.error.flatten());
      const principal = authenticatedPrincipal(response);
      if (!hasPermission(principal, "support_case.create")) throw new HttpError(403, "permission_denied", "The support_case.create permission is required.");
      const created = await withTransaction(options.pool, async (client) => {
        const context = (await client.query<{ tenant_id: string | null; tenant_public_id: string | null; agency_id: string | null; agency_public_id: string | null; city: string | null; state_code: string | null }>(
          `select tenant.id::text as tenant_id, tenant.public_id::text as tenant_public_id,
                  agency.id::text as agency_id, agency.public_id::text as agency_public_id,
                  outlet.city, outlet.state_code
             from (select $1::uuid as tenant_public_id, $2::uuid as agency_public_id) input
             left join app.tenants tenant on tenant.public_id = input.tenant_public_id
             left join lateral (select city, state_code from app.outlets where tenant_id = tenant.id order by id limit 1) outlet on true
             left join app.agencies agency on agency.public_id = input.agency_public_id
               or (input.agency_public_id is null and exists (select 1 from app.agency_assignments assignment where assignment.tenant_id = tenant.id and assignment.agency_id = agency.id and assignment.ends_at is null))
            limit 1`,
          [parsed.data.tenantPublicId ?? null, parsed.data.agencyPublicId ?? null],
        )).rows[0]!;
        if (parsed.data.tenantPublicId && !context.tenant_id) throw new HttpError(404, "tenant_not_found", "The linked tenant was not found.");
        if (parsed.data.agencyPublicId && !context.agency_id) throw new HttpError(404, "agency_not_found", "The linked agency was not found.");
        if (context.tenant_id && context.agency_id) {
          const linked = await client.query("select 1 from app.agency_assignments where tenant_id = $1 and agency_id = $2 and ends_at is null", [context.tenant_id, context.agency_id]);
          if (!linked.rowCount) throw new HttpError(422, "support_scope_mismatch", "The tenant is not served by the selected agency.");
        }
        assertAuthorized(principal, "support_case.create", target(context));
        const slaHours = { critical: 1, high: 4, normal: 8, low: 24 }[parsed.data.priority];
        const casePublicId = uuidV7();
        const caseNumber = `CASE-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${casePublicId.replaceAll("-", "").slice(-8).toUpperCase()}`;
        const inserted = await client.query<{ public_id: string; case_number: string; status: string; response_due_at: Date; created_at: Date }>(
          `insert into app.support_cases (
             public_id, case_number, tenant_id, agency_id, opened_by_user_id, category, priority,
             subject, description, response_due_at
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, now() + make_interval(hours => $10))
           returning public_id::text, case_number, status, response_due_at, created_at`,
          [casePublicId, caseNumber, context.tenant_id, context.agency_id, principal.userId, parsed.data.category,
            parsed.data.priority, parsed.data.subject, parsed.data.description, slaHours],
        );
        await client.query(`insert into app.support_case_events (public_id, support_case_id, actor_user_id, event_type, to_status, note)
          select $1, id, $2, 'created', 'open', $3 from app.support_cases where public_id = $4`, [uuidV7(), principal.userId, parsed.data.description, casePublicId]);
        if (context.tenant_public_id) {
          await enqueueTenantPushEvent(client, {
            eventType: "support_case.updated",
            aggregateType: "support_case",
            aggregatePublicId: casePublicId,
            tenantPublicId: context.tenant_public_id,
            payload: { casePublicId, caseNumber, status: "open", updateType: "created" },
            dedupeKey: `support-case-created:${casePublicId}`,
          });
        }
        await audit(client, principal, { action: "support_case.created", entityType: "support_case", entityPublicId: casePublicId,
          reason: parsed.data.subject, after: { category: parsed.data.category, priority: parsed.data.priority, status: "open", slaHours }, requestId: response.locals.requestId ?? uuidV7() });
        return inserted.rows[0]!;
      });
      response.status(201).json({ case: { publicId: created.public_id, caseNumber: created.case_number, status: created.status,
        responseDueAt: created.response_due_at.toISOString(), createdAt: created.created_at.toISOString() } });
    } catch (error) { next(error); }
  });

  router.post("/admin/support-cases/:publicId/transitions", async (request, response, next) => {
    try {
      const parsedId = publicId.safeParse(request.params.publicId);
      const parsed = supportTransitionSchema.safeParse(request.body);
      if (!parsedId.success || !parsed.success) throw new HttpError(400, "invalid_request", "The support-case transition is invalid.");
      const principal = authenticatedPrincipal(response);
      const updated = await withTransaction(options.pool, async (client) => {
        const context = (await client.query<SupportContext>(
          `select support.id::text, support.public_id::text, support.case_number, support.status,
                  tenant.public_id::text as tenant_public_id, agency.public_id::text as agency_public_id,
                  outlet.city, outlet.state_code
             from app.support_cases support
             left join app.tenants tenant on tenant.id = support.tenant_id
             left join app.agencies agency on agency.id = support.agency_id
             left join lateral (select city, state_code from app.outlets where tenant_id = tenant.id order by id limit 1) outlet on true
            where support.public_id = $1 for update of support`, [parsedId.data])).rows[0];
        if (!context) throw new HttpError(404, "support_case_not_found", "The support case was not found.");
        assertAuthorized(principal, "support_case.edit", target(context));
        const transitions: Record<string, { from: SupportContext["status"][]; to: SupportContext["status"]; event: string }> = {
          acknowledge: { from: ["open"], to: "acknowledged", event: "acknowledged" },
          start: { from: ["open", "acknowledged"], to: "in_progress", event: "started" },
          resolve: { from: ["open", "acknowledged", "in_progress"], to: "resolved", event: "resolved" },
          reopen: { from: ["resolved", "closed"], to: "in_progress", event: "reopened" },
          close: { from: ["resolved"], to: "closed", event: "closed" },
        };
        if (parsed.data.action === "comment") {
          const supportEventPublicId = uuidV7();
          await client.query("insert into app.support_case_events (public_id, support_case_id, actor_user_id, event_type, from_status, to_status, note) values ($1, $2, $3, 'commented', $4, $4, $5)", [supportEventPublicId, context.id, principal.userId, context.status, parsed.data.note]);
          await client.query("update app.support_cases set updated_at = now() where id = $1", [context.id]);
          if (context.tenant_public_id) {
            await enqueueTenantPushEvent(client, {
              eventType: "support_case.updated",
              aggregateType: "support_case",
              aggregatePublicId: context.public_id,
              tenantPublicId: context.tenant_public_id,
              payload: { casePublicId: context.public_id, caseNumber: context.case_number, status: context.status, updateType: "commented" },
              dedupeKey: `support-case:${supportEventPublicId}`,
            });
          }
          return { publicId: context.public_id, status: context.status };
        }
        const transition = transitions[parsed.data.action]!;
        if (!transition.from.includes(context.status)) throw new HttpError(409, "invalid_support_case_state", `A ${context.status} case cannot be ${parsed.data.action}d.`);
        await client.query(
          `update app.support_cases set status = $2,
             first_response_at = case when $2 in ('acknowledged', 'in_progress', 'resolved') then coalesce(first_response_at, now()) else first_response_at end,
             resolved_at = case when $2 = 'resolved' then now() when $2 = 'in_progress' then null else resolved_at end,
             closed_at = case when $2 = 'closed' then now() when $2 = 'in_progress' then null else closed_at end,
             resolution = case when $2 = 'resolved' then $3 when $2 = 'in_progress' then null else resolution end,
             updated_at = now() where id = $1`,
          [context.id, transition.to, parsed.data.note],
        );
        const supportEventPublicId = uuidV7();
        await client.query("insert into app.support_case_events (public_id, support_case_id, actor_user_id, event_type, from_status, to_status, note) values ($1, $2, $3, $4, $5, $6, $7)", [supportEventPublicId, context.id, principal.userId, transition.event, context.status, transition.to, parsed.data.note]);
        if (context.tenant_public_id) {
          await enqueueTenantPushEvent(client, {
            eventType: "support_case.updated",
            aggregateType: "support_case",
            aggregatePublicId: context.public_id,
            tenantPublicId: context.tenant_public_id,
            payload: { casePublicId: context.public_id, caseNumber: context.case_number, status: transition.to, updateType: transition.event },
            dedupeKey: `support-case:${supportEventPublicId}`,
          });
        }
        await audit(client, principal, { action: `support_case.${transition.event}`, entityType: "support_case", entityPublicId: context.public_id,
          reason: parsed.data.note, after: { fromStatus: context.status, toStatus: transition.to }, requestId: response.locals.requestId ?? uuidV7() });
        return { publicId: context.public_id, status: transition.to };
      });
      response.status(200).json({ case: updated });
    } catch (error) { next(error); }
  });

  return router;
}
