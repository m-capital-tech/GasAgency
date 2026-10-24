import type pg from "pg";
import { Router } from "express";
import { withTransaction, type AuthPrincipal } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { assertPlatformWorkflowEnabled } from "../domain/platform-settings";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { assertAuthorized, hasRoleType } from "../security/rbac";

const tenantId = z.string().uuid();
const reviewSchema = z.object({
  decision: z.enum(["approved", "changes_requested", "rejected"]),
  reason: z.string().trim().min(3).max(1_000),
  override: z.boolean().default(false),
  commercialDecision: z.discriminatedUnion("decision", [
    z.object({ decision: z.literal("approved"), creditLimit: z.number().positive().max(100_000_000), netTermDays: z.union([z.literal(7), z.literal(15), z.literal(30)]), note: z.string().trim().min(3).max(1_000) }),
    z.object({ decision: z.literal("rejected"), note: z.string().trim().min(3).max(1_000) }),
    z.object({ decision: z.literal("deferred"), note: z.string().trim().min(3).max(1_000).optional() }),
  ]).optional(),
}).strict();

interface TenantContextRow {
  tenant_id: string;
  tenant_public_id: string;
  tenant_status: string;
  tenant_display_name: string;
  created_by_user_id: string;
  city: string;
  assignment_id: string;
  assignment_public_id: string;
  agency_id: string;
  agency_public_id: string;
  agency_display_name: string;
  agency_status: string;
  agency_credit_enabled: boolean;
  proposal_id: string;
  proposal_public_id: string;
  requested_payment_mode: "prepaid" | "credit";
  proposal_status: "not_required" | "pending" | "approved" | "rejected";
  owner_user_id: string;
  owner_user_public_id: string;
  owner_phone_e164: string;
  membership_id: string;
}

async function lockTenantContext(client: pg.PoolClient, publicId: string): Promise<TenantContextRow> {
  const context = (
    await client.query<TenantContextRow>(
      `select tenant.id::text as tenant_id,
              tenant.public_id::text as tenant_public_id,
              tenant.status as tenant_status,
              tenant.display_name as tenant_display_name,
              tenant.created_by_user_id::text,
              outlet.city,
              assignment.id::text as assignment_id,
              assignment.public_id::text as assignment_public_id,
              agency.id::text as agency_id,
              agency.public_id::text as agency_public_id,
              agency.display_name as agency_display_name,
              agency.status as agency_status,
              agency.credit_enabled as agency_credit_enabled,
              proposal.id::text as proposal_id,
              proposal.public_id::text as proposal_public_id,
              proposal.requested_payment_mode,
              proposal.decision_status as proposal_status,
              owner_user.id::text as owner_user_id,
              owner_user.public_id::text as owner_user_public_id,
              owner_user.phone_e164 as owner_phone_e164,
              membership.id::text as membership_id
         from app.tenants tenant
         join lateral (
           select candidate.city from app.outlets candidate
            where candidate.tenant_id = tenant.id
            order by candidate.id limit 1
         ) outlet on true
         join app.agency_assignments assignment
           on assignment.tenant_id = tenant.id and assignment.ends_at is null
         join app.agencies agency on agency.id = assignment.agency_id
         join app.tenant_commercial_proposals proposal on proposal.tenant_id = tenant.id
         join app.tenant_memberships membership
           on membership.tenant_id = tenant.id and membership.membership_type = 'owner'
         join app.users owner_user on owner_user.id = membership.user_id
        where tenant.public_id = $1
        order by membership.id
        limit 1
        for update of tenant, assignment, proposal, membership`,
      [publicId],
    )
  ).rows[0];
  if (!context) throw new HttpError(404, "tenant_not_found", "The tenant was not found.");
  return context;
}

function actorRoles(principal: AuthPrincipal): string {
  return [...new Set(principal.assignments.map((assignment) => assignment.roleType))].join(",");
}

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

