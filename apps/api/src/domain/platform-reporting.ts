import type { AuthPrincipal } from "@platform/database";
import { HttpError } from "../http/error";
import { hasPermission } from "../security/rbac";

export interface PlatformReportingScope {
  global: boolean;
  regions: string[];
  cities: string[];
  agencyPublicIds: string[];
  tenantPublicIds: string[];
}

export function platformReportingScope(principal: AuthPrincipal, permission: string): PlatformReportingScope {
  if (!hasPermission(principal, permission)) {
    throw new HttpError(403, "permission_denied", `The ${permission} permission is required.`);
  }
  const assignments = principal.assignments.filter((assignment) => assignment.permissions.includes(permission));
  const regions = new Set<string>();
  const cities = new Set<string>();
  const agencyPublicIds = new Set<string>();
  const tenantPublicIds = new Set<string>();
  for (const assignment of assignments) {
    if (assignment.scopeKind === "region" && assignment.scopeValue) regions.add(assignment.scopeValue.toLocaleLowerCase("en-IN"));
    if (assignment.scopeKind === "city" && assignment.scopeValue) cities.add(assignment.scopeValue.toLocaleLowerCase("en-IN"));
    if (assignment.scopeKind === "agency" && assignment.scopeValue) agencyPublicIds.add(assignment.scopeValue);
    if (assignment.scopeKind === "tenant" && assignment.scopeValue) tenantPublicIds.add(assignment.scopeValue);
    assignment.agencyPublicIds.forEach((publicId) => agencyPublicIds.add(publicId));
  }
  return {
    global: assignments.some((assignment) => assignment.scopeKind === "global"),
    regions: [...regions],
    cities: [...cities],
    agencyPublicIds: [...agencyPublicIds],
    tenantPublicIds: [...tenantPublicIds],
  };
}

export function platformReportingParams(scope: PlatformReportingScope): [boolean, string[], string[], string[], string[]] {
  return [scope.global, scope.regions, scope.cities, scope.agencyPublicIds, scope.tenantPublicIds];
}

export const scopedTenantsSql = `scoped_tenants as materialized (
  select distinct tenant.id, tenant.public_id
    from app.tenants tenant
    join lateral (
      select candidate.city, candidate.state_code
        from app.outlets candidate
       where candidate.tenant_id = tenant.id
       order by candidate.id
       limit 1
    ) outlet on true
    join app.agency_assignments assignment
      on assignment.tenant_id = tenant.id and assignment.ends_at is null
    join app.agencies agency on agency.id = assignment.agency_id
   where (
     $1::boolean
     or lower(outlet.state_code) = any($2::text[])
     or lower(outlet.city) = any($3::text[])
     or agency.public_id = any($4::uuid[])
     or tenant.public_id = any($5::uuid[])
   )
)`;
