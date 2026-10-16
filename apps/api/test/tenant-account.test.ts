import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/http/error";
import {
  decodeTenantPageCursor,
  effectiveInvoiceStatus,
  encodeTenantPageCursor,
} from "../src/routes/tenant-account";

test("tenant pagination cursors round-trip without exposing database identifiers", () => {
  const cursor = {
    at: "2026-10-16T10:30:00.000Z",
    publicId: "0199ed7f-7450-7000-8000-000000000001",
  };
  const encoded = encodeTenantPageCursor(cursor);
  assert.doesNotMatch(encoded, /2026-10-16/);
  assert.deepEqual(decodeTenantPageCursor(encoded), cursor);
});

test("tenant pagination rejects malformed and non-UUID cursors", () => {
  assert.throws(
    () => decodeTenantPageCursor("not-a-cursor"),
    (error: unknown) => error instanceof HttpError && error.status === 400 && error.code === "invalid_cursor",
  );
  const malformed = Buffer.from(JSON.stringify({ at: "2026-10-16T10:30:00.000Z", publicId: "42" })).toString("base64url");
  assert.throws(
    () => decodeTenantPageCursor(malformed),
    (error: unknown) => error instanceof HttpError && error.code === "invalid_cursor",
  );
});

test("an unpaid open invoice becomes overdue after its due date", () => {
  const now = new Date("2026-10-16T10:30:00.000Z");
  assert.equal(effectiveInvoiceStatus("open", new Date("2026-10-15T10:30:00.000Z"), "100.00", now), "overdue");
  assert.equal(effectiveInvoiceStatus("open", new Date("2026-10-17T10:30:00.000Z"), "100.00", now), "open");
  assert.equal(effectiveInvoiceStatus("paid", new Date("2026-10-15T10:30:00.000Z"), "0.00", now), "paid");
  assert.equal(effectiveInvoiceStatus("void", null, "0.00", now), "void");
});
