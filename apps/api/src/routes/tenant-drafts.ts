import { createHash } from "node:crypto";
import type pg from "pg";
import { Router } from "express";
import { withTransaction } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { normalizeGstin, isValidGstin } from "../domain/gstin";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { assertAuthorized } from "../security/rbac";

const e164 = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
const optionalText = (maximum: number) => z.string().trim().min(1).max(maximum).optional();
const gstin = z.string().transform(normalizeGstin).refine(isValidGstin, "GSTIN checksum or format is invalid");

const requestSchema = z
  .object({
    legalName: z.string().trim().min(2).max(200),
    displayName: z.string().trim().min(2).max(120),
    businessType: z.enum(["restaurant", "hotel", "tiffin_centre", "cloud_kitchen", "canteen", "bakery", "tea_stall", "hospital", "hostel", "other"]),
    gstin,
    fssaiNumber: optionalText(32),
    alternatePhoneE164: e164.optional(),
    internalNotes: optionalText(2_000),
    owner: z.object({
      fullName: z.string().trim().min(2).max(160),
      phoneE164: e164,
      email: z.string().email().max(320).optional(),
    }),
    outlet: z.object({
      label: z.string().trim().min(1).max(100),
      addressLine1: z.string().trim().min(3).max(250),
      addressLine2: optionalText(250),
      city: z.string().trim().min(2).max(100),
      stateCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/),
      pincode: z.string().regex(/^[1-9][0-9]{5}$/),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      contactName: optionalText(160),
      contactPhoneE164: e164.optional(),
      deliveryInstructions: optionalText(1_000),
      stock: z.object({
        inUse: z.number().int().min(0).max(10_000).default(0),
        spareFull: z.number().int().min(0).max(10_000).default(0),
        empty: z.number().int().min(0).max(10_000).default(0),
      }),
    }),
    requirement: z.object({
      period: z.enum(["week", "month"]),
      preferredDeliveryDays: z.array(z.number().int().min(0).max(6)).max(7).refine((days) => new Set(days).size === days.length, "delivery days must be unique"),
      preferredSlot: z.enum(["before_opening", "standard", "evening", "express"]).optional(),
      items: z.array(z.object({ cylinderTypeCode: z.string().trim().min(1).max(64), expectedQuantity: z.number().int().positive().max(10_000) })).min(1).max(10)
        .refine((items) => new Set(items.map((item) => item.cylinderTypeCode)).size === items.length, "cylinder types must be unique"),
    }),
    agencyPublicId: z.string().uuid(),
    assignmentReason: z.string().trim().min(3).max(500),
    commercial: z.discriminatedUnion("requestedPaymentMode", [
      z.object({ requestedPaymentMode: z.literal("prepaid"), proposalNote: optionalText(1_000) }),
      z.object({
        requestedPaymentMode: z.literal("credit"),
        proposedCreditLimit: z.number().positive().max(100_000_000),
        proposedNetTermDays: z.union([z.literal(7), z.literal(15), z.literal(30)]),
        proposalNote: z.string().trim().min(3).max(1_000),
      }),
    ]),
  })
  .strict();

type TenantDraftRequest = z.infer<typeof requestSchema>;
interface TenantDraftResponse {
  tenant: { publicId: string; status: "draft"; displayName: string; gstin: string };
  owner: { publicId: string; phoneE164: string; membershipStatus: "invited" };
  outlet: { publicId: string; city: string };
  agencyAssignment: { publicId: string; agencyPublicId: string; status: "proposed" };
  commercialProposal: { publicId: string; requestedPaymentMode: "prepaid" | "credit"; decisionStatus: "not_required" | "pending" };
}

function requestHash(value: TenantDraftRequest): Buffer {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest();
}

function databaseCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined;
}

