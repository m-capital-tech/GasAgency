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
    MESSAGE_PROVIDER: z.literal("local").default("local"),
    OTP_DELIVERY_KEY: z.string().optional(),
    LOCAL_MESSAGE_REVEAL_CONTENT: boolean("false"),
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
  } as const;
}
