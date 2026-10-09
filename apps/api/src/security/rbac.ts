import type { AuthPrincipal, PrincipalAssignment } from "@platform/database";
import { HttpError } from "../http/error";

export interface AuthorizationTarget {
  city?: string;
  agencyPublicId?: string;
  tenantPublicId?: string;
  region?: string;
}

function normalize(value: string | undefined): string | undefined {
  return value?.trim().toLocaleLowerCase("en-IN");
}

function assignmentCovers(assignment: PrincipalAssignment, target: AuthorizationTarget): boolean {
  switch (assignment.scopeKind) {
    case "global":
      return true;
    case "region":
      return Boolean(target.region && normalize(assignment.scopeValue ?? undefined) === normalize(target.region));
    case "city":
      return Boolean(target.city && normalize(assignment.scopeValue ?? undefined) === normalize(target.city));
    case "agency":
      return Boolean(target.agencyPublicId && assignment.scopeValue === target.agencyPublicId);
    case "selected_agencies":
      return Boolean(target.agencyPublicId && assignment.agencyPublicIds.includes(target.agencyPublicId));
    case "tenant":
      return Boolean(target.tenantPublicId && assignment.scopeValue === target.tenantPublicId);
  }
}

export function isAuthorized(principal: AuthPrincipal, permission: string, target: AuthorizationTarget): boolean {
  return principal.assignments.some(
    (assignment) => assignment.permissions.includes(permission) && assignmentCovers(assignment, target),
  );
}

export function hasPermission(principal: AuthPrincipal, permission: string): boolean {
  return principal.assignments.some((assignment) => assignment.permissions.includes(permission));
}

export function hasRoleType(principal: AuthPrincipal, roleType: string): boolean {
  return principal.assignments.some((assignment) => assignment.roleType === roleType);
}

export function assertAuthorized(principal: AuthPrincipal, permission: string, target: AuthorizationTarget): void {
  if (!isAuthorized(principal, permission, target)) {
    throw new HttpError(403, "permission_denied", "You do not have permission for this action in the requested scope.");
  }
}
