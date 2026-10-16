import type pg from "pg";
import { Router } from "express";
import { withTransaction, type AuthPrincipal } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { assertAuthorized } from "../security/rbac";

const tenantId = z.string().uuid();
const reason = z.string().trim().min(3).max(1_000);
const creditLimit = z.number().positive().max(100_000_000);
const netTermDays = z.union([z.literal(7), z.literal(15), z.literal(30)]);

const lifecycleSchema = z.object({
  action: z.enum(["suspend", "reinstate"]),
  reason,
}).strict();

const creditDecisionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve"), creditLimit, netTermDays, reason }).strict(),
  z.object({
    action: z.literal("update"),
    creditLimit: creditLimit.optional(),
    netTermDays: netTermDays.optional(),
    reason,
  }).strict().refine((value) => value.creditLimit !== undefined || value.netTermDays !== undefined, {
    message: "A credit limit or net term is required.",
  }),
  z.object({ action: z.literal("suspend"), reason }).strict(),
  z.object({ action: z.literal("reinstate"), reason }).strict(),
]);

interface TenantAccountContext {
  tenant_id: string;
  tenant_public_id: string;
  tenant_status: string;
  tenant_suspended_at: Date | null;
  city: string;
  state_code: string;
  agency_public_id: string;
  agency_status: string;
  agency_credit_enabled: boolean;
  commercial_account_id: string;
  commercial_account_public_id: string;
  commercial_account_status: "open" | "suspended" | "closed";
  payment_mode: "prepaid" | "credit";
  credit_account_id: string | null;
  credit_account_public_id: string | null;
  credit_status: "approved" | "suspended" | "closed" | null;
  credit_limit: string | null;
  net_term_days: 7 | 15 | 30 | null;
  credit_suspended_at: Date | null;
}

interface ExposureRow {
  pending_orders: string;
  outstanding_invoices: string;
}

function actorRoles(principal: AuthPrincipal): string {
  return [...new Set(principal.assignments.map((assignment) => assignment.roleType))].join(",");
}

function authorizationTarget(context: TenantAccountContext) {
  return {
    city: context.city,
    region: context.state_code,
    agencyPublicId: context.agency_public_id,
    tenantPublicId: context.tenant_public_id,
  };
}

async function lockTenantAccount(client: pg.PoolClient, tenantPublicId: string): Promise<TenantAccountContext> {
  const context = (
    await client.query<TenantAccountContext>(
      `select tenant.id::text as tenant_id,
              tenant.public_id::text as tenant_public_id,
              tenant.status as tenant_status,
              tenant.suspended_at as tenant_suspended_at,
              outlet.city,
              outlet.state_code,
              agency.public_id::text as agency_public_id,
              agency.status as agency_status,
              agency.credit_enabled as agency_credit_enabled,
              account.id::text as commercial_account_id,
              account.public_id::text as commercial_account_public_id,
              account.status as commercial_account_status,
              account.payment_mode,
              credit.id::text as credit_account_id,
              credit.public_id::text as credit_account_public_id,
              credit.status as credit_status,
              credit.credit_limit::text,
              credit.net_term_days,
              credit.suspended_at as credit_suspended_at
         from app.tenants tenant
         join lateral (
           select candidate.city, candidate.state_code
             from app.outlets candidate
            where candidate.tenant_id = tenant.id
            order by candidate.id
            limit 1
         ) outlet on true
         join app.agency_assignments assignment
           on assignment.tenant_id = tenant.id
          and assignment.status = 'active'
          and assignment.ends_at is null
         join app.agencies agency on agency.id = assignment.agency_id
         join app.commercial_accounts account
           on account.tenant_id = tenant.id
          and account.agency_id = agency.id
          and account.status in ('open', 'suspended')
         left join app.credit_accounts credit on credit.commercial_account_id = account.id
        where tenant.public_id = $1
        for update of tenant, account`,
      [tenantPublicId],
    )
  ).rows[0];
  if (!context) throw new HttpError(404, "tenant_account_not_found", "The active commercial tenant account was not found.");

  if (context.credit_account_id) {
    await client.query("select id from app.credit_accounts where id = $1 for update", [context.credit_account_id]);
  }
  return context;
}

