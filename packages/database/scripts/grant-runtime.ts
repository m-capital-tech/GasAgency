import { createDatabasePool, type DatabaseSslMode } from "../src/pool";

const connectionString = process.env.MIGRATION_DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL is required");

const runtimeRole = process.env.DATABASE_RUNTIME_ROLE;
if (!runtimeRole || !/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(runtimeRole)) {
  throw new Error("DATABASE_RUNTIME_ROLE must be a valid PostgreSQL identifier");
}

const sslMode = (process.env.DATABASE_SSL_MODE ?? "verify-full") as DatabaseSslMode;
if (!(["disable", "require", "verify-full"] as const).includes(sslMode)) {
  throw new Error("DATABASE_SSL_MODE must be disable, require, or verify-full");
}

function identifier(value: string): string {
  return '"' + value.replaceAll('"', '""') + '"';
}

const pool = createDatabasePool({
  connectionString,
  applicationName: "commercial-lpg-runtime-grant",
  maxConnections: 1,
  statementTimeoutMs: 120_000,
  idleTransactionTimeoutMs: 120_000,
  sslMode,
  caCertificate: process.env.DATABASE_CA_CERT,
});
const client = await pool.connect();

try {
  await client.query("select pg_advisory_lock(hashtext($1))", ["commercial-lpg-schema-migrations"]);
  const role = (
    await client.query<{
      rolname: string;
      rolcanlogin: boolean;
      rolsuper: boolean;
      rolcreaterole: boolean;
      rolcreatedb: boolean;
      rolreplication: boolean;
      rolbypassrls: boolean;
    }>(
      "select rolname, rolcanlogin, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls from pg_roles where rolname = $1",
      [runtimeRole],
    )
  ).rows[0];
  if (!role) throw new Error("runtime role " + runtimeRole + " does not exist");
  if (!role.rolcanlogin) throw new Error("runtime role " + runtimeRole + " must be a login role");
  if (role.rolsuper || role.rolcreaterole || role.rolcreatedb || role.rolreplication || role.rolbypassrls) {
    throw new Error("runtime role " + runtimeRole + " has elevated PostgreSQL attributes");
  }

  const memberships = await client.query<{ role_name: string }>(
    "select parent.rolname as role_name from pg_auth_members membership join pg_roles member on member.oid = membership.member join pg_roles parent on parent.oid = membership.roleid where member.rolname = $1",
    [runtimeRole],
  );
  if (memberships.rows.length > 0) {
    throw new Error(
      "runtime role " + runtimeRole + " must not inherit other PostgreSQL roles: "
      + memberships.rows.map((row) => row.role_name).join(", "),
    );
  }

  const context = (
    await client.query<{ database_name: string; owner_name: string }>(
      "select current_database() as database_name, current_user as owner_name",
    )
  ).rows[0]!;
  if (runtimeRole === context.owner_name) throw new Error("runtime role must differ from the migration owner");

  const ownership = await client.query<{ owner_name: string }>(
    "select distinct pg_get_userbyid(class_row.relowner) as owner_name from pg_class class_row join pg_namespace namespace_row on namespace_row.oid = class_row.relnamespace where namespace_row.nspname = 'app' and class_row.relkind in ('r', 'p', 'S', 'v', 'm')",
  );
  const unexpectedOwners = ownership.rows.map((row) => row.owner_name).filter((owner) => owner !== context.owner_name);
  if (unexpectedOwners.length > 0) {
    throw new Error("app schema objects are not owned solely by the migration owner: " + [...new Set(unexpectedOwners)].join(", "));
  }

  const functionOwnership = await client.query<{ owner_name: string }>(
    "select distinct pg_get_userbyid(procedure_row.proowner) as owner_name from pg_proc procedure_row join pg_namespace namespace_row on namespace_row.oid = procedure_row.pronamespace where namespace_row.nspname = 'app'",
  );
  const unexpectedFunctionOwners = functionOwnership.rows
    .map((row) => row.owner_name)
    .filter((owner) => owner !== context.owner_name);
  if (unexpectedFunctionOwners.length > 0) {
    throw new Error(
      "app schema functions are not owned solely by the migration owner: "
      + [...new Set(unexpectedFunctionOwners)].join(", "),
    );
  }

  const roleName = identifier(runtimeRole);
  const ownerName = identifier(context.owner_name);
  const databaseName = identifier(context.database_name);

  await client.query("begin");
  try {
    await client.query("grant connect on database " + databaseName + " to " + roleName);
    await client.query("revoke all on schema app from public");
    await client.query("revoke all on schema app from " + roleName);
    await client.query("grant usage on schema app to " + roleName);
    await client.query("revoke all on all tables in schema app from " + roleName);
    await client.query("grant select, insert, update on all tables in schema app to " + roleName);
    await client.query("grant delete on app.auth_rate_events to " + roleName);
    await client.query("revoke all on all sequences in schema app from " + roleName);
    await client.query("grant usage on all sequences in schema app to " + roleName);
    await client.query("revoke execute on all functions in schema app from public");
    await client.query("revoke all on all functions in schema app from " + roleName);

    await client.query("alter default privileges for role " + ownerName + " in schema app revoke all on tables from public");
    await client.query("alter default privileges for role " + ownerName + " in schema app grant select, insert, update on tables to " + roleName);
    await client.query("alter default privileges for role " + ownerName + " in schema app revoke all on sequences from public");
    await client.query("alter default privileges for role " + ownerName + " in schema app grant usage on sequences to " + roleName);
    await client.query("alter default privileges for role " + ownerName + " in schema app revoke execute on functions from public");
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  }

  const verification = (
    await client.query<{
      can_connect: boolean;
      can_use_schema: boolean;
      can_create_in_schema: boolean;
      can_select_users: boolean;
      can_insert_users: boolean;
      can_update_users: boolean;
      can_delete_users: boolean;
      can_delete_rate_events: boolean;
      can_delete_audit_events: boolean;
    }>(
      "select has_database_privilege($1, current_database(), 'CONNECT') as can_connect, has_schema_privilege($1, 'app', 'USAGE') as can_use_schema, has_schema_privilege($1, 'app', 'CREATE') as can_create_in_schema, has_table_privilege($1, 'app.users', 'SELECT') as can_select_users, has_table_privilege($1, 'app.users', 'INSERT') as can_insert_users, has_table_privilege($1, 'app.users', 'UPDATE') as can_update_users, has_table_privilege($1, 'app.users', 'DELETE') as can_delete_users, has_table_privilege($1, 'app.auth_rate_events', 'DELETE') as can_delete_rate_events, has_table_privilege($1, 'app.audit_events', 'DELETE') as can_delete_audit_events",
      [runtimeRole],
    )
  ).rows[0]!;
  if (
    !verification.can_connect
    || !verification.can_use_schema
    || verification.can_create_in_schema
    || !verification.can_select_users
    || !verification.can_insert_users
    || !verification.can_update_users
    || verification.can_delete_users
    || !verification.can_delete_rate_events
    || verification.can_delete_audit_events
  ) {
    throw new Error("runtime privilege verification failed");
  }

  process.stdout.write(JSON.stringify({ level: "info", event: "runtime_privileges_applied", role: runtimeRole }) + "\n");
} finally {
  try {
    await client.query("select pg_advisory_unlock(hashtext($1))", ["commercial-lpg-schema-migrations"]);
  } finally {
    client.release();
    await pool.end();
  }
}
