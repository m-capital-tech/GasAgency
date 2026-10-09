import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabasePool, type DatabaseSslMode } from "../src/pool";

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required");

const sslMode = (process.env.DATABASE_SSL_MODE ?? "verify-full") as DatabaseSslMode;
if (!(["disable", "require", "verify-full"] as const).includes(sslMode)) {
  throw new Error("DATABASE_SSL_MODE must be disable, require, or verify-full");
}

const migrationsDirectory = process.env.MIGRATIONS_DIR
  ? path.resolve(process.env.MIGRATIONS_DIR)
  : fileURLToPath(new URL("../migrations", import.meta.url));
const pool = createDatabasePool({
  connectionString,
  applicationName: "commercial-lpg-schema-migrator",
  maxConnections: 1,
  statementTimeoutMs: 120_000,
  idleTransactionTimeoutMs: 120_000,
  sslMode,
  caCertificate: process.env.DATABASE_CA_CERT,
});
const client = await pool.connect();

try {
  await client.query("select pg_advisory_lock(hashtext($1))", ["commercial-lpg-schema-migrations"]);
  const migrationFiles = (await readdir(migrationsDirectory)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  if (migrationFiles.length === 0) throw new Error(`no migrations found in ${migrationsDirectory}`);

  const ledgerExists = await client.query<{ exists: boolean }>("select to_regclass('app.schema_migrations') is not null as exists");
  const applied = new Set<string>();
  if (ledgerExists.rows[0]?.exists) {
    const versions = await client.query<{ version: string }>("select version from app.schema_migrations");
    for (const row of versions.rows) applied.add(row.version);
  }

  for (const filename of migrationFiles) {
    const version = filename.replace(/\.sql$/, "");
    if (applied.has(version)) continue;

    const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
    process.stdout.write(`${JSON.stringify({ level: "info", event: "migration_started", version })}\n`);
    await client.query(sql);

    const recorded = await client.query<{ recorded: boolean }>(
      "select exists(select 1 from app.schema_migrations where version = $1) as recorded",
      [version],
    );
    if (!recorded.rows[0]?.recorded) throw new Error(`migration ${version} did not record itself in app.schema_migrations`);
    process.stdout.write(`${JSON.stringify({ level: "info", event: "migration_completed", version })}\n`);
  }
} finally {
  try {
    await client.query("select pg_advisory_unlock(hashtext($1))", ["commercial-lpg-schema-migrations"]);
  } finally {
    client.release();
    await pool.end();
  }
}
