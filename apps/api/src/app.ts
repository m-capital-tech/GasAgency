import { randomUUID } from "node:crypto";
import type pg from "pg";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { databaseIsReady } from "@platform/database";
import type { Logger } from "@platform/runtime";
import type { ApiConfig } from "./config";
import { HttpError } from "./http/error";
import { authOtpRouter } from "./routes/auth-otp";
import { authMfaRouter } from "./routes/auth-mfa";
import { authPushDevicesRouter } from "./routes/auth-push-devices";
import { authSessionRouter } from "./routes/auth-session";
import { agencyAccountsRouter } from "./routes/agency-accounts";
import { agencyDashboardRouter } from "./routes/agency-dashboard";
import { agencyOrdersRouter } from "./routes/agency-orders";
import { adminReadRouter } from "./routes/admin-read";
import { adminDashboardRouter } from "./routes/admin-dashboard";
import { dashboardDataRouter } from "./routes/dashboard-data";
import { platformTeamRouter } from "./routes/platform-team";
import { systemConfigurationRouter } from "./routes/system-configuration";
import { tenantDraftRouter } from "./routes/tenant-drafts";
import { tenantAccountRouter } from "./routes/tenant-account";
import { tenantAccountManagementRouter } from "./routes/tenant-account-management";
import { tenantOrdersRouter } from "./routes/tenant-orders";
import { tenantWorkflowRouter } from "./routes/tenant-workflow";

const requestIdPattern = /^[A-Za-z0-9._:-]{8,128}$/;

export function createApp(options: { config: ApiConfig; pool: pg.Pool; logger: Logger }) {
  const { config, pool, logger } = options;
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((request, response, next) => {
    const incoming = request.header("x-request-id");
    const requestId = incoming && requestIdPattern.test(incoming) ? incoming : randomUUID();
    const startedAt = performance.now();
    response.setHeader("x-request-id", requestId);
    response.locals.requestId = requestId;
    response.on("finish", () => {
      logger.info("http_request_completed", {
        request_id: requestId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    });
    next();
  });
  app.use(helmet());
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin)) callback(null, true);
        else callback(new Error("origin_not_allowed"));
      },
    }),
  );
  app.use(express.json({ limit: "256kb", strict: true }));

  app.get("/health/live", (_request, response) => {
    response.status(200).json({ status: "ok" });
  });

  app.get("/health/ready", async (_request, response, next) => {
    try {
      const ready = await databaseIsReady(pool);
      response.status(ready ? 200 : 503).json({ status: ready ? "ready" : "not_ready", database: ready ? "reachable" : "unreachable" });
    } catch (error) {
      logger.warn("readiness_check_failed", { error });
      response.status(503).json({ status: "not_ready", database: "unreachable" });
    }
  });

  app.get("/v1", (_request, response) => {
    response.status(200).json({ service: "commercial-lpg-platform-api", version: "v1", status: "protected-onboarding" });
  });
  app.use("/v1", authOtpRouter({ pool, config }));
  app.use("/v1", authMfaRouter({ pool, config }));
  app.use("/v1", authPushDevicesRouter({ pool, tokenPepper: config.sessionTokenPepper, encryptionKey: config.pushTokenEncryptionKey }));
  app.use("/v1", authSessionRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", adminReadRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", adminDashboardRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", dashboardDataRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", platformTeamRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", systemConfigurationRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", tenantDraftRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", tenantWorkflowRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", tenantOrdersRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", tenantAccountRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", tenantAccountManagementRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", agencyDashboardRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", agencyAccountsRouter({ pool, tokenPepper: config.sessionTokenPepper }));
  app.use("/v1", agencyOrdersRouter({ pool, tokenPepper: config.sessionTokenPepper }));

  app.use((_request, response) => {
    response.status(404).json({ error: { code: "not_found", message: "The requested resource was not found." }, requestId: response.locals.requestId });
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (response.headersSent) return;

    const knownError = error instanceof HttpError ? error : undefined;
    const statusFromError = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
    const isBadRequest = statusFromError === 400;
    const isRejectedOrigin = error instanceof Error && error.message === "origin_not_allowed";
    const status = knownError?.status ?? (isBadRequest ? 400 : isRejectedOrigin ? 403 : 500);
    const code = knownError?.code ?? (isBadRequest ? "invalid_request" : isRejectedOrigin ? "origin_not_allowed" : "internal_error");
    const message = knownError?.message ?? (isBadRequest
      ? "The request body is invalid."
      : isRejectedOrigin
        ? "The request origin is not allowed."
        : "The request could not be completed.");

    if (status >= 500) logger.error("http_request_failed", { request_id: response.locals.requestId, error });
    else logger.warn("http_request_rejected", { request_id: response.locals.requestId, code });
    response.status(status).json({ error: { code, message, ...(knownError?.details ? { details: knownError.details } : {}) }, requestId: response.locals.requestId });
  });

  return app;
}
