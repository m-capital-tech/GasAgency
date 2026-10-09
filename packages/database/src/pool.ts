import pg, { type PoolClient, type QueryResult, type QueryResultRow } from "pg";

const { Pool } = pg;

export type DatabaseSslMode = "disable" | "require" | "verify-full";

export interface DatabasePoolOptions {
  connectionString: string;
  applicationName: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
  statementTimeoutMs?: number;
  idleTransactionTimeoutMs?: number;
  sslMode?: DatabaseSslMode;
  caCertificate?: string;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function databaseSslConfig(mode: DatabaseSslMode, caCertificate?: string): false | { rejectUnauthorized: boolean; ca?: string } {
  if (mode === "disable") return false;

  if (mode === "verify-full" && !caCertificate) {
    throw new Error("DATABASE_CA_CERT is required when DATABASE_SSL_MODE=verify-full");
  }

  return {
    rejectUnauthorized: mode === "verify-full",
    ...(caCertificate ? { ca: caCertificate.replace(/\\n/g, "\n") } : {}),
  };
}

export function connectionStringWithoutSslOptions(connectionString: string): string {
  const parsed = new URL(connectionString);
  for (const key of [...parsed.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("ssl") || key.toLowerCase() === "uselibpqcompat") {
      parsed.searchParams.delete(key);
    }
  }
  return parsed.toString();
}

export function createDatabasePool(options: DatabasePoolOptions): pg.Pool {
  const maxConnections = positiveInteger(options.maxConnections ?? 10, "maxConnections");
  const idleTimeoutMs = positiveInteger(options.idleTimeoutMs ?? 30_000, "idleTimeoutMs");
  const connectionTimeoutMs = positiveInteger(options.connectionTimeoutMs ?? 5_000, "connectionTimeoutMs");
  const statementTimeoutMs = positiveInteger(options.statementTimeoutMs ?? 15_000, "statementTimeoutMs");
  const idleTransactionTimeoutMs = positiveInteger(options.idleTransactionTimeoutMs ?? 10_000, "idleTransactionTimeoutMs");

  return new Pool({
    // Provider bindable URLs include sslmode=require. node-postgres parses that
    // after the explicit ssl object and can discard our CA certificate. Remove
    // URL-level SSL controls so the verified configuration below is authoritative.
    connectionString: connectionStringWithoutSslOptions(options.connectionString),
    application_name: options.applicationName,
    max: maxConnections,
    idleTimeoutMillis: idleTimeoutMs,
    connectionTimeoutMillis: connectionTimeoutMs,
    ssl: databaseSslConfig(options.sslMode ?? "verify-full", options.caCertificate),
    options: `-c statement_timeout=${statementTimeoutMs} -c idle_in_transaction_session_timeout=${idleTransactionTimeoutMs}`,
  });
}

export async function query<Row extends QueryResultRow = QueryResultRow>(
  pool: pg.Pool,
  text: string,
  values: readonly unknown[] = [],
): Promise<QueryResult<Row>> {
  return pool.query<Row>(text, [...values]);
}

export async function withTransaction<Result>(
  pool: pg.Pool,
  operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await operation(client);
    await client.query("commit");
    return result;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch (rollbackError) {
      throw new AggregateError([error, rollbackError], "database transaction and rollback both failed");
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function databaseIsReady(pool: pg.Pool): Promise<boolean> {
  const result = await pool.query<{ ready: number }>("select 1 as ready");
  return result.rows[0]?.ready === 1;
}
