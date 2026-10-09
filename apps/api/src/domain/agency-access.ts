import type pg from "pg";

interface AgencyAccessRow {
  public_id: string;
  display_name: string;
  role_types: string[];
}

export async function activeAgencyAccess(client: pg.Pool | pg.PoolClient, userId: string) {
  const result = await client.query<AgencyAccessRow>(
    `select agency.public_id::text,
            agency.display_name,
            array_agg(distinct role_row.role_type order by role_row.role_type) as role_types
       from app.role_assignments assignment
       join app.roles role_row on role_row.id = assignment.role_id and role_row.status = 'active'
       join app.role_permissions granted on granted.role_id = role_row.id
       join app.permissions permission on permission.id = granted.permission_id
                                      and permission.resource = 'order' and permission.action = 'view'
       join app.agencies agency
         on agency.status = 'approved'
        and (
          assignment.scope_kind = 'global'
          or (assignment.scope_kind = 'agency' and assignment.scope_value = agency.public_id::text)
          or (assignment.scope_kind = 'city' and lower(assignment.scope_value) = lower(agency.city))
          or (
            assignment.scope_kind = 'selected_agencies'
            and exists (
              select 1 from app.role_assignment_agencies selected
               where selected.role_assignment_id = assignment.id and selected.agency_id = agency.id
            )
          )
        )
      where assignment.user_id = $1
        and assignment.status = 'active'
        and (assignment.expires_at is null or assignment.expires_at > now())
      group by agency.id
      order by agency.display_name, agency.public_id`,
    [userId],
  );
  return result.rows.map((agency) => ({
    publicId: agency.public_id,
    displayName: agency.display_name,
    roleTypes: agency.role_types,
  }));
}
