import assert from "node:assert/strict";
import test from "node:test";
import { gstinCheckDigit, isValidGstin, normalizeGstin } from "../src/domain/gstin";

test("normalizes and validates GSTIN checksum", () => {
  assert.equal(normalizeGstin(" 27aapfu0939f1zv "), "27AAPFU0939F1ZV");
  assert.equal(gstinCheckDigit("27AAPFU0939F1Z"), "V");
  assert.equal(isValidGstin("27AAPFU0939F1ZV"), true);
  assert.equal(isValidGstin("22AAAAA0000A1ZC"), true);
});

test("rejects malformed or checksum-invalid GSTIN", () => {
  assert.equal(isValidGstin("27AAPFU0939F1ZA"), false);
  assert.equal(isValidGstin("not-a-gstin"), false);
});
