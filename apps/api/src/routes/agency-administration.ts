import { createHash } from "node:crypto";
import type pg from "pg";
import { Router } from "express";
import { withTransaction, type AuthPrincipal } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { normalizeGstin, isValidGstin } from "../domain/gstin";
import { platformReportingParams, platformReportingScope } from "../domain/platform-reporting";
import { HttpError } from "../http/error";
import { assertFreshMfa, authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { assertAuthorized, hasRoleType } from "../security/rbac";

const publicId = z.string().uuid();
const e164 = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
const gstin = z.string().transform(normalizeGstin).refine(isValidGstin, "GSTIN checksum or format is invalid");
const agencyCreateSchema = z.object({
  legalName: z.string().trim().min(2).max(200), displayName: z.string().trim().min(2).max(120), gstin,
  distributorCode: z.string().trim().min(2).max(80), omc: z.enum(["HP", "IOCL", "BPCL"]), phoneE164: e164,
  owner: z.object({ fullName: z.string().trim().min(2).max(160), phoneE164: e164, email: z.string().email().max(320).optional() }).strict(),
  address: z.object({ addressLine1: z.string().trim().min(3).max(250), addressLine2: z.string().trim().min(1).max(250).optional(), city: z.string().trim().min(2).max(100), stateCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/), pincode: z.string().regex(/^[1-9][0-9]{5}$/), latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }).strict(),
  serviceArea: z.object({ pincodes: z.array(z.string().regex(/^[1-9][0-9]{5}$/)).min(1).max(200).refine((values) => new Set(values).size === values.length, "pincodes must be unique"), radiusKm: z.number().positive().max(500) }).strict(),
  reason: z.string().trim().min(3).max(500),
}).strict();
const reviewSchema = z.object({ decision: z.enum(["approved", "rejected"]), reason: z.string().trim().min(3).max(1_000), override: z.boolean().default(false) }).strict();
const lifecycleSchema = z.object({ action: z.enum(["suspend", "reinstate"]), reason: z.string().trim().min(3).max(1_000) }).strict();
const registrySchema = z.object({ status: z.enum(["all", "pending", "approved", "rejected", "suspended", "archived"]).default("all") });
const staffCreateSchema = z.object({ fullName: z.string().trim().min(2).max(160), phoneE164: e164, email: z.string().email().max(320).optional(), vehicleType: z.string().trim().min(2).max(80), vehicleNumber: z.string().trim().min(4).max(32), reason: z.string().trim().min(3).max(500) }).strict();
const staffLifecycleSchema = z.object({ action: z.enum(["suspend", "reinstate"]), reason: z.string().trim().min(3).max(500) }).strict();
const inventoryAdjustmentSchema = z.object({ cylinderTypeCode: z.string().trim().min(1).max(64), fullDelta: z.number().int().min(-100_000).max(100_000).default(0), emptyDelta: z.number().int().min(-100_000).max(100_000).default(0), lowStockThreshold: z.number().int().min(0).max(100_000).optional(), reason: z.string().trim().min(3).max(500) }).strict().refine((value) => value.fullDelta !== 0 || value.emptyDelta !== 0 || value.lowStockThreshold !== undefined, "an inventory change is required");

interface AgencyContext { id: string; public_id: string; display_name: string; city: string; state_code: string; status: string; owner_user_id: string | null; created_by_user_id: string | null; }

function actorRoles(principal: AuthPrincipal) { return [...new Set(principal.assignments.map((assignment) => assignment.roleType))].join(","); }
function databaseCode(error: unknown) { return typeof error === "object" && error !== null && "code" in error ? String(error.code) : undefined; }

async function agencyContext(client: pg.Pool | pg.PoolClient, agencyPublicId: string, lock = false): Promise<AgencyContext> {
  const row = (await client.query<AgencyContext>(`select id::text, public_id::text, display_name, city, state_code, status, owner_user_id::text, created_by_user_id::text from app.agencies where public_id = $1 ${lock ? "for update" : ""}`, [agencyPublicId])).rows[0];
  if (!row) throw new HttpError(404, "agency_not_found", "The agency was not found.");
  return row;
}

