import type pg from "pg";
import { Router } from "express";
import { withTransaction } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { activeAgencyAccess } from "../domain/agency-access";
import { platformAccessFromAssignments } from "../domain/platform-access";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";

interface TenantMembershipRow {
  public_id: string;
  display_name: string;
  membership_type: string;
}

async function activeTenantMemberships(pool: pg.Pool, userId: string) {
  const result = await pool.query<TenantMembershipRow>(
    `select tenant.public_id::text,
            tenant.display_name,
            membership.membership_type
       from app.tenant_memberships membership
       join app.tenants tenant on tenant.id = membership.tenant_id
      where membership.user_id = $1
        and membership.status = 'active'
        and tenant.status = 'active'
      order by tenant.display_name, tenant.public_id`,
    [userId],
  );
  return result.rows.map((membership) => ({
    publicId: membership.public_id,
    displayName: membership.display_name,
    membershipType: membership.membership_type,
  }));
}

export function authSessionRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const { pool, tokenPepper } = options;
  const router = Router();
  const authenticate = requireAuthentication({ pool, tokenPepper });

  router.get("/auth/session", authenticate, async (_request, response, next) => {
    try {
      const principal = authenticatedPrincipal(response);
      const [tenants, agencies] = await Promise.all([
        activeTenantMemberships(pool, principal.userId),
        activeAgencyAccess(pool, principal.userId),
      ]);
      response.status(200).json({
        user: {
          publicId: principal.userPublicId,
          fullName: principal.fullName,
          phoneE164: principal.phoneE164,
        },
        session: {
          publicId: principal.sessionPublicId,
          authMethod: principal.authMethod,
          mfaVerifiedAt: principal.mfaVerifiedAt?.toISOString() ?? null,
        },
        tenants,
        agencies,
        platformAccess: platformAccessFromAssignments(principal.assignments),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/auth/logout", authenticate, async (request, response, next) => {
    try {
      const principal = authenticatedPrincipal(response);
      await withTransaction(pool, async (client) => {
        await client.query(
          `update app.device_sessions
              set revoked_at = coalesce(revoked_at, now()),
                  revoke_reason = coalesce(revoke_reason, 'user_logout')
            where id = $1 and user_id = $2`,
          [principal.sessionId, principal.userId],
        );
        await client.query(
          `insert into app.audit_events (
             public_id, actor_user_id, action, entity_type, entity_public_id,
             after_values, request_id, correlation_id, source_ip, user_agent
           ) values ($1, $2, 'auth.session_revoked', 'device_session', $3, $4::jsonb, $5, $6, $7, $8)`,
          [
            uuidV7(),
            principal.userId,
            principal.sessionPublicId,
            JSON.stringify({ reason: "user_logout" }),
            uuidV7(),
            uuidV7(),
            request.ip || null,
            request.header("user-agent")?.slice(0, 500) ?? null,
          ],
        );
      });
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  return router;
}
