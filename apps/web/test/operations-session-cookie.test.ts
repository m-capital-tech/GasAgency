import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAuthenticationPath, shouldClearOperationsSessionCookie } from "../src/lib/operations-session-cookie";

test("a rejected duplicate MFA handoff cannot delete an authenticated browser session", () => {
  assert.equal(isPublicAuthenticationPath("auth/mfa/verify"), true);
  assert.equal(shouldClearOperationsSessionCookie("auth/mfa/verify", 401), false);
  assert.equal(shouldClearOperationsSessionCookie("auth/mfa/enroll/verify", 401), false);
});

test("protected-route authentication failures and logout still clear the session", () => {
  assert.equal(shouldClearOperationsSessionCookie("auth/session", 401), true);
  assert.equal(shouldClearOperationsSessionCookie("auth/logout", 204), true);
});
