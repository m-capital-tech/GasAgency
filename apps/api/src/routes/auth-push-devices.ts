import { createHash } from "node:crypto";
import type pg from "pg";
import { Router } from "express";
import { encryptSecret, uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { assertPlatformWorkflowEnabled } from "../domain/platform-settings";
import { HttpError } from "../http/error";
import { authenticatedPrincipal, requireAuthentication } from "../security/auth";

const expoTokenPattern = /^Expo(?:nent)?PushToken\[[^\]\s]{10,400}\]$/;
const registrationSchema = z.object({
  action: z.enum(["register", "revoke"]).default("register"),
  provider: z.literal("expo"),
  token: z.string().min(20).max(512).regex(expoTokenPattern, "must be a valid Expo push token"),
  platform: z.enum(["android", "ios"]),
  projectId: z.string().uuid(),
  appVersion: z.string().trim().min(1).max(64).nullable(),
}).strict();

export function hashPushToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function pushTokenAssociatedData(userPublicId: string, provider: "expo", tokenDigest: Buffer): string {
  return `commercial-lpg:push-token:v1:${userPublicId}:${provider}:${tokenDigest.toString("hex")}`;
}

interface PushDeviceRow {
  public_id: string;
  provider: "expo";
  platform: "android" | "ios";
  project_id: string;
  app_version: string | null;
  status: "active" | "stale" | "revoked";
  last_registered_at: Date;
}

const activeTenantMembership = `exists (
  select 1
    from app.tenant_memberships membership
    join app.tenants tenant on tenant.id = membership.tenant_id
   where membership.user_id = $1
     and membership.status = 'active'
     and tenant.status = 'active'
)`;

export function authPushDevicesRouter(options: { pool: pg.Pool; tokenPepper: string; encryptionKey: string }): Router {
  const router = Router();
  const authenticate = requireAuthentication({ pool: options.pool, tokenPepper: options.tokenPepper });

  router.post("/auth/push-devices", authenticate, async (request, response, next) => {
    try {
      const parsed = registrationSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new HttpError(400, "invalid_push_device", "The push-device registration is invalid.", parsed.error.flatten());
      }

      const principal = authenticatedPrincipal(response);
      const registration = parsed.data;
      if (registration.action === "register") {
        await assertPlatformWorkflowEnabled(options.pool, "features.push_registration", "Push notification registration is not enabled for this release.");
      }
      const tokenDigest = hashPushToken(registration.token);

      if (registration.action === "revoke") {
        const revoked = await options.pool.query<{ tenant_access: boolean; public_id: string | null }>(
          `with access as materialized (
             select ${activeTenantMembership} as tenant_access
           ), changed as (
             update app.push_devices device
                set status = 'revoked',
                    status_reason = 'user_revoked',
                    revoked_at = coalesce(device.revoked_at, now()),
                    updated_at = now()
              where device.user_id = $1
                and device.provider = $2
                and device.token_digest = $3
                and (select tenant_access from access)
              returning device.public_id::text
           )
           select access.tenant_access,
                  (select changed.public_id from changed limit 1) as public_id
             from access`,
          [principal.userId, registration.provider, tokenDigest],
        );
        if (!revoked.rows[0]?.tenant_access) {
          throw new HttpError(403, "tenant_access_required", "An active tenant membership is required to manage push notifications.");
        }
        response.status(200).json({ status: "revoked" });
        return;
      }

      const devicePublicId = uuidV7();
      const tokenEnvelope = encryptSecret(
        registration.token,
        options.encryptionKey,
        pushTokenAssociatedData(principal.userPublicId, registration.provider, tokenDigest),
      );
      const result = await options.pool.query<PushDeviceRow>(
        `insert into app.push_devices (
           public_id, user_id, last_registered_session_id, provider, token_digest,
           token_envelope, platform, project_id, app_version
         )
         select $2, $1, $3, $4, $5, $6, $7, $8, $9
          where ${activeTenantMembership}
         on conflict (provider, token_digest)
         do update set
           user_id = excluded.user_id,
           last_registered_session_id = excluded.last_registered_session_id,
           token_envelope = excluded.token_envelope,
           platform = excluded.platform,
           project_id = excluded.project_id,
           app_version = excluded.app_version,
           status = 'active',
           status_reason = null,
           last_registered_at = now(),
           stale_at = null,
           revoked_at = null,
           updated_at = now()
         returning public_id::text, provider, platform, project_id::text, app_version, status, last_registered_at`,
        [
          principal.userId,
          devicePublicId,
          principal.sessionId,
          registration.provider,
          tokenDigest,
          tokenEnvelope,
          registration.platform,
          registration.projectId,
          registration.appVersion,
        ],
      );
      const device = result.rows[0];
      if (!device) {
        throw new HttpError(403, "tenant_access_required", "An active tenant membership is required to register push notifications.");
      }
      response.status(200).json({
        status: "registered",
        device: {
          publicId: device.public_id,
          provider: device.provider,
          platform: device.platform,
          projectId: device.project_id,
          appVersion: device.app_version,
          registeredAt: device.last_registered_at.toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
