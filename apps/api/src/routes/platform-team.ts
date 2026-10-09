import type pg from "pg";
import { Router } from "express";
import { withTransaction, type AuthPrincipal } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { assertAuthorized, hasPermission, hasRoleType, type AuthorizationTarget } from "../security/rbac";

const permissionKey = z.string().regex(/^[a-z_]+\.[a-z_]+$/);
const e164 = z.string().regex(/^\+[1-9][0-9]{7,14}$/);
const roleSchema = z.object({
  name: z.string().trim().min(2).max(100),
  roleType: z.enum(["platform_admin", "platform_team"]),
  permissionKeys: z.array(permissionKey).min(1).max(60).refine((keys) => new Set(keys).size === keys.length, "permissions must be unique"),
  reason: z.string().trim().min(3).max(500),
}).strict();

const scopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("global") }),
  z.object({ kind: z.literal("region"), value: z.string().trim().min(2).max(100) }),
  z.object({ kind: z.literal("city"), value: z.string().trim().min(2).max(100) }),
  z.object({ kind: z.literal("agency"), agencyPublicId: z.string().uuid() }),
  z.object({ kind: z.literal("selected_agencies"), agencyPublicIds: z.array(z.string().uuid()).min(1).max(50).refine((ids) => new Set(ids).size === ids.length, "agencies must be unique") }),
  z.object({ kind: z.literal("tenant"), tenantPublicId: z.string().uuid() }),
]);

const teamMemberSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  phoneE164: e164,
  email: z.string().email().max(320).optional(),
  rolePublicId: z.string().uuid(),
  scope: scopeSchema,
  reason: z.string().trim().min(3).max(500),
}).strict();

type Scope = z.infer<typeof scopeSchema>;