export function tenantDraftRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.post("/admin/tenants", async (request, response, next) => {
    try {
      const parsed = requestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpError(400, "invalid_request", "The tenant draft is invalid.", parsed.error.flatten());
      }
      const idempotencyKey = request.header("idempotency-key")?.trim();
      if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
        throw new HttpError(400, "invalid_idempotency_key", "Idempotency-Key must contain 8–128 safe characters.");
      }

      const body = parsed.data;
      const principal = authenticatedPrincipal(response);
      assertAuthorized(principal, "tenant.create", { city: body.outlet.city, agencyPublicId: body.agencyPublicId });
      const hash = requestHash(body);
      const scope = `tenant.create:${principal.userPublicId}`;

      const result = await withTransaction(options.pool, async (client) => {
        const claimed = await client.query(
          `insert into app.idempotency_keys (scope, idempotency_key, request_hash, locked_until, expires_at)
           values ($1, $2, $3, now() + interval '30 seconds', now() + interval '24 hours')
           on conflict (scope, idempotency_key) do nothing`,
          [scope, idempotencyKey, hash],
        );
        if (claimed.rowCount === 0) {
          const existing = await client.query<{ same_request: boolean; response_status: number | null; response_body: TenantDraftResponse | null }>(
            `select request_hash = $3 as same_request, response_status, response_body
               from app.idempotency_keys
              where scope = $1 and idempotency_key = $2
              for update`,
            [scope, idempotencyKey, hash],
          );
          const prior = existing.rows[0];
          if (!prior?.same_request) throw new HttpError(409, "idempotency_key_reused", "This idempotency key was already used with a different request.");
          if (prior.response_status && prior.response_body) return { status: prior.response_status, body: prior.response_body, replayed: true };
          throw new HttpError(409, "request_in_progress", "A request with this idempotency key is still in progress.");
        }

        const agency = (
          await client.query<{ id: string; public_id: string }>(
            "select id::text, public_id::text from app.agencies where public_id = $1 and status = 'approved'",
            [body.agencyPublicId],
          )
        ).rows[0];
        if (!agency) throw new HttpError(422, "agency_unavailable", "The selected agency is not approved or does not exist.");

        const duplicateTenant = await client.query("select 1 from app.tenants where gstin = $1", [body.gstin]);
        if (duplicateTenant.rowCount) throw new HttpError(409, "tenant_gstin_exists", "A tenant with this GSTIN already exists.");

        const insertedOwner = await client.query<{ id: string; public_id: string }>(
          `insert into app.users (public_id, phone_e164, full_name, email, status)
           values ($1, $2, $3, $4, 'invited')
           on conflict (phone_e164) do nothing
           returning id::text, public_id::text`,
          [uuidV7(), body.owner.phoneE164, body.owner.fullName, body.owner.email ?? null],
        );
        const owner = insertedOwner.rows[0] ?? (
          await client.query<{ id: string; public_id: string }>(
            "select id::text, public_id::text from app.users where phone_e164 = $1 for update",
            [body.owner.phoneE164],
          )
        ).rows[0];
        if (!owner) throw new Error("owner lookup failed after insert conflict");

        const tenantPublicId = uuidV7();
        const tenant = (
          await client.query<{ id: string }>(
            `insert into app.tenants (
               public_id, legal_name, display_name, business_type, gstin, fssai_number,
               alternate_phone_e164, internal_notes, status, created_by_user_id
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'draft', $9)
             returning id::text`,
            [tenantPublicId, body.legalName, body.displayName, body.businessType, body.gstin, body.fssaiNumber ?? null, body.alternatePhoneE164 ?? null, body.internalNotes ?? null, principal.userId],
          )
        ).rows[0]!;

        await client.query(
          `insert into app.tenant_memberships (
             public_id, tenant_id, user_id, membership_type, status, created_by_user_id
           ) values ($1, $2, $3, 'owner', 'invited', $4)`,
          [uuidV7(), tenant.id, owner.id, principal.userId],
        );

        const outletPublicId = uuidV7();
        const outlet = (
          await client.query<{ id: string }>(
            `insert into app.outlets (
               public_id, tenant_id, label, address_line_1, address_line_2, city, state_code,
               pincode, latitude, longitude, contact_name, contact_phone_e164, delivery_instructions,
               in_use_count, spare_full_count, empty_count
             ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
             returning id::text`,
            [outletPublicId, tenant.id, body.outlet.label, body.outlet.addressLine1, body.outlet.addressLine2 ?? null, body.outlet.city, body.outlet.stateCode, body.outlet.pincode, body.outlet.latitude, body.outlet.longitude, body.outlet.contactName ?? null, body.outlet.contactPhoneE164 ?? null, body.outlet.deliveryInstructions ?? null, body.outlet.stock.inUse, body.outlet.stock.spareFull, body.outlet.stock.empty],
          )
        ).rows[0]!;

        const requirement = (
          await client.query<{ id: string }>(
            `insert into app.tenant_requirements (
               public_id, tenant_id, outlet_id, period, preferred_delivery_days, preferred_slot
             ) values ($1, $2, $3, $4, $5::smallint[], $6)
             returning id::text`,
            [uuidV7(), tenant.id, outlet.id, body.requirement.period, body.requirement.preferredDeliveryDays, body.requirement.preferredSlot ?? null],
          )
        ).rows[0]!;
        for (const item of body.requirement.items) {
          const cylinder = (
            await client.query<{ id: string }>("select id::text from app.cylinder_types where code = $1 and active", [item.cylinderTypeCode])
          ).rows[0];
          if (!cylinder) throw new HttpError(422, "cylinder_type_unavailable", `Cylinder type ${item.cylinderTypeCode} is unavailable.`);
          await client.query(
            "insert into app.tenant_requirement_items (tenant_requirement_id, cylinder_type_id, expected_quantity) values ($1, $2, $3)",
            [requirement.id, cylinder.id, item.expectedQuantity],
          );
        }

        const assignmentPublicId = uuidV7();
        await client.query(
          `insert into app.agency_assignments (
             public_id, tenant_id, agency_id, assigned_by_user_id, reason, status
           ) values ($1, $2, $3, $4, $5, 'proposed')`,
          [assignmentPublicId, tenant.id, agency.id, principal.userId, body.assignmentReason],
        );

        const proposalPublicId = uuidV7();
        const decisionStatus = body.commercial.requestedPaymentMode === "credit" ? "pending" : "not_required";
        await client.query(
          `insert into app.tenant_commercial_proposals (
             public_id, tenant_id, requested_payment_mode, proposed_credit_limit,
             proposed_net_term_days, proposal_note, proposed_by_user_id, decision_status
           ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [proposalPublicId, tenant.id, body.commercial.requestedPaymentMode, body.commercial.requestedPaymentMode === "credit" ? body.commercial.proposedCreditLimit : null, body.commercial.requestedPaymentMode === "credit" ? body.commercial.proposedNetTermDays : null, body.commercial.proposalNote ?? null, principal.userId, decisionStatus],
        );

        const responseBody: TenantDraftResponse = {
          tenant: { publicId: tenantPublicId, status: "draft", displayName: body.displayName, gstin: body.gstin },
          owner: { publicId: owner.public_id, phoneE164: body.owner.phoneE164, membershipStatus: "invited" },
          outlet: { publicId: outletPublicId, city: body.outlet.city },
          agencyAssignment: { publicId: assignmentPublicId, agencyPublicId: agency.public_id, status: "proposed" },
          commercialProposal: { publicId: proposalPublicId, requestedPaymentMode: body.commercial.requestedPaymentMode, decisionStatus },
        };
        await client.query(
          `insert into app.audit_events (
             public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
             reason, after_values, request_id, correlation_id, user_agent
           ) values ($1, $2, $3, 'tenant.draft_created', 'tenant', $4, $5, $6::jsonb, $7, $8, $9)`,
          [uuidV7(), principal.userId, principal.assignments.map((assignment) => assignment.roleType).join(","), tenantPublicId, body.assignmentReason, JSON.stringify({ ...responseBody, externalRequestId: response.locals.requestId }), uuidV7(), uuidV7(), request.header("user-agent")?.slice(0, 500) ?? null],
        );
        await client.query(
          `update app.idempotency_keys
              set response_status = 201, response_body = $3::jsonb, completed_at = now(), locked_until = null
            where scope = $1 and idempotency_key = $2`,
          [scope, idempotencyKey, JSON.stringify(responseBody)],
        );
        return { status: 201, body: responseBody, replayed: false };
      });

      if (result.replayed) response.setHeader("idempotent-replayed", "true");
      response.status(result.status).json(result.body);
    } catch (error) {
      if (databaseCode(error) === "23505") next(new HttpError(409, "resource_conflict", "A conflicting tenant or account record already exists."));
      else next(error);
    }
  });

  return router;
}