export function tenantWorkflowRouter(options: {
  pool: pg.Pool;
  tokenPepper: string;
  registrationAppLink?: string;
  registrationSupportContact?: string;
}): Router {
  const registrationAppLink = options.registrationAppLink ?? "https://play.google.com/store/apps/details?id=com.munnagas.connect";
  const registrationSupportContact = options.registrationSupportContact ?? "support@munnaunited.com";
  const router = Router();
  router.use(requireAuthentication(options));

  router.post("/admin/tenants/:tenantPublicId/submit", async (request, response, next) => {
    try {
      const publicId = tenantId.safeParse(request.params.tenantPublicId);
      if (!publicId.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      const principal = authenticatedPrincipal(response);
      await assertPlatformWorkflowEnabled(options.pool, "workflows.tenant_onboarding", "Tenant onboarding submissions are temporarily paused by a Super Admin.");
      const result = await withTransaction(options.pool, async (client) => {
        const context = await lockTenantContext(client, publicId.data);
        assertAuthorized(principal, "tenant.submit", { city: context.city, agencyPublicId: context.agency_public_id, tenantPublicId: context.tenant_public_id });
        if (context.tenant_status === "pending_approval") {
          return { tenant: { publicId: context.tenant_public_id, status: "pending_approval" as const }, alreadySubmitted: true };
        }
        if (!["draft", "changes_requested"].includes(context.tenant_status)) {
          throw new HttpError(409, "invalid_tenant_state", `A tenant in ${context.tenant_status} cannot be submitted.`);
        }
        if (context.agency_status !== "approved") throw new HttpError(422, "agency_unavailable", "The selected agency is no longer approved.");

        await client.query(
          "update app.tenants set status = 'pending_approval', submitted_at = now(), updated_at = now() where id = $1",
          [context.tenant_id],
        );
        await client.query(
          `insert into app.audit_events (
             public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
             before_values, after_values, request_id, correlation_id
           ) values ($1, $2, $3, 'tenant.submitted', 'tenant', $4, $5::jsonb, $6::jsonb, $7, $8)`,
          [uuidV7(), principal.userId, actorRoles(principal), context.tenant_public_id, JSON.stringify({ status: context.tenant_status }), JSON.stringify({ status: "pending_approval" }), uuidV7(), uuidV7()],
        );
        return { tenant: { publicId: context.tenant_public_id, status: "pending_approval" as const }, alreadySubmitted: false };
      });
      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/tenants/:tenantPublicId/reviews", async (request, response, next) => {
    try {
      const publicId = tenantId.safeParse(request.params.tenantPublicId);
      if (!publicId.success) throw new HttpError(400, "invalid_tenant_id", "The tenant identifier is invalid.");
      const parsed = reviewSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The review decision is invalid.", parsed.error.flatten());
      if (parsed.data.decision !== "approved" && parsed.data.commercialDecision) {
        throw new HttpError(400, "invalid_commercial_decision", "Commercial terms can be decided only while approving a tenant.");
      }
      if (parsed.data.decision !== "approved" && parsed.data.override) {
        throw new HttpError(400, "invalid_override", "An override can be used only for tenant approval.");
      }
      const principal = authenticatedPrincipal(response);
      if (parsed.data.override && (!principal.mfaVerifiedAt || Date.now() - principal.mfaVerifiedAt.getTime() > 10 * 60 * 1_000)) {
        throw new HttpError(403, "step_up_required", "A fresh MFA verification is required for a Super Admin override.");
      }
      const result = await withTransaction(options.pool, async (client) => {
        const context = await lockTenantContext(client, publicId.data);
        const target = { city: context.city, agencyPublicId: context.agency_public_id, tenantPublicId: context.tenant_public_id };
        assertAuthorized(principal, parsed.data.decision === "approved" ? "tenant.approve" : "tenant.reject", target);
        if (context.tenant_status !== "pending_approval") {
          throw new HttpError(409, "invalid_tenant_state", `A tenant in ${context.tenant_status} cannot be reviewed.`);
        }

        const superAdminOverride = parsed.data.override && hasRoleType(principal, "super_admin");
        if (parsed.data.override && !superAdminOverride) {
          throw new HttpError(403, "override_not_allowed", "Only a Super Admin can use an approval override.");
        }
        if (parsed.data.decision === "approved" && context.created_by_user_id === principal.userId && !superAdminOverride) {
          throw new HttpError(409, "maker_checker_violation", "The tenant creator cannot approve their own submission.");
        }

        const nextStatus = parsed.data.decision === "approved" ? "active" : parsed.data.decision;
        await client.query(
          `insert into app.tenant_reviews (
             public_id, tenant_id, reviewer_user_id, decision, from_status, to_status,
             reason, override_used
           ) values ($1, $2, $3, $4, 'pending_approval', $5, $6, $7)`,
          [uuidV7(), context.tenant_id, principal.userId, parsed.data.decision, nextStatus, parsed.data.reason, superAdminOverride],
        );

        if (parsed.data.decision !== "approved") {
          await client.query("update app.tenants set status = $2, updated_at = now() where id = $1", [context.tenant_id, nextStatus]);
          await client.query(
            `insert into app.audit_events (
               public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
               reason, before_values, after_values, request_id, correlation_id
             ) values ($1, $2, $3, $4, 'tenant', $5, $6, $7::jsonb, $8::jsonb, $9, $10)`,
            [uuidV7(), principal.userId, actorRoles(principal), `tenant.${parsed.data.decision}`, context.tenant_public_id, parsed.data.reason, JSON.stringify({ status: "pending_approval" }), JSON.stringify({ status: nextStatus }), uuidV7(), uuidV7()],
          );
          return { tenant: { publicId: context.tenant_public_id, status: nextStatus }, invitation: null, commercialAccount: null };
        }

        if (context.agency_status !== "approved") throw new HttpError(422, "agency_unavailable", "The selected agency is no longer approved.");
        if (context.requested_payment_mode === "prepaid" && parsed.data.commercialDecision) {
          throw new HttpError(400, "commercial_decision_not_required", "A prepaid proposal does not accept a credit decision.");
        }

        const commercialDecision = context.requested_payment_mode === "credit"
          ? parsed.data.commercialDecision ?? { decision: "deferred" as const }
          : undefined;
        if (commercialDecision && commercialDecision.decision !== "deferred") {
          assertAuthorized(principal, "credit.approve", target);
        }
        if (commercialDecision?.decision === "approved" && !context.agency_credit_enabled) {
          throw new HttpError(422, "agency_credit_disabled", "Credit cannot be approved while the selected agency has credit disabled.");
        }

        const paymentMode = commercialDecision?.decision === "approved" ? "credit" : "prepaid";
        const commercialAccountPublicId = uuidV7();
        const commercialAccount = (
          await client.query<{ id: string }>(
            `insert into app.commercial_accounts (
               public_id, tenant_id, agency_id, payment_mode, status, opened_by_user_id
             ) values ($1, $2, $3, $4, 'open', $5)
             returning id::text`,
            [commercialAccountPublicId, context.tenant_id, context.agency_id, paymentMode, principal.userId],
          )
        ).rows[0]!;

        if (commercialDecision?.decision === "approved") {
          const creditAccountPublicId = uuidV7();
          const creditAccount = (
            await client.query<{ id: string }>(
              `insert into app.credit_accounts (
                 public_id, commercial_account_id, status, credit_limit, net_term_days,
                 approved_by_user_id, approved_at
               ) values ($1, $2, 'approved', $3, $4, $5, now())
               returning id::text`,
              [creditAccountPublicId, commercialAccount.id, commercialDecision.creditLimit, commercialDecision.netTermDays, principal.userId],
            )
          ).rows[0]!;
          await client.query(
            `insert into app.credit_decisions (
               public_id, credit_account_id, decision, new_limit, new_net_term_days,
               reason, decided_by_user_id, override_used
             ) values ($1, $2, 'approved', $3, $4, $5, $6, $7)`,
            [uuidV7(), creditAccount.id, commercialDecision.creditLimit, commercialDecision.netTermDays, commercialDecision.note, principal.userId, superAdminOverride],
          );
          await client.query(
            `update app.tenant_commercial_proposals
                set decision_status = 'approved', decided_by_user_id = $2, decided_at = now(),
                    decision_note = $3, updated_at = now()
              where id = $1`,
            [context.proposal_id, principal.userId, commercialDecision.note],
          );
        } else if (commercialDecision?.decision === "rejected") {
          await client.query(
            `update app.tenant_commercial_proposals
                set decision_status = 'rejected', decided_by_user_id = $2, decided_at = now(),
                    decision_note = $3, updated_at = now()
              where id = $1`,
            [context.proposal_id, principal.userId, commercialDecision.note],
          );
        }

        await client.query(
          `update app.tenants
              set status = 'active', approved_by_user_id = $2, approved_at = now(), updated_at = now()
            where id = $1`,
          [context.tenant_id, principal.userId],
        );
        await client.query(
          `update app.agency_assignments
              set status = 'active', starts_at = now()
            where id = $1`,
          [context.assignment_id],
        );

        const invitationPublicId = uuidV7();
        const invitation = (
          await client.query<{ id: string }>(
            `insert into app.invitations (
               public_id, tenant_id, user_id, status, idempotency_key, created_by_user_id
             ) values ($1, $2, $3, 'queued', $4, $5)
             returning id::text`,
            [invitationPublicId, context.tenant_id, context.owner_user_id, `tenant-activation:${context.tenant_public_id}`, principal.userId],
          )
        ).rows[0]!;
        await client.query(
          `insert into app.outbox_events (
             public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key
           ) values ($1, 'tenant.invitation.sms.requested', 'invitation', $2, $3::jsonb, $4)`,
          [uuidV7(), invitationPublicId, JSON.stringify({
            invitationId: invitation.id,
            invitationPublicId,
            tenantPublicId: context.tenant_public_id,
            tenantDisplayName: context.tenant_display_name,
            servingAgencyName: context.agency_display_name,
            appLink: registrationAppLink,
            supportContact: registrationSupportContact,
            userPublicId: context.owner_user_public_id,
            destinationE164: context.owner_phone_e164,
            strategy: "sms_first",
            whatsappFallbackAfterSeconds: 300,
          }), `tenant-invitation-sms:${invitationPublicId}`],
        );
        await client.query(
          `insert into app.audit_events (
             public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
             reason, before_values, after_values, request_id, correlation_id
           ) values ($1, $2, $3, 'tenant.approved', 'tenant', $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
          [uuidV7(), principal.userId, actorRoles(principal), context.tenant_public_id, parsed.data.reason, JSON.stringify({ status: "pending_approval", agencyAssignmentStatus: "proposed", proposalStatus: context.proposal_status }), JSON.stringify({ status: "active", agencyAssignmentStatus: "active", paymentMode, invitationPublicId, commercialAccountPublicId, creditDecision: commercialDecision?.decision ?? "not_required", overrideUsed: superAdminOverride }), uuidV7(), uuidV7()],
        );

        return {
          tenant: { publicId: context.tenant_public_id, status: "active" as const },
          invitation: { publicId: invitationPublicId, status: "queued" as const, channel: "sms" as const },
          commercialAccount: { publicId: commercialAccountPublicId, paymentMode, status: "open" as const },
        };
      });
      response.status(200).json(result);
    } catch (error) {
      const code = databaseCode(error);
      if (code === "42501") next(new HttpError(409, "maker_checker_violation", "The tenant creator cannot approve their own submission."));
      else if (code === "23505") next(new HttpError(409, "approval_conflict", "The tenant activation has already created one of its protected records."));
      else if (code === "23514") next(new HttpError(409, "activation_invariant_failed", "The tenant could not be activated because an invitation invariant failed."));
      else next(error);
    }
  });

  return router;
}
