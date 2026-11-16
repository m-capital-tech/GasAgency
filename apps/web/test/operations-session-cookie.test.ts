import assert from "node:assert/strict";
import test from "node:test";
import { isPublicAuthenticationPath, shouldClearOperationsSessionCookie } from "../src/lib/operations-session-cookie";

test("protected-route authentication failures and logout still clear the session", () => {
  assert.equal(shouldClearOperationsSessionCookie("auth/session", 401), true);
  assert.equal(shouldClearOperationsSessionCookie("auth/logout", 204), true);
});

test("only SMS request and verification are public and preserve an existing session on input errors", () => {
  for (const path of ["auth/otp/request", "auth/otp/verify"]) {
    assert.equal(isPublicAuthenticationPath(path), true);
    assert.equal(shouldClearOperationsSessionCookie(path, 401), false);
  }
  assert.equal(isPublicAuthenticationPath("auth/mfa/verify"), false);
});
