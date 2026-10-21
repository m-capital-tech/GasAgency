import type pg from "pg";
import { Router } from "express";
import { withTransaction } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";
import { isPlatformSettingKey, validatePlatformSettingValue } from "../domain/platform-settings";
import { HttpError } from "../http/error";
import { assertFreshMfa, authenticatedPrincipal, requireAuthentication } from "../security/auth";
import { hasPermission, hasRoleType } from "../security/rbac";

const updateSchema = z.object({
  changes: z.array(z.object({
    key: z.string().trim().min(3).max(100),
    value: z.union([z.boolean(), z.number()]),
    expectedVersion: z.number().int().positive(),
  }).strict()).min(1).max(20).refine((changes) => new Set(changes.map((change) => change.key)).size === changes.length, "setting keys must be unique"),
  reason: z.string().trim().min(10).max(500),
}).strict();

function requireSuperAdmin(principal: ReturnType<typeof authenticatedPrincipal>, permission: string) {
  if (!hasRoleType(principal, "super_admin") || !hasPermission(principal, permission)) {
    throw new HttpError(403, "permission_denied", "Super Admin configuration authority is required.");
  }
}

export function systemConfigurationRouter(options: { pool: pg.Pool; tokenPepper: string }): Router {
  const router = Router();
  router.use(requireAuthentication(options));

  router.get("/admin/configuration", async (_request, response, next) => {
    try {
      const principal = authenticatedPrincipal(response);
      requireSuperAdmin(principal, "configuration.view");
      const settings = await options.pool.query<{
        key: string; category: string; display_name: string; description: string;
        value: boolean | number; value_type: "boolean" | "number"; version: number;
        updated_at: Date; updated_by_name: string | null;
      }>(
        `select setting.setting_key as key, setting.category, setting.display_name, setting.description,
                setting.value, setting.value_type, setting.version, setting.updated_at,
                actor.full_name as updated_by_name
           from app.platform_settings setting
           left join app.users actor on actor.id = setting.updated_by_user_id
          order by case setting.category when 'workflow' then 1 when 'operations' then 2 else 3 end,
                   setting.setting_key`,
      );
      response.status(200).json({
        settings: settings.rows.map((setting) => ({
          key: setting.key,
          category: setting.category,
          displayName: setting.display_name,
          description: setting.description,
          value: setting.value,
          valueType: setting.value_type,
          version: setting.version,
          updatedAt: setting.updated_at.toISOString(),
          updatedByName: setting.updated_by_name,
        })),
      });
    } catch (error) { next(error); }
  });

  router.post("/admin/configuration", async (request, response, next) => {
    try {
      const parsed = updateSchema.safeParse(request.body);
      if (!parsed.success) throw new HttpError(400, "invalid_request", "The configuration update is invalid.", parsed.error.flatten());
      const principal = authenticatedPrincipal(response);
      requireSuperAdmin(principal, "configuration.manage");
      assertFreshMfa(principal);
      const changes = parsed.data.changes.map((change) => {
        if (!isPlatformSettingKey(change.key)) throw new HttpError(422, "unknown_setting", `The setting ${change.key} is not governed by this release.`);
        return { ...change, value: validatePlatformSettingValue(change.key, change.value) };
      }).sort((left, right) => left.key.localeCompare(right.key));

      const updated = await withTransaction(options.pool, async (client) => {
        const keys = changes.map((change) => change.key);
        const current = await client.query<{ key: string; value: boolean | number; version: number }>(
          `select setting_key as key, value, version
             from app.platform_settings
            where setting_key = any($1::text[])
            order by setting_key
            for update`,
          [keys],
        );
        if (current.rowCount !== changes.length) throw new HttpError(409, "configuration_changed", "One or more settings are unavailable. Refresh before trying again.");
        const byKey = new Map(current.rows.map((setting) => [setting.key, setting]));
        const conflicts = changes.filter((change) => byKey.get(change.key)?.version !== change.expectedVersion).map((change) => change.key);
        if (conflicts.length) throw new HttpError(409, "configuration_changed", "The configuration changed after it was loaded. Refresh before trying again.", { keys: conflicts });

        for (const change of changes) {
          const before = byKey.get(change.key)!;
          await client.query(
            `update app.platform_settings
                set value = $2::jsonb, version = version + 1,
                    updated_by_user_id = $3, updated_at = now()
              where setting_key = $1`,
            [change.key, JSON.stringify(change.value), principal.userId],
          );
          await client.query(
            `insert into app.audit_events (
               public_id, actor_user_id, actor_role, action, entity_type,
               reason, before_values, after_values, request_id, correlation_id
             ) values ($1, $2, 'super_admin', 'configuration.updated', 'platform_setting',
                       $3, $4::jsonb, $5::jsonb, $6, $7)`,
            [uuidV7(), principal.userId, parsed.data.reason,
              JSON.stringify({ key: change.key, value: before.value, version: before.version }),
              JSON.stringify({ key: change.key, value: change.value, version: before.version + 1 }),
              response.locals.requestId ?? uuidV7(), uuidV7()],
          );
        }
        return keys;
      });

      const settings = await options.pool.query<{ key: string; value: boolean | number; version: number; updated_at: Date }>(
        `select setting_key as key, value, version, updated_at
           from app.platform_settings where setting_key = any($1::text[]) order by setting_key`,
        [updated],
      );
      response.status(200).json({ settings: settings.rows.map((setting) => ({ key: setting.key, value: setting.value, version: setting.version, updatedAt: setting.updated_at.toISOString() })) });
    } catch (error) { next(error); }
  });

  return router;
}