async function audit(client: pg.PoolClient, principal: AuthPrincipal, input: { action: string; entityType: string; entityPublicId: string; reason: string; before?: Record<string, unknown>; after: Record<string, unknown>; requestId: string }) {
  await client.query(`insert into app.audit_events (public_id, actor_user_id, actor_role, action, entity_type, entity_public_id, reason, before_values, after_values, request_id, correlation_id)
    values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11)`, [uuidV7(), principal.userId, actorRoles(principal), input.action, input.entityType, input.entityPublicId, input.reason, input.before ? JSON.stringify(input.before) : null, JSON.stringify(input.after), input.requestId, uuidV7()]);
}

async function standardRole(client: pg.PoolClient, principal: AuthPrincipal, roleType: "agency_owner" | "delivery") {
  await client.query("select pg_advisory_xact_lock(hashtext($1))", [`commercial-lpg-standard-role:${roleType}`]);
  const name = roleType === "agency_owner" ? "Agency Owner" : "Delivery Operator";
  const permissionKeys = roleType === "agency_owner"
    ? ["agency.view", "agency.edit", "order.view", "order.edit", "order.execute", "payment.view", "payment.create", "report.view", "user.view", "user.create", "user.edit"]
    : ["agency.view", "order.view", "order.execute"];
  let role = (await client.query<{ id: string; public_id: string }>("select id::text, public_id::text from app.roles where role_type = $1 and is_system and lower(name) = lower($2) for update", [roleType, name])).rows[0];
  if (!role) role = (await client.query<{ id: string; public_id: string }>("insert into app.roles (public_id, name, role_type, is_system, is_reserved, status) values ($1,$2,$3,true,true,'active') returning id::text, public_id::text", [uuidV7(), name, roleType])).rows[0]!;
  await client.query(`insert into app.role_permissions (role_id, permission_id, granted_by_user_id)
    select $1, permission.id, $2 from app.permissions permission where permission.resource || '.' || permission.action = any($3::text[])
    on conflict (role_id, permission_id) do nothing`, [role.id, principal.userId, permissionKeys]);
  return role;
}

async function inviteAssignment(client: pg.PoolClient, principal: AuthPrincipal, input: { userId: string; userPublicId: string; phoneE164: string; role: { id: string; public_id: string }; agencyPublicId: string }) {
  const assignmentPublicId = uuidV7();
  const assignment = (await client.query<{ id: string }>(`insert into app.role_assignments (public_id,user_id,role_id,scope_kind,scope_value,assigned_by_user_id,status)
    values ($1,$2,$3,'agency',$4,$5,'active') returning id::text`, [assignmentPublicId, input.userId, input.role.id, input.agencyPublicId, principal.userId])).rows[0]!;
  const invitationPublicId = uuidV7();
  await client.query(`insert into app.platform_user_invitations (public_id,user_id,role_assignment_id,status,idempotency_key,created_by_user_id)
    values ($1,$2,$3,'queued',$4,$5)`, [invitationPublicId, input.userId, assignment.id, `agency-assignment:${assignmentPublicId}`, principal.userId]);
  await client.query(`insert into app.outbox_events (public_id,event_type,aggregate_type,aggregate_public_id,payload,dedupe_key)
    values ($1,'platform_user.invitation.sms.requested','platform_user_invitation',$2,$3::jsonb,$4)`, [uuidV7(), invitationPublicId, JSON.stringify({ invitationPublicId, userPublicId: input.userPublicId, destinationE164: input.phoneE164, rolePublicId: input.role.public_id, roleAssignmentPublicId: assignmentPublicId, strategy: "sms_first", whatsappFallbackAfterSeconds: 300 }), `platform-user-invitation-sms:${invitationPublicId}`]);
  return { assignmentPublicId, invitationPublicId };
}

