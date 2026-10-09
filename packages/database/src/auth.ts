import type pg from "pg";

export type AssignmentScopeKind = "global" | "region" | "city" | "selected_agencies" | "tenant" | "agency";

export interface PrincipalAssignment {
  roleType: string;
  roleName: string;
  scopeKind: AssignmentScopeKind;
  scopeValue: string | null;
  agencyPublicIds: string[];
  permissions: string[];
}

export interface AuthPrincipal {
  userId: string;
  userPublicId: string;
  fullName: string;
  phoneE164: string;
  mfaRequired: boolean;
  sessionId: string;
  sessionPublicId: string;
  authMethod: string;
  mfaVerifiedAt: Date | null;
  assignments: PrincipalAssignment[];
}

interface PrincipalRow {
  user_id: string;
  user_public_id: string;
  full_name: string;
  phone_e164: string;
  mfa_required: boolean;
  session_id: string;
  session_public_id: string;
  auth_method: string;
  mfa_verified_at: Date | null;
  assignments: PrincipalAssignment[] | null;
}

export async function loadPrincipalBySessionHash(pool: pg.Pool, tokenHash: Buffer): Promise<AuthPrincipal | null> {
  const result = await pool.query<PrincipalRow>(
    `select user_row.id::text as user_id,
            user_row.public_id::text as user_public_id,
            user_row.full_name,
            user_row.phone_e164,
            user_row.mfa_required,
            session_row.id::text as session_id,
            session_row.public_id::text as session_public_id,
            session_row.auth_method,
            session_row.mfa_verified_at,
            coalesce(assignments.value, '[]'::jsonb) as assignments
       from app.device_sessions session_row
       join app.users user_row on user_row.id = session_row.user_id
       left join lateral (
         select jsonb_agg(
                  jsonb_build_object(
                    'roleType', role_row.role_type,
                    'roleName', role_row.name,
                    'scopeKind', assignment.scope_kind,
                    'scopeValue', assignment.scope_value,
                    'agencyPublicIds', coalesce(scoped_agencies.value, '[]'::jsonb),
                    'permissions', coalesce(role_permissions.value, '[]'::jsonb)
                  ) order by assignment.id
                ) as value
           from app.role_assignments assignment
           join app.roles role_row
             on role_row.id = assignment.role_id
            and role_row.status = 'active'
           left join lateral (
             select jsonb_agg(agency.public_id::text order by agency.public_id) as value
               from app.role_assignment_agencies selected
               join app.agencies agency on agency.id = selected.agency_id
              where selected.role_assignment_id = assignment.id
           ) scoped_agencies on true
           left join lateral (
             select jsonb_agg(permission.resource || '.' || permission.action order by permission.resource, permission.action) as value
               from app.role_permissions granted
               join app.permissions permission on permission.id = granted.permission_id
              where granted.role_id = assignment.role_id
           ) role_permissions on true
          where assignment.user_id = user_row.id
            and assignment.status = 'active'
            and (assignment.expires_at is null or assignment.expires_at > now())
       ) assignments on true
      where session_row.token_hash = $1
        and session_row.revoked_at is null
        and session_row.expires_at > now()
        and user_row.status = 'active'
      limit 1`,
    [tokenHash],
  );
  const row = result.rows[0];
  if (!row) return null;

  void pool
    .query(
      `update app.device_sessions
          set last_seen_at = now()
        where id = $1 and last_seen_at < now() - interval '5 minutes'`,
      [row.session_id],
    )
    .catch(() => undefined);

  return {
    userId: row.user_id,
    userPublicId: row.user_public_id,
    fullName: row.full_name,
    phoneE164: row.phone_e164,
    mfaRequired: row.mfa_required,
    sessionId: row.session_id,
    sessionPublicId: row.session_public_id,
    authMethod: row.auth_method,
    mfaVerifiedAt: row.mfa_verified_at,
    assignments: row.assignments ?? [],
  };
}
