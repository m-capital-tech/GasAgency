import type { Logger } from "./logger";

export function installShutdownHandlers(
  logger: Logger,
  close: () => Promise<void>,
  options: { timeoutMs?: number } = {},
): void {
  const timeoutMs = options.timeoutMs ?? 15_000;
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutdown_started", { signal });

    const timeout = setTimeout(() => {
      logger.error("shutdown_timed_out", { timeout_ms: timeoutMs });
      process.exitCode = 1;
    }, timeoutMs);
    timeout.unref();

    try {
      await close();
      logger.info("shutdown_completed");
    } catch (error) {
      logger.error("shutdown_failed", { error });
      process.exitCode = 1;
    } finally {
      clearTimeout(timeout);
    }
  };

  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
