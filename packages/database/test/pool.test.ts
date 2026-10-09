import assert from "node:assert/strict";
import { test } from "node:test";
import { connectionStringWithoutSslOptions, databaseSslConfig } from "../src/pool";

test("provider URL SSL parameters cannot override the explicit CA policy", () => {
  const normalized = connectionStringWithoutSslOptions(
    "postgresql://runtime:secret@db.example.com:25060/platform?sslmode=require&sslrootcert=provider.pem&uselibpqcompat=true&application_name=api",
  );
  const parsed = new URL(normalized);

  assert.equal(parsed.searchParams.get("sslmode"), null);
  assert.equal(parsed.searchParams.get("sslrootcert"), null);
  assert.equal(parsed.searchParams.get("uselibpqcompat"), null);
  assert.equal(parsed.searchParams.get("application_name"), "api");
});

test("verify-full retains the supplied DigitalOcean CA certificate", () => {
  assert.deepEqual(databaseSslConfig("verify-full", "line-one\\nline-two"), {
    rejectUnauthorized: true,
    ca: "line-one\nline-two",
  });
});
