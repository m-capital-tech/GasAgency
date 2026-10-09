import { createDatabasePool, withTransaction } from "@platform/database";
import { uuidV7 } from "@platform/runtime";
import { z } from "zod";

const environmentSchema = z.object({
  MIGRATION_DATABASE_URL: z.string().min(1),
  DATABASE_SSL_MODE: z.enum(["disable", "require", "verify-full"]).default("verify-full"),
  DATABASE_CA_CERT: z.string().optional(),
  BOOTSTRAP_SUPER_ADMIN_NAME: z.string().trim().min(2).max(160),
  BOOTSTRAP_SUPER_ADMIN_PHONE: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  BOOTSTRAP_SUPER_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_REASON: z.string().trim().min(10).max(500),
  ALLOW_ADDITIONAL_SUPER_ADMIN: z.enum(["true", "false"]).default("false"),
});

const environment = environmentSchema.parse(process.env);
if (environment.DATABASE_SSL_MODE === "verify-full" && !environment.DATABASE_CA_CERT) {
  throw new Error("DATABASE_CA_CERT is required for verify-full TLS");
}

const pool = createDatabasePool({
  connectionString: environment.MIGRATION_DATABASE_URL,
  applicationName: "commercial-lpg-super-admin-bootstrap",
  maxConnections: 1,
  statementTimeoutMs: 30_000,
  sslMode: environment.DATABASE_SSL_MODE,
  caCertificate: environment.DATABASE_CA_CERT,
});

try {
  const outcome = await withTransaction(pool, async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtext($1))", ["commercial-lpg-super-admin-bootstrap"]);
    const migration = await client.query(
      "select 1 from app.schema_migrations where version = '0002_auth_rbac_onboarding'",
    );
    if (migration.rowCount !== 1) throw new Error("migration 0002_auth_rbac_onboarding must be applied first");

    let changed = false;
    const existingUser = await client.query<{ id: string; public_id: string; status: string }>(
      "select id::text, public_id::text, status from app.users where phone_e164 = $1 for update",
      [environment.BOOTSTRAP_SUPER_ADMIN_PHONE],
    );
    let user = existingUser.rows[0];
    if (!user) {
      const inserted = await client.query<{ id: string; public_id: string; status: string }>(
        `insert into app.users (public_id, phone_e164, full_name, email, status, mfa_required)
         values ($1, $2, $3, $4, 'active', true)
         returning id::text, public_id::text, status`,
        [uuidV7(), environment.BOOTSTRAP_SUPER_ADMIN_PHONE, environment.BOOTSTRAP_SUPER_ADMIN_NAME, environment.BOOTSTRAP_SUPER_ADMIN_EMAIL ?? null],
      );
      user = inserted.rows[0]!;
      changed = true;
    }
    if (user.status !== "active") throw new Error("the bootstrap phone belongs to a non-active user; resolve that account explicitly");

    const otherSuperAdmins = await client.query<{ user_public_id: string }>(
      `select assigned_user.public_id::text as user_public_id
         from app.role_assignments assignment
         join app.roles role_row on role_row.id = assignment.role_id
         join app.users assigned_user on assigned_user.id = assignment.user_id
        where role_row.role_type = 'super_admin'
          and assignment.scope_kind = 'global'
          and assignment.status = 'active'
          and (assignment.expires_at is null or assignment.expires_at > now())
          and assignment.user_id <> $1
        limit 1`,
      [user.id],
    );
    if (otherSuperAdmins.rowCount && environment.ALLOW_ADDITIONAL_SUPER_ADMIN !== "true") {
      throw new Error("a different active Super Admin already exists; set ALLOW_ADDITIONAL_SUPER_ADMIN=true only after an explicit governance decision");
    }

    let role = (
      await client.query<{ id: string; public_id: string }>(
        "select id::text, public_id::text from app.roles where role_type = 'super_admin' and lower(name) = lower('Super Admin') and is_system for update",
      )
    ).rows[0];
    if (!role) {
      role = (
        await client.query<{ id: string; public_id: string }>(
          `insert into app.roles (public_id, name, role_type, is_system, is_reserved, status)
           values ($1, 'Super Admin', 'super_admin', true, true, 'active')
           returning id::text, public_id::text`,
          [uuidV7()],
        )
      ).rows[0]!;
      changed = true;
    }

    const grants = await client.query(
      `insert into app.role_permissions (role_id, permission_id, granted_by_user_id)
       select $1, permission.id, $2 from app.permissions permission
       on conflict (role_id, permission_id) do nothing`,
      [role.id, user.id],
    );
    changed = changed || (grants.rowCount ?? 0) > 0;

    const assignment = await client.query<{ public_id: string }>(
      `insert into app.role_assignments (
         public_id, user_id, role_id, scope_kind, scope_value, assigned_by_user_id, status
       ) values ($1, $2, $3, 'global', null, $2, 'active')
       on conflict (user_id, role_id, scope_kind, (coalesce(scope_value, ''))) where status = 'active'
       do nothing
       returning public_id::text`,
      [uuidV7(), user.id, role.id],
    );
    changed = changed || assignment.rowCount === 1;

    if (changed) {
      await client.query(
        `insert into app.audit_events (
           public_id, actor_user_id, actor_role, action, entity_type, entity_public_id,
           reason, after_values, request_id, correlation_id
         ) values ($1, $2, 'super_admin', 'super_admin.bootstrap', 'user', $3, $4, $5::jsonb, $6, $7)`,
        [
          uuidV7(),
          user.id,
          user.public_id,
          environment.BOOTSTRAP_REASON,
          JSON.stringify({ rolePublicId: role.public_id, scope: "global", mfaRequired: true }),
          uuidV7(),
          uuidV7(),
        ],
      );
    }

    return { changed, userPublicId: user.public_id, rolePublicId: role.public_id };
  });

  process.stdout.write(`${JSON.stringify({ event: "super_admin_bootstrap_completed", ...outcome })}\n`);
} finally {
  await pool.end();
}
