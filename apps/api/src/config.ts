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
    PORT: integer(8080, 1, 65_535),
    DATABASE_URL: z.string().min(1),
    DATABASE_SSL_MODE: z.enum(["disable", "require", "verify-full"]).default("verify-full"),
    DATABASE_CA_CERT: z.string().optional(),
    DATABASE_POOL_MAX: integer(10, 1, 50),
    DATABASE_STATEMENT_TIMEOUT_MS: integer(15_000, 1_000, 60_000),
    CORS_ORIGINS: z.string().default("http://localhost:3000"),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    SHUTDOWN_TIMEOUT_MS: integer(15_000, 1_000, 60_000),
    SESSION_TOKEN_PEPPER: z.string().min(32),
    OTP_HASH_PEPPER: z.string().min(32).optional(),
    OTP_DELIVERY_KEY: z.string().optional(),
    MFA_ENCRYPTION_KEY: z.string().optional(),
    PUSH_TOKEN_ENCRYPTION_KEY: z.string().optional(),
    OBJECT_STORAGE_PROVIDER: z.enum(["disabled", "local", "spaces"]).default("disabled"),
    OBJECT_STORAGE_ENDPOINT: z.string().url().optional(),
    OBJECT_STORAGE_REGION: z.string().trim().min(2).max(64).default("blr1"),
    OBJECT_STORAGE_BUCKET: z.string().trim().min(3).max(255).optional(),
    OBJECT_STORAGE_ACCESS_KEY: z.string().min(8).optional(),
    OBJECT_STORAGE_SECRET_KEY: z.string().min(16).optional(),
    OBJECT_STORAGE_LOCAL_ROOT: z.string().trim().min(1).default(".local-object-storage"),
    OBJECT_STORAGE_MAX_BYTES: integer(10 * 1024 * 1024, 1024, 10 * 1024 * 1024),
    MFA_TICKET_PEPPER: z.string().min(32).optional(),
    MFA_ISSUER: z.string().trim().min(2).max(80).default("Commercial LPG Platform"),
    MFA_TICKET_TTL_SECONDS: integer(600, 300, 900),
    MFA_MAX_ATTEMPTS: integer(5, 3, 10),
    PRIVILEGED_SESSION_TTL_SECONDS: integer(28_800, 900, 86_400),
    OTP_LOCAL_CODE: z.string().regex(/^[0-9]{6}$/).optional(),
    OTP_LOCAL_EXPOSE_CODE: boolean("false"),
    OTP_TTL_SECONDS: integer(300, 60, 900),
    OTP_RESEND_SECONDS: integer(60, 30, 300),
    OTP_MAX_ATTEMPTS: integer(5, 1, 10),
    SESSION_TTL_SECONDS: integer(2_592_000, 3_600, 7_776_000),
  })
  .superRefine((value, context) => {
    if (value.APP_ENV === "production" && value.DATABASE_SSL_MODE !== "verify-full") {
      context.addIssue({ code: "custom", path: ["DATABASE_SSL_MODE"], message: "production requires verify-full database TLS" });
    }
    if (value.DATABASE_SSL_MODE === "verify-full" && !value.DATABASE_CA_CERT) {
      context.addIssue({ code: "custom", path: ["DATABASE_CA_CERT"], message: "a database CA certificate is required for verify-full TLS" });
    }
    if (["staging", "production"].includes(value.APP_ENV) && !value.OTP_HASH_PEPPER) {
      context.addIssue({ code: "custom", path: ["OTP_HASH_PEPPER"], message: "a dedicated OTP hash pepper is required outside local/test" });
    }
    if (["staging", "production"].includes(value.APP_ENV) && !value.OTP_DELIVERY_KEY) {
      context.addIssue({ code: "custom", path: ["OTP_DELIVERY_KEY"], message: "a dedicated OTP delivery encryption key is required outside local/test" });
    }
    if (["staging", "production"].includes(value.APP_ENV) && !value.MFA_ENCRYPTION_KEY) {
      context.addIssue({ code: "custom", path: ["MFA_ENCRYPTION_KEY"], message: "a dedicated MFA encryption key is required outside local/test" });
    }
    if (["staging", "production"].includes(value.APP_ENV) && !value.PUSH_TOKEN_ENCRYPTION_KEY) {
      context.addIssue({ code: "custom", path: ["PUSH_TOKEN_ENCRYPTION_KEY"], message: "a dedicated push-token encryption key is required outside local/test" });
    }
    if (["staging", "production"].includes(value.APP_ENV) && !value.MFA_TICKET_PEPPER) {
      context.addIssue({ code: "custom", path: ["MFA_TICKET_PEPPER"], message: "a dedicated MFA ticket pepper is required outside local/test" });
    }
    if (value.OTP_DELIVERY_KEY && !isBase64Key(value.OTP_DELIVERY_KEY)) {
      context.addIssue({ code: "custom", path: ["OTP_DELIVERY_KEY"], message: "must be a canonical base64-encoded 32-byte key" });
    }
    if (value.MFA_ENCRYPTION_KEY && !isBase64Key(value.MFA_ENCRYPTION_KEY)) {
      context.addIssue({ code: "custom", path: ["MFA_ENCRYPTION_KEY"], message: "must be a canonical base64-encoded 32-byte key" });
    }
    if (value.PUSH_TOKEN_ENCRYPTION_KEY && !isBase64Key(value.PUSH_TOKEN_ENCRYPTION_KEY)) {
      context.addIssue({ code: "custom", path: ["PUSH_TOKEN_ENCRYPTION_KEY"], message: "must be a canonical base64-encoded 32-byte key" });
    }
    if (value.OBJECT_STORAGE_PROVIDER === "local" && ["staging", "production"].includes(value.APP_ENV)) {
      context.addIssue({ code: "custom", path: ["OBJECT_STORAGE_PROVIDER"], message: "local object storage is forbidden outside local/test" });
    }
    if (value.OBJECT_STORAGE_PROVIDER === "spaces") {
      for (const key of ["OBJECT_STORAGE_ENDPOINT", "OBJECT_STORAGE_BUCKET", "OBJECT_STORAGE_ACCESS_KEY", "OBJECT_STORAGE_SECRET_KEY"] as const) {
        if (!value[key]) context.addIssue({ code: "custom", path: [key], message: `${key} is required for Spaces object storage` });
      }
      if (["staging", "production"].includes(value.APP_ENV) && value.OBJECT_STORAGE_ENDPOINT && !value.OBJECT_STORAGE_ENDPOINT.startsWith("https://")) {
        context.addIssue({ code: "custom", path: ["OBJECT_STORAGE_ENDPOINT"], message: "Spaces requires an HTTPS endpoint outside local/test" });
      }
    }
    if (["staging", "production"].includes(value.APP_ENV) && (value.OTP_LOCAL_CODE || value.OTP_LOCAL_EXPOSE_CODE)) {
      context.addIssue({ code: "custom", path: ["OTP_LOCAL_CODE"], message: "local OTP controls are forbidden outside local/test" });
    }
  });

