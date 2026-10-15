import { z } from "zod";

const integer = (fallback: number, minimum: number, maximum: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback);
const boolean = (fallback: "true" | "false") => z.enum(["true", "false"]).default(fallback).transform((value) => value === "true");

function isBase64Key(value: string | undefined): boolean {
  if (!value) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 32 && decoded.toString("base64").replace(/=+$/, "") === value.replace(/=+$/, "");
}

const schema = z
  .object({
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    DATABASE_URL: z.string().min(1),
    DATABASE_SSL_MODE: z.enum(["disable", "require", "verify-full"]).default("verify-full"),
    DATABASE_CA_CERT: z.string().optional(),
    DATABASE_POOL_MAX: integer(5, 1, 20),
    DATABASE_STATEMENT_TIMEOUT_MS: integer(15_000, 1_000, 60_000),
    WORKER_POLL_INTERVAL_MS: integer(1_000, 100, 60_000),
    WORKER_BATCH_SIZE: integer(10, 1, 100),
    WORKER_STALE_LOCK_SECONDS: integer(300, 30, 3_600),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    SHUTDOWN_TIMEOUT_MS: integer(15_000, 1_000, 60_000),
    MESSAGE_PROVIDER: z.enum(["local", "messageindia"]).default("local"),
    OTP_DELIVERY_KEY: z.string().optional(),
    LOCAL_MESSAGE_REVEAL_CONTENT: boolean("false"),
    MESSAGEINDIA_SEND_URL: z.string().url().optional(),
    MESSAGEINDIA_TRANSPORT: z.enum(["get", "post"]).default("post"),
    MESSAGEINDIA_USERNAME: z.string().min(1).optional(),
    MESSAGEINDIA_API_KEY: z.string().min(16).optional(),
    MESSAGEINDIA_SENDER_NAME: z.string().regex(/^[A-Z0-9]{6}$/).optional(),
    MESSAGEINDIA_ENTITY_ID: z.string().regex(/^[0-9]{6,30}$/).optional(),
    MESSAGEINDIA_LOGIN_OTP_TEMPLATE_ID: z.string().regex(/^[0-9]{6,30}$/).optional(),
    MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT: z.string().min(1).max(1000).optional(),
    MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_ID: z.string().regex(/^[0-9]{6,30}$/).optional(),
    MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_TEXT: z.string().min(1).max(1000).optional(),
    MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_ID: z.string().regex(/^[0-9]{6,30}$/).optional(),
    MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_TEXT: z.string().min(1).max(1000).optional(),
    MESSAGEINDIA_REQUEST_TIMEOUT_MS: integer(10_000, 1_000, 30_000),
  })
  .superRefine((value, context) => {
    if (value.APP_ENV === "production" && value.DATABASE_SSL_MODE !== "verify-full") {
      context.addIssue({ code: "custom", path: ["DATABASE_SSL_MODE"], message: "production requires verify-full database TLS" });
    }
    if (value.DATABASE_SSL_MODE === "verify-full" && !value.DATABASE_CA_CERT) {
      context.addIssue({ code: "custom", path: ["DATABASE_CA_CERT"], message: "a database CA certificate is required for verify-full TLS" });
    }
    if (value.OTP_DELIVERY_KEY && !isBase64Key(value.OTP_DELIVERY_KEY)) {
      context.addIssue({ code: "custom", path: ["OTP_DELIVERY_KEY"], message: "must be a canonical base64-encoded 32-byte key" });
    }
    if (["staging", "production"].includes(value.APP_ENV) && value.MESSAGE_PROVIDER === "local") {
      context.addIssue({ code: "custom", path: ["MESSAGE_PROVIDER"], message: "the local messaging provider is forbidden outside local/test" });
    }
    if (["staging", "production"].includes(value.APP_ENV) && !value.OTP_DELIVERY_KEY) {
      context.addIssue({ code: "custom", path: ["OTP_DELIVERY_KEY"], message: "a dedicated OTP delivery encryption key is required outside local/test" });
    }
    if (["staging", "production"].includes(value.APP_ENV) && value.LOCAL_MESSAGE_REVEAL_CONTENT) {
      context.addIssue({ code: "custom", path: ["LOCAL_MESSAGE_REVEAL_CONTENT"], message: "local message content cannot be exposed outside local/test" });
    }
    if (value.MESSAGE_PROVIDER === "messageindia") {
      const required = [
        "MESSAGEINDIA_SEND_URL", "MESSAGEINDIA_USERNAME", "MESSAGEINDIA_API_KEY", "MESSAGEINDIA_SENDER_NAME", "MESSAGEINDIA_ENTITY_ID",
        "MESSAGEINDIA_LOGIN_OTP_TEMPLATE_ID", "MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT",
        "MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_ID", "MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_TEXT",
        "MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_ID", "MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_TEXT",
      ] as const;
      for (const key of required) {
        if (!value[key]) context.addIssue({ code: "custom", path: [key], message: "is required for the MessageIndia provider" });
      }
      if (value.MESSAGEINDIA_SEND_URL && new URL(value.MESSAGEINDIA_SEND_URL).protocol !== "https:") {
        context.addIssue({ code: "custom", path: ["MESSAGEINDIA_SEND_URL"], message: "must use HTTPS" });
      }
      if (["staging", "production"].includes(value.APP_ENV) && value.MESSAGEINDIA_TRANSPORT !== "post") {
        context.addIssue({ code: "custom", path: ["MESSAGEINDIA_TRANSPORT"], message: "staging and production require POST so credentials are not placed in URLs" });
      }
      if (value.MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT && !value.MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT.includes("{{code}}")) {
        context.addIssue({ code: "custom", path: ["MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT"], message: "must contain {{code}}" });
      }
      if (value.MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_TEXT && !value.MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_TEXT.includes("{{businessName}}")) {
        context.addIssue({ code: "custom", path: ["MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_TEXT"], message: "must contain {{businessName}}" });
      }
    }
  });