function isDatabaseConflict(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function requirePermission(principal: AuthPrincipal, permission: string): void {
  if (!hasPermission(principal, permission)) {
    throw new HttpError(403, "permission_denied", `The ${permission} permission is required.`);
  }
}

function targetForScope(scope: Scope): AuthorizationTarget {
  switch (scope.kind) {
    case "global": return {};
    case "region": return { region: scope.value };
    case "city": return { city: scope.value };
    case "agency": return { agencyPublicId: scope.agencyPublicId };
    case "tenant": return { tenantPublicId: scope.tenantPublicId };
    case "selected_agencies": return { agencyPublicId: scope.agencyPublicIds[0] };
  }
}

function assertCanAssignScope(principal: AuthPrincipal, scope: Scope): void {
  const targets = scope.kind === "selected_agencies"
    ? scope.agencyPublicIds.map((agencyPublicId) => ({ agencyPublicId }))
    : [targetForScope(scope)];
  for (const target of targets) {
    assertAuthorized(principal, "user.create", target);
    assertAuthorized(principal, "role.manage", target);
  }
}

export function platformTeamRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.post("/admin/roles", async (request, response, next) => {
    try {
      const parsed = roleSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The role definition is invalid.", parsed.error.flatten());
      const principal = authenticatedPrincipal(response);
      if (!hasRoleType(principal, "super_admin") && !hasRoleType(principal, "platform_admin")) {
        throw new HttpError(403, "permission_denied", "Only a Super Admin or Platform Admin can manage platform roles.");
      }
      requirePermission(principal, "role.create");
      requirePermission(principal, "role.manage");
      const superAdmin = hasRoleType(principal, "super_admin");
      if (parsed.data.roleType === "platform_admin" && !superAdmin) {
        throw new HttpError(403, "permission_denied", "Only a Super Admin can create a Platform Admin role.");
      }

      const actorPermissions = new Set(principal.assignments.flatMap((assignment) => assignment.permissions));
      const created = await withTransaction(options.pool, async (client) => {
        const permissions = await client.query<{ id: string; key: string; reserved: boolean }>(
          `select id::text, resource || '.' || action as key, reserved
             from app.permissions
            where resource || '.' || action = any($1::text[])`,
          [parsed.data.permissionKeys],
        );
        if (permissions.rowCount !== parsed.data.permissionKeys.length) {
          const found = new Set(permissions.rows.map((permission) => permission.key));
          throw new HttpError(422, "unknown_permission", "One or more requested permissions do not exist.", { unknown: parsed.data.permissionKeys.filter((key) => !found.has(key)) });
        }
        const beyondCeiling = parsed.data.permissionKeys.filter((key) => !actorPermissions.has(key));
        if (beyondCeiling.length) {
          throw new HttpError(403, "permission_ceiling_exceeded", "A role cannot grant permissions the creator does not possess.", { permissions: beyondCeiling });
        }
        if (parsed.data.roleType === "platform_team") {
          const reserved = permissions.rows.filter((permission) => permission.reserved).map((permission) => permission.key);
          if (reserved.length) throw new HttpError(403, "reserved_permission", "Reserved permissions cannot be delegated to a platform-team role.", { permissions: reserved });
        }

        const rolePublicId = uuidV7();
        const role = (
          await client.query<{ id: string }>(
            `insert into app.roles (
               public_id, name, role_type, is_system, is_reserved, managed_by_user_id, status
             ) values ($1, $2, $3, false, false, $4, 'active')
             returning id::text`,
            [rolePublicId, parsed.data.name, parsed.data.roleType, principal.userId],
          )
        ).rows[0]!;
        await client.query(
          `insert into app.role_permissions (role_id, permission_id, granted_by_user_id)
           select $1, permission_id::bigint, $2 from unnest($3::text[]) permission_id`,
          [role.id, principal.userId, permissions.rows.map((permission) => permission.id)],
        );
        await client.query(
          `insert into app.audit_events (
             public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
             reason, after_values, request_id, correlation_id
           ) values ($1, $2, $3, 'role.created', 'role', $4, $5, $6::jsonb, $7, $8)`,
          [uuidV7(), principal.userId, principal.assignments.map((assignment) => assignment.roleType).join(","), rolePublicId, parsed.data.reason, JSON.stringify({ name: parsed.data.name, roleType: parsed.data.roleType, permissionKeys: parsed.data.permissionKeys }), uuidV7(), uuidV7()],
        );
        return { publicId: rolePublicId, name: parsed.data.name, roleType: parsed.data.roleType, permissionKeys: parsed.data.permissionKeys, status: "active" as const };
      });
      response.status(201).json({ role: created });
    } catch (error) {
      next(isDatabaseConflict(error) ? new HttpError(409, "role_conflict", "A role with this name already exists for the managing administrator.") : error);
    }
  });

  router.post("/admin/team-members", async (request, response, next) => {
    try {
      const parsed = teamMemberSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The team-member assignment is invalid.", parsed.error.flatten());
      const principal = authenticatedPrincipal(response);
      if (!hasRoleType(principal, "super_admin") && !hasRoleType(principal, "platform_admin")) {
        throw new HttpError(403, "permission_denied", "Only a Super Admin or Platform Admin can add platform team members.");
      }
      assertCanAssignScope(principal, parsed.data.scope);
      const superAdmin = hasRoleType(principal, "super_admin");

      const assigned = await withTransaction(options.pool, async (client) => {
        const role = (
          await client.query<{ id: string; public_id: string; role_type: string; managed_by_user_id: string | null }>(
            `select id::text, public_id::text, role_type, managed_by_user_id::text
               from app.roles where public_id = $1 and status = 'active' for share`,
            [parsed.data.rolePublicId],
          )
        ).rows[0];
        if (!role) throw new HttpError(422, "role_unavailable", "The selected role is unavailable.");
        if (!superAdmin && role.managed_by_user_id !== principal.userId) {
          throw new HttpError(403, "permission_denied", "You can assign only roles managed by your account.");
        }
        if (role.role_type === "platform_admin" && !superAdmin) {
          throw new HttpError(403, "permission_denied", "Only a Super Admin can assign Platform Admin access.");
        }

        let agencyRows: Array<{ id: string; public_id: string }> = [];
        if (parsed.data.scope.kind === "agency" || parsed.data.scope.kind === "selected_agencies") {
          const publicIds = parsed.data.scope.kind === "agency" ? [parsed.data.scope.agencyPublicId] : parsed.data.scope.agencyPublicIds;
          const agencies = await client.query<{ id: string; public_id: string }>(
            "select id::text, public_id::text from app.agencies where public_id = any($1::uuid[]) and status = 'approved' order by public_id",
            [publicIds],
          );
          if (agencies.rowCount !== publicIds.length) throw new HttpError(422, "agency_unavailable", "Every assigned agency must be approved and active.");
          agencyRows = agencies.rows;
        }
        if (parsed.data.scope.kind === "tenant") {
          const tenant = await client.query("select 1 from app.tenants where public_id = $1 and status <> 'archived'", [parsed.data.scope.tenantPublicId]);
          if (!tenant.rowCount) throw new HttpError(422, "tenant_unavailable", "The selected tenant is unavailable.");
        }

        const insertedUser = await client.query<{ id: string; public_id: string; status: string }>(
          `insert into app.users (public_id, phone_e164, full_name, email, status, mfa_required)
           values ($1, $2, $3, $4, 'invited', true)
           on conflict (phone_e164) do nothing
           returning id::text, public_id::text, status`,
          [uuidV7(), parsed.data.phoneE164, parsed.data.fullName, parsed.data.email ?? null],
        );
        const user = insertedUser.rows[0] ?? (
          await client.query<{ id: string; public_id: string; status: string }>(
            "select id::text, public_id::text, status from app.users where phone_e164 = $1 for update",
            [parsed.data.phoneE164],
          )
        ).rows[0];
        if (!user || ["suspended", "archived"].includes(user.status)) {
          throw new HttpError(409, "user_unavailable", "The phone belongs to a suspended or archived user.");
        }
        await client.query("update app.users set mfa_required = true, updated_at = now() where id = $1 and not mfa_required", [user.id]);

        const scopeValue = parsed.data.scope.kind === "global" || parsed.data.scope.kind === "selected_agencies"
          ? null
          : parsed.data.scope.kind === "agency"
            ? parsed.data.scope.agencyPublicId
            : parsed.data.scope.kind === "tenant"
              ? parsed.data.scope.tenantPublicId
              : parsed.data.scope.value;
        const assignmentPublicId = uuidV7();
        const assignment = (
          await client.query<{ id: string }>(
            `insert into app.role_assignments (
               public_id, user_id, role_id, scope_kind, scope_value, assigned_by_user_id, status
             ) values ($1, $2, $3, $4, $5, $6, 'active')
             returning id::text`,
            [assignmentPublicId, user.id, role.id, parsed.data.scope.kind, scopeValue, principal.userId],
          )
        ).rows[0]!;
        if (parsed.data.scope.kind === "selected_agencies") {
          for (const agency of agencyRows) {
            await client.query(
              "insert into app.role_assignment_agencies (role_assignment_id, agency_id) values ($1, $2)",
              [assignment.id, agency.id],
            );
          }
        }
        const invitationPublicId = uuidV7();
        await client.query(
          `insert into app.platform_user_invitations (
             public_id, user_id, role_assignment_id, status, idempotency_key, created_by_user_id
           ) values ($1, $2, $3, 'queued', $4, $5)`,
          [invitationPublicId, user.id, assignment.id, `platform-assignment:${assignmentPublicId}`, principal.userId],
        );
        await client.query(
          `insert into app.outbox_events (
             public_id, event_type, aggregate_type, aggregate_public_id, payload, dedupe_key
           ) values ($1, 'platform_user.invitation.sms.requested', 'platform_user_invitation', $2, $3::jsonb, $4)`,
          [uuidV7(), invitationPublicId, JSON.stringify({ invitationPublicId, userPublicId: user.public_id, destinationE164: parsed.data.phoneE164, rolePublicId: role.public_id, roleAssignmentPublicId: assignmentPublicId, strategy: "sms_first", whatsappFallbackAfterSeconds: 300 }), `platform-user-invitation-sms:${invitationPublicId}`],
        );
        await client.query(
          `insert into app.audit_events (
             public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
             reason, after_values, request_id, correlation_id
           ) values ($1, $2, $3, 'role.assigned', 'user', $4, $5, $6::jsonb, $7, $8)`,
          [uuidV7(), principal.userId, principal.assignments.map((assignment) => assignment.roleType).join(","), user.public_id, parsed.data.reason, JSON.stringify({ rolePublicId: role.public_id, scope: parsed.data.scope, assignmentPublicId, invitationPublicId }), uuidV7(), uuidV7()],
        );
        return {
          user: { publicId: user.public_id, phoneE164: parsed.data.phoneE164, status: user.status },
          assignment: { publicId: assignmentPublicId, rolePublicId: role.public_id, scope: parsed.data.scope, status: "active" as const },
          invitation: { publicId: invitationPublicId, status: "queued" as const, channel: "sms" as const },
        };
      });
      response.status(201).json(assigned);
    } catch (error) {
      next(isDatabaseConflict(error) ? new HttpError(409, "team_assignment_conflict", "This active team assignment already exists.") : error);
    }
  });

  return router;
}