export interface ApiConfig {
  appEnv: "local" | "test" | "staging" | "production";
  port: number;
  databaseUrl: string;
  databaseSslMode: "disable" | "require" | "verify-full";
  databaseCaCertificate?: string;
  databasePoolMax: number;
  databaseStatementTimeoutMs: number;
  corsOrigins: string[];
  logLevel: "debug" | "info" | "warn" | "error";
  shutdownTimeoutMs: number;
  sessionTokenPepper: string;
  otpHashPepper: string;
  otpDeliveryKey: string;
  mfaEncryptionKey: string;
  pushTokenEncryptionKey: string;
  objectStorageProvider: "disabled" | "local" | "spaces";
  objectStorageEndpoint?: string;
  objectStorageRegion: string;
  objectStorageBucket?: string;
  objectStorageAccessKey?: string;
  objectStorageSecretKey?: string;
  objectStorageLocalRoot: string;
  objectStorageMaxBytes: number;
  mfaTicketPepper: string;
  mfaIssuer: string;
  mfaTicketTtlSeconds: number;
  mfaMaxAttempts: number;
  privilegedSessionTtlSeconds: number;
  otpLocalCode?: string;
  otpLocalExposeCode: boolean;
  otpTtlSeconds: number;
  otpResendSeconds: number;
  otpMaxAttempts: number;
  sessionTtlSeconds: number;
}

