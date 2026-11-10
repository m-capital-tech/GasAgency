import assert from "node:assert/strict";
import test from "node:test";
import type { PrincipalAssignment } from "@platform/database";
import { platformAccessFromAssignments } from "../src/domain/platform-access";

function assignment(roleType: string, permissions: string[]): PrincipalAssignment {
  return {
    roleType,
    roleName: roleType.replaceAll("_", " "),
    scopeKind: "global",
    scopeValue: null,
    agencyPublicIds: [],
    permissions,
  };
}

test("Super Admin sessions are restored as privileged dashboard access", () => {
  const access = platformAccessFromAssignments([
    assignment("super_admin", ["report.view", "system.manage"]),
  ]);

  assert.deepEqual(access, {
    roleTypes: ["super_admin"],
    permissions: ["report.view", "system.manage"],
    scopes: [{
      roleType: "super_admin",
      roleName: "super admin",
      kind: "global",
      value: null,
      agencyPublicIds: [],
    }],
  });
});

test("Platform Admin sessions are restored as privileged dashboard access", () => {
  const access = platformAccessFromAssignments([
    assignment("platform_admin", ["report.view", "tenant.view"]),
  ]);

  assert.deepEqual(access, {
    roleTypes: ["platform_admin"],
    permissions: ["report.view", "tenant.view"],
    scopes: [{
      roleType: "platform_admin",
      roleName: "platform admin",
      kind: "global",
      value: null,
      agencyPublicIds: [],
    }],
  });
});

test("agency-only sessions cannot enter Platform Control", () => {
  assert.equal(platformAccessFromAssignments([
    assignment("agency_owner", ["order.view"]),
  ]), null);
});