async function creditExposure(client: pg.PoolClient, commercialAccountId: string) {
  const row = (
    await client.query<ExposureRow>(
      `select
         coalesce((select sum(total_amount)
                     from app.orders
                    where commercial_account_id = $1
                      and payment_method = 'credit'
                      and status not in ('delivered', 'rejected', 'cancelled')), 0)::text as pending_orders,
         coalesce((select sum(outstanding_amount)
                     from app.invoices
                    where commercial_account_id = $1
                      and status in ('open', 'overdue')
                      and outstanding_amount > 0), 0)::text as outstanding_invoices`,
      [commercialAccountId],
    )
  ).rows[0]!;
  const pendingOrders = Number(row.pending_orders);
  const outstandingInvoices = Number(row.outstanding_invoices);
  return { pendingOrders, outstandingInvoices, total: pendingOrders + outstandingInvoices };
}

async function insertAuditEvent(
  client: pg.PoolClient,
  input: {
    principal: AuthPrincipal;
    action: string;
    entityType: string;
    entityPublicId: string;
    reason: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    correlationId: string;
    sourceIp: string | null;
    userAgent: string | null;
  },
) {
  await client.query(
    `insert into app.audit_events (
       public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
       reason, before_values, after_values, request_id, correlation_id, source_ip, user_agent
     ) values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13)`,
    [
      uuidV7(), input.principal.userId, actorRoles(input.principal), input.action,
      input.entityType, input.entityPublicId, input.reason,
      JSON.stringify(input.before), JSON.stringify(input.after), uuidV7(), input.correlationId,
      input.sourceIp, input.userAgent,
    ],
  );
}