export function loadWorkerConfig(environment: NodeJS.ProcessEnv = process.env) {
  const value = schema.parse(environment);
  return {
    appEnv: value.APP_ENV,
    databaseUrl: value.DATABASE_URL,
    databaseSslMode: value.DATABASE_SSL_MODE,
    databaseCaCertificate: value.DATABASE_CA_CERT,
    databasePoolMax: value.DATABASE_POOL_MAX,
    databaseStatementTimeoutMs: value.DATABASE_STATEMENT_TIMEOUT_MS,
    pollIntervalMs: value.WORKER_POLL_INTERVAL_MS,
    batchSize: value.WORKER_BATCH_SIZE,
    staleLockSeconds: value.WORKER_STALE_LOCK_SECONDS,
    logLevel: value.LOG_LEVEL,
    shutdownTimeoutMs: value.SHUTDOWN_TIMEOUT_MS,
    messageProvider: value.MESSAGE_PROVIDER,
    otpDeliveryKey: value.OTP_DELIVERY_KEY ?? Buffer.alloc(32, 7).toString("base64"),
    localMessageRevealContent: value.LOCAL_MESSAGE_REVEAL_CONTENT,
    messageIndia: value.MESSAGE_PROVIDER === "messageindia" ? {
      sendUrl: value.MESSAGEINDIA_SEND_URL!,
      transport: value.MESSAGEINDIA_TRANSPORT,
      username: value.MESSAGEINDIA_USERNAME!,
      apiKey: value.MESSAGEINDIA_API_KEY!,
      senderName: value.MESSAGEINDIA_SENDER_NAME!,
      entityId: value.MESSAGEINDIA_ENTITY_ID!,
      requestTimeoutMs: value.MESSAGEINDIA_REQUEST_TIMEOUT_MS,
      templates: {
        login_otp: { id: value.MESSAGEINDIA_LOGIN_OTP_TEMPLATE_ID!, text: value.MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT! },
        tenant_registration: { id: value.MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_ID!, text: value.MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_TEXT! },
        platform_access: { id: value.MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_ID!, text: value.MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_TEXT! },
      },
    } : undefined,
  } as const;
}
