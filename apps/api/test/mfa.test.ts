import assert from "node:assert/strict";
import test from "node:test";
import { encodeBase32, generateRecoveryCodes, hashMfaValue, normalizeRecoveryCode, totpCode, totpUri, verifyTotp } from "../src/security/mfa";

test("generates and verifies RFC 6238-compatible TOTP codes", () => {
  const secret = encodeBase32(Buffer.from("12345678901234567890", "ascii"));
  assert.equal(totpCode(secret, 1, 8), "94287082");
  const now = 1_700_000_000_000;
  const code = totpCode(secret, Math.floor(now / 30_000));
  assert.equal(verifyTotp(secret, code, now), Math.floor(now / 30_000));
  assert.equal(verifyTotp(secret, "000000", now), null);
});

test("creates standards-based enrollment URIs and normalized recovery codes", () => {
  const uri = totpUri("Commercial LPG Platform", "+919900000000", "JBSWY3DPEHPK3PXP");
  assert.match(uri, /^otpauth:\/\/totp\//);
  assert.match(uri, /issuer=Commercial\+LPG\+Platform/);
  const codes = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  assert.match(codes[0]!, /^[A-Z2-7]{4}-[A-Z2-7]{4}$/);
  assert.deepEqual(hashMfaValue(normalizeRecoveryCode(codes[0]!), "pepper"), hashMfaValue(codes[0]!.replace("-", ""), "pepper"));
});
