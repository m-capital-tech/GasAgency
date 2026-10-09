import assert from "node:assert/strict";
import test from "node:test";
import type { AuthPrincipal } from "@platform/database";
import { isAuthorized } from "../src/security/rbac";

const base: AuthPrincipal = {
  userId: "1",
  userPublicId: "00000000-0000-7000-8000-000000000001",
  fullName: "Test User",
  phoneE164: "+919999999999",
  mfaRequired: true,
  sessionId: "1",
  sessionPublicId: "00000000-0000-7000-8000-000000000002",
  authMethod: "otp_mfa",
  mfaVerifiedAt: new Date(),
  assignments: [],
};

test("RBAC is default-deny and city matching is case-insensitive", () => {
  assert.equal(isAuthorized(base, "tenant.create", { city: "Bengaluru" }), false);
  const principal = {
    ...base,
    assignments: [{ roleType: "platform_team", roleName: "Onboarding", scopeKind: "city" as const, scopeValue: "bengaluru", agencyPublicIds: [], permissions: ["tenant.create"] }],
  };
  assert.equal(isAuthorized(principal, "tenant.create", { city: " Bengaluru " }), true);
  assert.equal(isAuthorized(principal, "tenant.create", { city: "Mysuru" }), false);
});

test("selected-agency scope permits only assigned agencies", () => {
  const principal = {
    ...base,
    assignments: [{ roleType: "platform_team", roleName: "Onboarding", scopeKind: "selected_agencies" as const, scopeValue: null, agencyPublicIds: ["agency-1"], permissions: ["tenant.create"] }],
  };
  assert.equal(isAuthorized(principal, "tenant.create", { agencyPublicId: "agency-1" }), true);
  assert.equal(isAuthorized(principal, "tenant.create", { agencyPublicId: "agency-2" }), false);
});
