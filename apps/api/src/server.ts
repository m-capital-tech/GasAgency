import { createServer } from "node:http";
import { createDatabasePool } from "@platform/database";
import { createLogger, installShutdownHandlers } from "@platform/runtime";
import { createApp } from "./app";
import { loadApiConfig } from "./config";

const config = loadApiConfig();
const logger = createLogger("platform-api", config.logLevel);
const pool = createDatabasePool({
  connectionString: config.databaseUrl,
  applicationName: `commercial-lpg-api-${config.appEnv}`,
  maxConnections: config.databasePoolMax,
  statementTimeoutMs: config.databaseStatementTimeoutMs,
  sslMode: config.databaseSslMode,
  caCertificate: config.databaseCaCertificate,
});

pool.on("error", (error) => logger.error("database_pool_error", { error }));

const app = createApp({ config, pool, logger });
const server = createServer(app);

server.listen(config.port, "0.0.0.0", () => {
  logger.info("api_started", { port: config.port, environment: config.appEnv });
});

installShutdownHandlers(
  logger,
  async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await pool.end();
  },
  { timeoutMs: config.shutdownTimeoutMs },
);