export function tenantAccountManagementRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.post("/admin/tenants/:tenantPublicId/lifecycle", async (request, response, next) => {
    try {
      const parsedTenantId = tenantId.safeParse(request.params.tenantPublicId);
      if (!parsedTenantId.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      const parsed = lifecycleSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The tenant lifecycle request is invalid.", parsed.error.flatten());

      const principal = authenticatedPrincipal(response);
      const sourceIp = request.ip || null;
      const userAgent = request.header("user-agent")?.slice(0, 500) ?? null;
      const result = await withTransaction(options.pool, async (client) => {
        const context = await lockTenantAccount(client, parsedTenantId.data);
        assertAuthorized(principal, "tenant.suspend", authorizationTarget(context));

        const expectedStatus = parsed.data.action === "suspend" ? "active" : "suspended";
        const nextStatus = parsed.data.action === "suspend" ? "suspended" : "active";
        if (context.tenant_status !== expectedStatus) {
          throw new HttpError(409, "invalid_tenant_state", `A tenant in ${context.tenant_status} cannot be ${parsed.data.action === "suspend" ? "suspended" : "reinstated"}.`);
        }
        if (parsed.data.action === "reinstate" && context.agency_status !== "approved") {
          throw new HttpError(422, "agency_unavailable", "The tenant cannot be reinstated while its serving agency is unavailable.");
        }

        await client.query(
          `update app.tenants
              set status = $2,
                  suspended_at = case when $2 = 'suspended' then now() else null end,
                  updated_at = now()
            where id = $1`,
          [context.tenant_id, nextStatus],
        );
        await client.query(
          `update app.commercial_accounts
              set status = $2, updated_at = now()
            where id = $1`,
          [context.commercial_account_id, parsed.data.action === "suspend" ? "suspended" : "open"],
        );

        let revokedSessions = 0;
        if (parsed.data.action === "suspend") {
          const revoked = await client.query(
            `update app.device_sessions session_row
                set revoked_at = now(), revoke_reason = 'tenant_suspended'
              where session_row.revoked_at is null
                and exists (
                  select 1
                    from app.tenant_memberships membership
                   where membership.tenant_id = $1
                     and membership.user_id = session_row.user_id
                )`,
            [context.tenant_id],
          );
          revokedSessions = revoked.rowCount ?? 0;
        }

        const reviewPublicId = uuidV7();
        await client.query(
          `insert into app.tenant_reviews (
             public_id, tenant_id, reviewer_user_id, decision, from_status, to_status, reason
           ) values ($1, $2, $3, $4, $5, $6, $7)`,
          [reviewPublicId, context.tenant_id, principal.userId, parsed.data.action === "suspend" ? "suspended" : "reinstated", expectedStatus, nextStatus, parsed.data.reason],
        );

        const correlationId = uuidV7();
        await insertAuditEvent(client, {
          principal,
          action: `tenant.${parsed.data.action === "suspend" ? "suspended" : "reinstated"}`,
          entityType: "tenant",
          entityPublicId: context.tenant_public_id,
          reason: parsed.data.reason,
          before: { status: context.tenant_status, commercialAccountStatus: context.commercial_account_status },
          after: {
            status: nextStatus,
            commercialAccountStatus: parsed.data.action === "suspend" ? "suspended" : "open",
            revokedSessions,
            reviewPublicId,
          },
          correlationId,
          sourceIp,
          userAgent,
        });

        return {
          tenant: { publicId: context.tenant_public_id, status: nextStatus },
          commercialAccount: {
            publicId: context.commercial_account_public_id,
            status: parsed.data.action === "suspend" ? "suspended" as const : "open" as const,
          },
          revokedSessions,
        };
      });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/tenants/:tenantPublicId/credit-decisions", async (request, response, next) => {
    try {
      const parsedTenantId = tenantId.safeParse(request.params.tenantPublicId);
      if (!parsedTenantId.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      const parsed = creditDecisionSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The credit decision is invalid.", parsed.error.flatten());

      const principal = authenticatedPrincipal(response);
      const sourceIp = request.ip || null;
      const userAgent = request.header("user-agent")?.slice(0, 500) ?? null;
      const result = await withTransaction(options.pool, async (client) => {
        const context = await lockTenantAccount(client, parsedTenantId.data);
        if (!["active", "suspended"].includes(context.tenant_status)) {
          throw new HttpError(409, "invalid_tenant_state", "Credit can be managed only after the tenant has been activated.");
        }
        const permission = parsed.data.action === "suspend" || parsed.data.action === "reinstate"
          ? "credit.suspend"
          : "credit.approve";
        assertAuthorized(principal, permission, authorizationTarget(context));

        const exposure = await creditExposure(client, context.commercial_account_id);
        const correlationId = uuidV7();

        if (parsed.data.action === "approve") {
          if (context.credit_account_id) {
            throw new HttpError(409, "credit_account_exists", "Credit has already been decided for this commercial account.");
          }
          if (!context.agency_credit_enabled) {
            throw new HttpError(422, "agency_credit_disabled", "Credit cannot be approved while the serving agency has credit disabled.");
          }
          if (parsed.data.creditLimit < exposure.total) {
            throw new HttpError(409, "credit_limit_below_exposure", "The approved limit cannot be lower than current exposure.", { exposure });
          }

          const creditAccountPublicId = uuidV7();
          const creditAccount = (
            await client.query<{ id: string }>(
              `insert into app.credit_accounts (
                 public_id, commercial_account_id, status, credit_limit, net_term_days,
                 approved_by_user_id, approved_at
               ) values ($1, $2, 'approved', $3, $4, $5, now())
               returning id::text`,
              [creditAccountPublicId, context.commercial_account_id, parsed.data.creditLimit, parsed.data.netTermDays, principal.userId],
            )
          ).rows[0]!;
          await client.query(
            `update app.commercial_accounts
                set payment_mode = 'credit', updated_at = now()
              where id = $1`,
            [context.commercial_account_id],
          );
          const decisionPublicId = uuidV7();
          await client.query(
            `insert into app.credit_decisions (
               public_id, credit_account_id, decision, new_limit, new_net_term_days,
               reason, decided_by_user_id
             ) values ($1, $2, 'approved', $3, $4, $5, $6)`,
            [decisionPublicId, creditAccount.id, parsed.data.creditLimit, parsed.data.netTermDays, parsed.data.reason, principal.userId],
          );
          await insertAuditEvent(client, {
            principal,
            action: "credit.approved",
            entityType: "credit_account",
            entityPublicId: creditAccountPublicId,
            reason: parsed.data.reason,
            before: { paymentMode: context.payment_mode, creditAccount: null, exposure },
            after: { paymentMode: "credit", status: "approved", creditLimit: parsed.data.creditLimit, netTermDays: parsed.data.netTermDays, decisionPublicIds: [decisionPublicId] },
            correlationId,
            sourceIp,
            userAgent,
          });
          return {
            creditAccount: {
              publicId: creditAccountPublicId,
              status: "approved" as const,
              creditLimit: parsed.data.creditLimit.toFixed(2),
              netTermDays: parsed.data.netTermDays,
            },
            exposure,
          };
        }

        if (!context.credit_account_id || !context.credit_account_public_id || !context.credit_status || !context.credit_limit || !context.net_term_days) {
          throw new HttpError(409, "credit_account_not_found", "This tenant does not have a credit account.");
        }
        if (context.credit_status === "closed") {
          throw new HttpError(409, "credit_account_closed", "A closed credit account cannot be changed.");
        }

        if (parsed.data.action === "update") {
          const previousLimit = Number(context.credit_limit);
          const nextLimit = parsed.data.creditLimit ?? previousLimit;
          const nextNetTermDays = parsed.data.netTermDays ?? context.net_term_days;
          const limitChanged = nextLimit !== previousLimit;
          const termsChanged = nextNetTermDays !== context.net_term_days;
          if (!limitChanged && !termsChanged) {
            throw new HttpError(409, "credit_terms_unchanged", "The submitted credit limit and net terms are unchanged.");
          }
          if (nextLimit < exposure.total) {
            throw new HttpError(409, "credit_limit_below_exposure", "The credit limit cannot be lowered below current exposure.", { exposure });
          }

          await client.query(
            `update app.credit_accounts
                set credit_limit = $2, net_term_days = $3, updated_at = now()
              where id = $1`,
            [context.credit_account_id, nextLimit, nextNetTermDays],
          );
          const decisionPublicIds: string[] = [];
          if (limitChanged) {
            const decisionPublicId = uuidV7();
            decisionPublicIds.push(decisionPublicId);
            await client.query(
              `insert into app.credit_decisions (
                 public_id, credit_account_id, decision, previous_limit, new_limit,
                 reason, decided_by_user_id
               ) values ($1, $2, 'limit_changed', $3, $4, $5, $6)`,
              [decisionPublicId, context.credit_account_id, previousLimit, nextLimit, parsed.data.reason, principal.userId],
            );
          }
          if (termsChanged) {
            const decisionPublicId = uuidV7();
            decisionPublicIds.push(decisionPublicId);
            await client.query(
              `insert into app.credit_decisions (
                 public_id, credit_account_id, decision, previous_net_term_days, new_net_term_days,
                 reason, decided_by_user_id
               ) values ($1, $2, 'terms_changed', $3, $4, $5, $6)`,
              [decisionPublicId, context.credit_account_id, context.net_term_days, nextNetTermDays, parsed.data.reason, principal.userId],
            );
          }
          await insertAuditEvent(client, {
            principal,
            action: "credit.updated",
            entityType: "credit_account",
            entityPublicId: context.credit_account_public_id,
            reason: parsed.data.reason,
            before: { status: context.credit_status, creditLimit: previousLimit, netTermDays: context.net_term_days, exposure },
            after: { status: context.credit_status, creditLimit: nextLimit, netTermDays: nextNetTermDays, decisionPublicIds },
            correlationId,
            sourceIp,
            userAgent,
          });
          return {
            creditAccount: { publicId: context.credit_account_public_id, status: context.credit_status, creditLimit: nextLimit.toFixed(2), netTermDays: nextNetTermDays },
            exposure,
          };
        }

        const expectedStatus = parsed.data.action === "suspend" ? "approved" : "suspended";
        const nextStatus = parsed.data.action === "suspend" ? "suspended" : "approved";
        if (context.credit_status !== expectedStatus) {
          throw new HttpError(409, "invalid_credit_state", `Credit in ${context.credit_status} cannot be ${parsed.data.action === "suspend" ? "suspended" : "reinstated"}.`);
        }
        if (parsed.data.action === "reinstate" && !context.agency_credit_enabled) {
          throw new HttpError(422, "agency_credit_disabled", "Credit cannot be reinstated while the serving agency has credit disabled.");
        }

        await client.query(
          `update app.credit_accounts
              set status = $2,
                  suspended_at = case when $2 = 'suspended' then now() else null end,
                  updated_at = now()
            where id = $1`,
          [context.credit_account_id, nextStatus],
        );
        const decisionPublicId = uuidV7();
        await client.query(
          `insert into app.credit_decisions (
             public_id, credit_account_id, decision, previous_limit, new_limit,
             previous_net_term_days, new_net_term_days, reason, decided_by_user_id
           ) values ($1, $2, $3, $4, $4, $5, $5, $6, $7)`,
          [decisionPublicId, context.credit_account_id, parsed.data.action === "suspend" ? "suspended" : "reinstated", Number(context.credit_limit), context.net_term_days, parsed.data.reason, principal.userId],
        );
        await insertAuditEvent(client, {
          principal,
          action: `credit.${parsed.data.action === "suspend" ? "suspended" : "reinstated"}`,
          entityType: "credit_account",
          entityPublicId: context.credit_account_public_id,
          reason: parsed.data.reason,
          before: { status: context.credit_status, creditLimit: Number(context.credit_limit), netTermDays: context.net_term_days, exposure },
          after: { status: nextStatus, creditLimit: Number(context.credit_limit), netTermDays: context.net_term_days, decisionPublicIds: [decisionPublicId] },
          correlationId,
          sourceIp,
          userAgent,
        });
        return {
          creditAccount: { publicId: context.credit_account_public_id, status: nextStatus, creditLimit: context.credit_limit, netTermDays: context.net_term_days },
          exposure,
        };
      });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