export function loadApiConfig(environment: NodeJS.ProcessEnv = process.env): ApiConfig {
  const value = schema.parse(environment);
  const corsOrigins = value.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);
  if (corsOrigins.length === 0) throw new Error("CORS_ORIGINS must contain at least one origin");
  for (const origin of corsOrigins) new URL(origin);

  return {
    appEnv: value.APP_ENV,
    port: value.PORT,
    databaseUrl: value.DATABASE_URL,
    databaseSslMode: value.DATABASE_SSL_MODE,
    databaseCaCertificate: value.DATABASE_CA_CERT,
    databasePoolMax: value.DATABASE_POOL_MAX,
    databaseStatementTimeoutMs: value.DATABASE_STATEMENT_TIMEOUT_MS,
    corsOrigins,
    logLevel: value.LOG_LEVEL,
    shutdownTimeoutMs: value.SHUTDOWN_TIMEOUT_MS,
    sessionTokenPepper: value.SESSION_TOKEN_PEPPER,
    otpHashPepper: value.OTP_HASH_PEPPER ?? "local-only-otp-hash-pepper-do-not-deploy",
    otpDeliveryKey: value.OTP_DELIVERY_KEY ?? Buffer.alloc(32, 7).toString("base64"),
    mfaEncryptionKey: value.MFA_ENCRYPTION_KEY ?? Buffer.alloc(32, 11).toString("base64"),
    pushTokenEncryptionKey: value.PUSH_TOKEN_ENCRYPTION_KEY ?? Buffer.alloc(32, 13).toString("base64"),
    objectStorageProvider: value.OBJECT_STORAGE_PROVIDER,
    objectStorageEndpoint: value.OBJECT_STORAGE_ENDPOINT,
    objectStorageRegion: value.OBJECT_STORAGE_REGION,
    objectStorageBucket: value.OBJECT_STORAGE_BUCKET,
    objectStorageAccessKey: value.OBJECT_STORAGE_ACCESS_KEY,
    objectStorageSecretKey: value.OBJECT_STORAGE_SECRET_KEY,
    objectStorageLocalRoot: value.OBJECT_STORAGE_LOCAL_ROOT,
    objectStorageMaxBytes: value.OBJECT_STORAGE_MAX_BYTES,
    mfaTicketPepper: value.MFA_TICKET_PEPPER ?? "local-only-mfa-ticket-pepper-do-not-deploy",
    mfaIssuer: value.MFA_ISSUER,
    mfaTicketTtlSeconds: value.MFA_TICKET_TTL_SECONDS,
    mfaMaxAttempts: value.MFA_MAX_ATTEMPTS,
    privilegedSessionTtlSeconds: value.PRIVILEGED_SESSION_TTL_SECONDS,
    otpLocalCode: value.OTP_LOCAL_CODE,
    otpLocalExposeCode: value.OTP_LOCAL_EXPOSE_CODE,
    otpTtlSeconds: value.OTP_TTL_SECONDS,
    otpResendSeconds: value.OTP_RESEND_SECONDS,
    otpMaxAttempts: value.OTP_MAX_ATTEMPTS,
    sessionTtlSeconds: value.SESSION_TTL_SECONDS,
  };
}
