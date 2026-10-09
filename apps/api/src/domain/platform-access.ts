import type { PrincipalAssignment } from "@platform/database";

const platformRoleTypes = new Set(["super_admin", "platform_admin", "platform_team"]);

export function platformAccessFromAssignments(assignments: PrincipalAssignment[]) {
  const platformAssignments = assignments.filter((assignment) => platformRoleTypes.has(assignment.roleType));
  if (!platformAssignments.length) return null;
  return {
    roleTypes: [...new Set(platformAssignments.map((assignment) => assignment.roleType))].sort(),
    permissions: [...new Set(platformAssignments.flatMap((assignment) => assignment.permissions))].sort(),
    scopes: platformAssignments.map((assignment) => ({
      roleType: assignment.roleType,
      roleName: assignment.roleName,
      kind: assignment.scopeKind,
      value: assignment.scopeValue,
      agencyPublicIds: assignment.agencyPublicIds,
    })),
  };
}
