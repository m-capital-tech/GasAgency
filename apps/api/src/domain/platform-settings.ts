import type pg from "pg";
import { HttpError } from "../http/error";

export const platformSettingRules = {
  "workflows.tenant_onboarding": { kind: "boolean" },
  "workflows.ordering": { kind: "boolean" },
  "workflows.cod_orders": { kind: "boolean" },
  "workflows.credit_orders": { kind: "boolean" },
  "workflows.agency_fulfillment": { kind: "boolean" },
  "workflows.collection_recording": { kind: "boolean" },
  "operations.approval_sla_hours": { kind: "number", minimum: 1, maximum: 168 },
  "operations.default_low_stock_threshold": { kind: "number", minimum: 0, maximum: 500 },
  "features.push_registration": { kind: "boolean" },
  "features.document_uploads": { kind: "boolean" },
} as const;

export type PlatformSettingKey = keyof typeof platformSettingRules;

export function isPlatformSettingKey(value: string): value is PlatformSettingKey {
  return Object.hasOwn(platformSettingRules, value);
}

export function validatePlatformSettingValue(key: PlatformSettingKey, value: unknown): boolean | number {
  const rule = platformSettingRules[key];
  if (rule.kind === "boolean") {
    if (typeof value !== "boolean") throw new HttpError(422, "invalid_setting_value", `${key} requires a boolean value.`);
    return value;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < rule.minimum || value > rule.maximum) {
    throw new HttpError(422, "invalid_setting_value", `${key} requires an integer from ${rule.minimum} to ${rule.maximum}.`);
  }
  return value;
}

export async function platformSettingValue(client: pg.Pool | pg.PoolClient, key: PlatformSettingKey): Promise<boolean | number> {
  const row = (await client.query<{ value: boolean | number }>("select value from app.platform_settings where setting_key = $1", [key])).rows[0];
  if (!row) throw new HttpError(503, "platform_configuration_missing", "A required platform control is unavailable.");
  return row.value;
}

export async function assertPlatformWorkflowEnabled(
  client: pg.Pool | pg.PoolClient,
  key: Extract<PlatformSettingKey, `workflows.${string}` | `features.${string}`>,
  message: string,
): Promise<void> {
  if (await platformSettingValue(client, key) !== true) {
    throw new HttpError(503, "workflow_paused", message, { settingKey: key });
  }
}