export function agencyAdministrationRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router(); router.use(requireAuthentication(options));

  router.get("/admin/agency-registry", async (request, response, next) => {
    try {
      const parsed = registrySchema.safeParse(request.query); if (!parsed.success) throw new HttpError(400, "invalid_request", "The agency registry filters are invalid.");
      const principal = authenticatedPrincipal(response); const scope = platformReportingScope(principal, "agency.view"); const params = platformReportingParams(scope);
      const result = await options.pool.query<{ public_id: string; display_name: string; legal_name: string; gstin: string; omc: string | null; distributor_code: string | null; phone_e164: string; city: string; state_code: string; status: string; submitted_at: Date | null; approved_at: Date | null; owner_name: string | null; tenant_count: string; staff_count: string; service_pincodes: string[] }>(
        `select agency.public_id::text, agency.display_name, agency.legal_name, agency.gstin, agency.omc, agency.distributor_code, agency.phone_e164, agency.city, agency.state_code, agency.status, agency.submitted_at, agency.approved_at, owner.full_name as owner_name,
                (select count(*) from app.agency_assignments assignment where assignment.agency_id = agency.id and assignment.ends_at is null)::text as tenant_count,
                (select count(*) from app.delivery_staff staff where staff.agency_id = agency.id and staff.status <> 'archived')::text as staff_count,
                coalesce((select array_agg(service.pincode order by service.pincode) from app.agency_service_pincodes service where service.agency_id = agency.id), '{}') as service_pincodes
           from app.agencies agency left join app.users owner on owner.id = agency.owner_user_id
          where ($6::text = 'all' or agency.status = $6)
            and (
              $1::boolean
              or lower(agency.state_code) = any($2::text[])
              or lower(agency.city) = any($3::text[])
              or agency.public_id = any($4::uuid[])
              or exists (
                select 1
                  from app.agency_assignments scoped_assignment
                  join app.tenants scoped_tenant on scoped_tenant.id = scoped_assignment.tenant_id
                 where scoped_assignment.agency_id = agency.id
                   and scoped_assignment.ends_at is null
                   and scoped_tenant.public_id = any($5::uuid[])
              )
            )
          order by case agency.status when 'pending' then 1 when 'changes_requested' then 2 when 'suspended' then 3 when 'approved' then 4 else 5 end, agency.submitted_at nulls last, agency.id desc`,
        [...params, parsed.data.status],
      );
      response.status(200).json({ agencies: result.rows.map((row) => ({ publicId: row.public_id, displayName: row.display_name, legalName: row.legal_name, gstin: row.gstin, omc: row.omc, distributorCode: row.distributor_code, phoneE164: row.phone_e164, city: row.city, stateCode: row.state_code, status: row.status, submittedAt: row.submitted_at?.toISOString() ?? null, approvedAt: row.approved_at?.toISOString() ?? null, ownerName: row.owner_name, tenantCount: Number(row.tenant_count), staffCount: Number(row.staff_count), servicePincodes: row.service_pincodes })) });
    } catch (error) { next(error); }
  });

  router.get("/admin/agency-registry/:agencyPublicId", async (request, response, next) => {
    try {
      const id = publicId.safeParse(request.params.agencyPublicId); if (!id.success) throw new HttpError(400, "invalid_agency_id", "The agency identifier is invalid.");
      const principal = authenticatedPrincipal(response); const agency = await agencyContext(options.pool, id.data); assertAuthorized(principal, "agency.view", { agencyPublicId: agency.public_id, city: agency.city, region: agency.state_code });
      const detail = (await options.pool.query<{ public_id: string; legal_name: string; display_name: string; gstin: string; distributor_code: string | null; omc: string | null; phone_e164: string; city: string; state_code: string; status: string; credit_enabled: boolean; address_line_1: string | null; address_line_2: string | null; pincode: string | null; latitude: string | null; longitude: string | null; service_radius_km: string | null; submitted_at: Date | null; approved_at: Date | null; suspended_at: Date | null; owner_public_id: string | null; owner_name: string | null; owner_phone: string | null; owner_email: string | null; service_pincodes: string[]; reviews: unknown[] }>(
        `select agency.public_id::text, agency.legal_name, agency.display_name, agency.gstin, agency.distributor_code, agency.omc, agency.phone_e164, agency.city, agency.state_code, agency.status, agency.credit_enabled, agency.address_line_1, agency.address_line_2, agency.pincode, agency.latitude::text, agency.longitude::text, agency.service_radius_km::text, agency.submitted_at, agency.approved_at, agency.suspended_at,
                owner.public_id::text as owner_public_id, owner.full_name as owner_name, owner.phone_e164 as owner_phone, owner.email as owner_email,
                coalesce((select array_agg(service.pincode order by service.pincode) from app.agency_service_pincodes service where service.agency_id = agency.id), '{}') as service_pincodes,
                coalesce((select jsonb_agg(jsonb_build_object('publicId',review.public_id,'decision',review.decision,'fromStatus',review.from_status,'toStatus',review.to_status,'reason',review.reason,'overrideUsed',review.override_used,'reviewerName',reviewer.full_name,'createdAt',review.created_at) order by review.created_at desc, review.id desc) from app.agency_reviews review join app.users reviewer on reviewer.id = review.reviewer_user_id where review.agency_id = agency.id), '[]'::jsonb) as reviews
           from app.agencies agency left join app.users owner on owner.id = agency.owner_user_id where agency.public_id = $1`, [id.data])).rows[0]!;
      response.status(200).json({ agency: { publicId: detail.public_id, legalName: detail.legal_name, displayName: detail.display_name, gstin: detail.gstin, distributorCode: detail.distributor_code, omc: detail.omc, phoneE164: detail.phone_e164, city: detail.city, stateCode: detail.state_code, status: detail.status, creditEnabled: detail.credit_enabled, address: { addressLine1: detail.address_line_1, addressLine2: detail.address_line_2, pincode: detail.pincode, latitude: detail.latitude === null ? null : Number(detail.latitude), longitude: detail.longitude === null ? null : Number(detail.longitude) }, serviceArea: { pincodes: detail.service_pincodes, radiusKm: detail.service_radius_km === null ? null : Number(detail.service_radius_km) }, owner: detail.owner_public_id ? { publicId: detail.owner_public_id, fullName: detail.owner_name, phoneE164: detail.owner_phone, email: detail.owner_email } : null, submittedAt: detail.submitted_at?.toISOString() ?? null, approvedAt: detail.approved_at?.toISOString() ?? null, suspendedAt: detail.suspended_at?.toISOString() ?? null, reviews: detail.reviews } });
    } catch (error) { next(error); }
  });

  router.post("/admin/agencies", async (request, response, next) => {
    try {
      const parsed = agencyCreateSchema.safeParse(request.body); if (!parsed.success) throw new HttpError(400, "invalid_request", "The agency registration is invalid.", parsed.error.flatten());
      const idempotencyKey = request.header("idempotency-key")?.trim(); if (!idempotencyKey || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) throw new HttpError(400, "invalid_idempotency_key", "Idempotency-Key must contain 8–128 safe characters.");
      const principal = authenticatedPrincipal(response); assertAuthorized(principal, "agency.create", { city: parsed.data.address.city, region: parsed.data.address.stateCode });
      const hash = createHash("sha256").update(JSON.stringify(parsed.data)).digest(); const scope = `agency.create:${principal.userPublicId}`;
      const created = await withTransaction(options.pool, async (client) => {
        const claimed = await client.query("insert into app.idempotency_keys (scope,idempotency_key,request_hash,locked_until,expires_at) values ($1,$2,$3,now()+interval '30 seconds',now()+interval '24 hours') on conflict (scope,idempotency_key) do nothing", [scope, idempotencyKey, hash]);
        if (!claimed.rowCount) { const prior = (await client.query<{ same_request: boolean; response_body: unknown }>("select request_hash=$3 as same_request,response_body from app.idempotency_keys where scope=$1 and idempotency_key=$2 for update", [scope, idempotencyKey, hash])).rows[0]; if (!prior?.same_request) throw new HttpError(409, "idempotency_key_reused", "This idempotency key was already used for another agency."); if (prior.response_body) return prior.response_body as { agency: { publicId: string; status: string; displayName: string }; owner: { publicId: string; status: string } }; throw new HttpError(409, "request_in_progress", "This agency registration is still being processed."); }
        const insertedUser = await client.query<{ id: string; public_id: string; status: string }>("insert into app.users (public_id,phone_e164,full_name,email,status,mfa_required) values ($1,$2,$3,$4,'invited',true) on conflict (phone_e164) do nothing returning id::text,public_id::text,status", [uuidV7(), parsed.data.owner.phoneE164, parsed.data.owner.fullName, parsed.data.owner.email ?? null]);
        const owner = insertedUser.rows[0] ?? (await client.query<{ id: string; public_id: string; status: string }>("select id::text,public_id::text,status from app.users where phone_e164=$1 for update", [parsed.data.owner.phoneE164])).rows[0];
        if (!owner || ["suspended", "archived"].includes(owner.status)) throw new HttpError(409, "owner_unavailable", "The owner phone belongs to a suspended or archived user.");
        const agencyPublicId = uuidV7(); const inserted = await client.query(`insert into app.agencies (public_id,legal_name,display_name,gstin,distributor_code,omc,phone_e164,city,state_code,status,created_by_user_id,owner_user_id,address_line_1,address_line_2,pincode,latitude,longitude,service_radius_km,submitted_at)
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10,$11,$12,$13,$14,$15,$16,$17,now()) returning id::text`, [agencyPublicId, parsed.data.legalName, parsed.data.displayName, parsed.data.gstin, parsed.data.distributorCode, parsed.data.omc, parsed.data.phoneE164, parsed.data.address.city, parsed.data.address.stateCode, principal.userId, owner.id, parsed.data.address.addressLine1, parsed.data.address.addressLine2 ?? null, parsed.data.address.pincode, parsed.data.address.latitude, parsed.data.address.longitude, parsed.data.serviceArea.radiusKm]);
        await client.query("insert into app.agency_service_pincodes (agency_id,pincode) select $1,unnest($2::text[])", [inserted.rows[0]!.id, parsed.data.serviceArea.pincodes]);
        const body = { agency: { publicId: agencyPublicId, status: "pending", displayName: parsed.data.displayName }, owner: { publicId: owner.public_id, status: owner.status } };
        await audit(client, principal, { action: "agency.submitted", entityType: "agency", entityPublicId: agencyPublicId, reason: parsed.data.reason, after: { gstin: parsed.data.gstin, ownerPublicId: owner.public_id, city: parsed.data.address.city, servicePincodes: parsed.data.serviceArea.pincodes }, requestId: response.locals.requestId ?? uuidV7() });
        await client.query("update app.idempotency_keys set response_status=201,response_body=$3::jsonb,locked_until=now() where scope=$1 and idempotency_key=$2", [scope, idempotencyKey, JSON.stringify(body)]); return body;
      });
      response.status(201).json(created);
    } catch (error) { const code = databaseCode(error); next(code === "23505" ? new HttpError(409, "agency_conflict", "The GSTIN, owner contact, or agency registration already exists.") : error); }
  });

  router.post("/admin/agencies/:agencyPublicId/reviews", async (request, response, next) => {
    try {
      const id = publicId.safeParse(request.params.agencyPublicId); const parsed = reviewSchema.safeParse(request.body); if (!id.success || !parsed.success) throw new HttpError(400, "invalid_request", "The agency review is invalid.");
      const principal = authenticatedPrincipal(response); assertFreshMfa(principal);
      const outcome = await withTransaction(options.pool, async (client) => {
        const agency = await agencyContext(client, id.data, true); assertAuthorized(principal, parsed.data.decision === "approved" ? "agency.approve" : "agency.edit", { agencyPublicId: agency.public_id, city: agency.city, region: agency.state_code });
        if (agency.status !== "pending") throw new HttpError(409, "invalid_agency_state", "Only a pending agency can be reviewed.");
        const selfReview = agency.created_by_user_id === principal.userId; if (selfReview && (!hasRoleType(principal, "super_admin") || !parsed.data.override)) throw new HttpError(409, "maker_checker_required", "A different administrator must approve an agency created by this account. Super Admin may use an explicit override.");
        const nextStatus = parsed.data.decision === "approved" ? "approved" : "rejected";
        await client.query("update app.agencies set status=$2,approved_by_user_id=case when $2='approved' then $3::bigint else null end,approved_at=case when $2='approved' then now() else null end,updated_at=now() where id=$1", [agency.id, nextStatus, principal.userId]);
        let access: { assignmentPublicId: string; invitationPublicId: string } | null = null;
        if (nextStatus === "approved") {
          if (!agency.owner_user_id) throw new HttpError(409, "owner_required", "An owner is required before agency approval.");
          const owner = (await client.query<{ id: string; public_id: string; phone_e164: string }>("select id::text,public_id::text,phone_e164 from app.users where id=$1 for update", [agency.owner_user_id])).rows[0]!;
          await client.query("update app.users set mfa_required=true,updated_at=now() where id=$1 and not mfa_required", [owner.id]);
          await client.query("update app.device_sessions set revoked_at=now(),revoke_reason='agency_owner_mfa_enforced' where user_id=$1 and revoked_at is null", [owner.id]);
          const role = await standardRole(client, principal, "agency_owner"); access = await inviteAssignment(client, principal, { userId: owner.id, userPublicId: owner.public_id, phoneE164: owner.phone_e164, role, agencyPublicId: agency.public_id });
          const cylinders = await client.query<{ id: string; weight_kg: string }>("select id::text,weight_kg::text from app.cylinder_types where active order by id");
          for (const cylinder of cylinders.rows) await client.query("insert into app.agency_inventory (public_id,agency_id,cylinder_type_id,low_stock_threshold,updated_by_user_id) values ($1,$2,$3,$4,$5) on conflict (agency_id,cylinder_type_id) do nothing", [uuidV7(), agency.id, cylinder.id, Number(cylinder.weight_kg) <= 19 ? 20 : 5, principal.userId]);
        }
        const reviewPublicId = uuidV7(); await client.query("insert into app.agency_reviews (public_id,agency_id,reviewer_user_id,decision,from_status,to_status,reason,override_used) values ($1,$2,$3,$4,$5,$6,$7,$8)", [reviewPublicId, agency.id, principal.userId, parsed.data.decision, agency.status, nextStatus, parsed.data.reason, selfReview && parsed.data.override]);
        await audit(client, principal, { action: `agency.${parsed.data.decision}`, entityType: "agency", entityPublicId: agency.public_id, reason: parsed.data.reason, before: { status: agency.status }, after: { status: nextStatus, overrideUsed: selfReview && parsed.data.override, access }, requestId: response.locals.requestId ?? uuidV7() }); return { status: nextStatus, access };
      });
      response.status(200).json({ agency: { publicId: id.data, status: outcome.status }, ownerAccess: outcome.access });
    } catch (error) { next(databaseCode(error) === "42501" ? new HttpError(409, "maker_checker_required", "A different administrator must approve this agency.") : error); }
  });

  router.post("/admin/agencies/:agencyPublicId/lifecycle", async (request, response, next) => {
    try {
      const id = publicId.safeParse(request.params.agencyPublicId); const parsed = lifecycleSchema.safeParse(request.body); if (!id.success || !parsed.success) throw new HttpError(400, "invalid_request", "The agency lifecycle request is invalid.");
      const principal = authenticatedPrincipal(response); assertFreshMfa(principal);
      const result = await withTransaction(options.pool, async (client) => {
        const agency = await agencyContext(client, id.data, true); assertAuthorized(principal, "agency.suspend", { agencyPublicId: agency.public_id, city: agency.city, region: agency.state_code });
        const expected = parsed.data.action === "suspend" ? "approved" : "suspended"; const nextStatus = parsed.data.action === "suspend" ? "suspended" : "approved";
        if (agency.status !== expected) throw new HttpError(409, "invalid_agency_state", `Only an ${expected} agency can be ${parsed.data.action}d.`);
        await client.query("update app.agencies set status=$2,suspended_at=case when $2='suspended' then now() else null end,updated_at=now() where id=$1", [agency.id, nextStatus]);
        const revoked = parsed.data.action === "suspend" ? await client.query(`update app.device_sessions set revoked_at=now(),revoke_reason='agency_suspended' where revoked_at is null and user_id in (select assignment.user_id from app.role_assignments assignment where assignment.status='active' and assignment.scope_kind='agency' and assignment.scope_value=$1)`, [agency.public_id]) : { rowCount: 0 };
        await client.query("insert into app.agency_reviews (public_id,agency_id,reviewer_user_id,decision,from_status,to_status,reason) values ($1,$2,$3,$4,$5,$6,$7)", [uuidV7(), agency.id, principal.userId, parsed.data.action === "suspend" ? "suspended" : "reinstated", agency.status, nextStatus, parsed.data.reason]);
        await audit(client, principal, { action: `agency.${parsed.data.action}`, entityType: "agency", entityPublicId: agency.public_id, reason: parsed.data.reason, before: { status: agency.status }, after: { status: nextStatus, revokedSessions: revoked.rowCount ?? 0 }, requestId: response.locals.requestId ?? uuidV7() }); return { status: nextStatus, revokedSessions: revoked.rowCount ?? 0 };
      }); response.status(200).json({ agency: { publicId: id.data, ...result } });
    } catch (error) { next(error); }
  });

  router.post("/agencies/:agencyPublicId/delivery-staff", async (request, response, next) => {
    try {
      const id = publicId.safeParse(request.params.agencyPublicId); const parsed = staffCreateSchema.safeParse(request.body); if (!id.success || !parsed.success) throw new HttpError(400, "invalid_request", "The delivery staff record is invalid.", parsed.success ? undefined : parsed.error.flatten());
      const principal = authenticatedPrincipal(response); const result = await withTransaction(options.pool, async (client) => {
        const agency = await agencyContext(client, id.data, true); if (agency.status !== "approved") throw new HttpError(409, "agency_unavailable", "Delivery staff can be added only to an approved agency."); assertAuthorized(principal, "user.create", { agencyPublicId: agency.public_id, city: agency.city });
        const inserted = await client.query<{ id: string; public_id: string; status: string }>("insert into app.users (public_id,phone_e164,full_name,email,status) values ($1,$2,$3,$4,'invited') on conflict (phone_e164) do nothing returning id::text,public_id::text,status", [uuidV7(), parsed.data.phoneE164, parsed.data.fullName, parsed.data.email ?? null]);
        const user = inserted.rows[0] ?? (await client.query<{ id: string; public_id: string; status: string }>("select id::text,public_id::text,status from app.users where phone_e164=$1 for update", [parsed.data.phoneE164])).rows[0]; if (!user || ["suspended", "archived"].includes(user.status)) throw new HttpError(409, "user_unavailable", "The staff phone belongs to an unavailable user.");
        const staffPublicId = uuidV7(); await client.query("insert into app.delivery_staff (public_id,agency_id,user_id,vehicle_type,vehicle_number,created_by_user_id) values ($1,$2,$3,$4,$5,$6)", [staffPublicId, agency.id, user.id, parsed.data.vehicleType, parsed.data.vehicleNumber.toUpperCase(), principal.userId]);
        const role = await standardRole(client, principal, "delivery"); const access = await inviteAssignment(client, principal, { userId: user.id, userPublicId: user.public_id, phoneE164: parsed.data.phoneE164, role, agencyPublicId: agency.public_id });
        await audit(client, principal, { action: "delivery_staff.created", entityType: "delivery_staff", entityPublicId: staffPublicId, reason: parsed.data.reason, after: { agencyPublicId: agency.public_id, userPublicId: user.public_id, vehicleType: parsed.data.vehicleType, vehicleNumber: parsed.data.vehicleNumber, ...access }, requestId: response.locals.requestId ?? uuidV7() }); return { publicId: staffPublicId, fullName: parsed.data.fullName, phoneE164: parsed.data.phoneE164, vehicleType: parsed.data.vehicleType, vehicleNumber: parsed.data.vehicleNumber.toUpperCase(), status: "active", activeDrops: 0, access };
      }); response.status(201).json({ staff: result });
    } catch (error) { next(databaseCode(error) === "23505" ? new HttpError(409, "delivery_staff_conflict", "This user is already configured as delivery staff.") : error); }
  });

  router.post("/agencies/:agencyPublicId/delivery-staff/:staffPublicId/lifecycle", async (request, response, next) => {
    try {
      const agencyId = publicId.safeParse(request.params.agencyPublicId); const staffId = publicId.safeParse(request.params.staffPublicId); const parsed = staffLifecycleSchema.safeParse(request.body); if (!agencyId.success || !staffId.success || !parsed.success) throw new HttpError(400, "invalid_request", "The delivery staff lifecycle request is invalid.");
      const principal = authenticatedPrincipal(response); const result = await withTransaction(options.pool, async (client) => {
        const agency = await agencyContext(client, agencyId.data); assertAuthorized(principal, "user.edit", { agencyPublicId: agency.public_id, city: agency.city });
        const staff = (await client.query<{ id: string; user_id: string; status: string }>("select id::text,user_id::text,status from app.delivery_staff where public_id=$1 and agency_id=$2 for update", [staffId.data, agency.id])).rows[0]; if (!staff) throw new HttpError(404, "delivery_staff_not_found", "The delivery staff record was not found.");
        const expected = parsed.data.action === "suspend" ? "active" : "suspended"; const nextStatus = parsed.data.action === "suspend" ? "suspended" : "active"; if (staff.status !== expected) throw new HttpError(409, "invalid_delivery_staff_state", `Only ${expected} staff can be ${parsed.data.action}d.`);
        if (parsed.data.action === "suspend") { const active = await client.query("select 1 from app.orders where assigned_delivery_staff_id=$1 and status in ('assigned','out_for_delivery') limit 1", [staff.id]); if (active.rowCount) throw new HttpError(409, "active_deliveries_exist", "Reassign active deliveries before suspending this staff member."); }
        await client.query("update app.delivery_staff set status=$2,updated_at=now() where id=$1", [staff.id, nextStatus]);
        await client.query(`update app.role_assignments assignment set status=$3,updated_at=now()
          from app.roles role_row where role_row.id=assignment.role_id and role_row.role_type='delivery'
            and assignment.user_id=$1 and assignment.scope_kind='agency' and assignment.scope_value=$2
            and assignment.status=$4`, [staff.user_id, agency.public_id, nextStatus === "active" ? "active" : "suspended", nextStatus === "active" ? "suspended" : "active"]);
        const revoked = parsed.data.action === "suspend" ? await client.query("update app.device_sessions set revoked_at=now(),revoke_reason='delivery_staff_suspended' where user_id=$1 and revoked_at is null", [staff.user_id]) : { rowCount: 0 };
        await audit(client, principal, { action: `delivery_staff.${parsed.data.action}`, entityType: "delivery_staff", entityPublicId: staffId.data, reason: parsed.data.reason, before: { status: staff.status }, after: { status: nextStatus, revokedSessions: revoked.rowCount ?? 0 }, requestId: response.locals.requestId ?? uuidV7() }); return { status: nextStatus, revokedSessions: revoked.rowCount ?? 0 };
      }); response.status(200).json({ staff: { publicId: staffId.data, ...result } });
    } catch (error) { next(error); }
  });

  router.post("/agencies/:agencyPublicId/inventory/adjustments", async (request, response, next) => {
    try {
      const id = publicId.safeParse(request.params.agencyPublicId); const parsed = inventoryAdjustmentSchema.safeParse(request.body); if (!id.success || !parsed.success) throw new HttpError(400, "invalid_request", "The inventory adjustment is invalid.", parsed.success ? undefined : parsed.error.flatten());
      const principal = authenticatedPrincipal(response); const result = await withTransaction(options.pool, async (client) => {
        const agency = await agencyContext(client, id.data); if (agency.status !== "approved") throw new HttpError(409, "agency_unavailable", "Inventory can be adjusted only for an approved agency."); assertAuthorized(principal, "agency.edit", { agencyPublicId: agency.public_id, city: agency.city });
        const inventory = (await client.query<{ id: string; public_id: string; full_on_hand: number; empty_on_hand: number; reserved_full: number; with_accounts: number; low_stock_threshold: number }>(`select inventory.id::text,inventory.public_id::text,inventory.full_on_hand,inventory.empty_on_hand,inventory.reserved_full,inventory.with_accounts,inventory.low_stock_threshold from app.agency_inventory inventory join app.cylinder_types cylinder on cylinder.id=inventory.cylinder_type_id where inventory.agency_id=$1 and cylinder.code=$2 for update`, [agency.id, parsed.data.cylinderTypeCode])).rows[0]; if (!inventory) throw new HttpError(404, "inventory_not_found", "The cylinder type is not configured for this agency.");
        const full = inventory.full_on_hand + parsed.data.fullDelta; const empty = inventory.empty_on_hand + parsed.data.emptyDelta; if (full < inventory.reserved_full || empty < 0) throw new HttpError(422, "invalid_inventory_balance", "The adjustment would create a negative balance or reduce stock below reservations."); const threshold = parsed.data.lowStockThreshold ?? inventory.low_stock_threshold;
        await client.query("update app.agency_inventory set full_on_hand=$2,empty_on_hand=$3,low_stock_threshold=$4,updated_by_user_id=$5,updated_at=now() where id=$1", [inventory.id, full, empty, threshold, principal.userId]);
        if (parsed.data.fullDelta || parsed.data.emptyDelta) await client.query(`insert into app.agency_inventory_events (public_id,agency_inventory_id,actor_user_id,event_type,full_delta,empty_delta,full_balance,empty_balance,reserved_balance,with_accounts_balance,reason) values ($1,$2,$3,'adjustment',$4,$5,$6,$7,$8,$9,$10)`, [uuidV7(), inventory.id, principal.userId, parsed.data.fullDelta, parsed.data.emptyDelta, full, empty, inventory.reserved_full, inventory.with_accounts, parsed.data.reason]);
        await audit(client, principal, { action: "agency.inventory_adjusted", entityType: "agency_inventory", entityPublicId: inventory.public_id, reason: parsed.data.reason, before: { fullOnHand: inventory.full_on_hand, emptyOnHand: inventory.empty_on_hand, lowStockThreshold: inventory.low_stock_threshold }, after: { fullOnHand: full, emptyOnHand: empty, lowStockThreshold: threshold }, requestId: response.locals.requestId ?? uuidV7() }); return { publicId: inventory.public_id, fullOnHand: full, availableFull: full - inventory.reserved_full, emptyOnHand: empty, reservedFull: inventory.reserved_full, withAccounts: inventory.with_accounts, lowStockThreshold: threshold };
      }); response.status(200).json({ inventory: result });
    } catch (error) { next(error); }
  });

  return router;
}
