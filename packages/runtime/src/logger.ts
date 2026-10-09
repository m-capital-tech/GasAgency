export type LogLevel = "debug" | "info" | "warn" | "error";

const levelRank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

function normalize(value: unknown): unknown {
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  return value;
}

export function createLogger(service: string, minimumLevel: LogLevel = "info"): Logger {
  const write = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
    if (levelRank[level] < levelRank[minimumLevel]) return;
    const record = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, normalize(value)]));
    const line = JSON.stringify({ timestamp: new Date().toISOString(), level, service, event, ...record });
    if (level === "error") process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  };

  return {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}
