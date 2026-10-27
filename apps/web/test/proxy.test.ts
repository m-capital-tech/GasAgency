import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";

const sessionCookie = "platform_operations_session=test-session";

async function withProductionEnvironment(run: () => void | Promise<void>) {
  const previousAppEnvironment = process.env.APP_ENV;
  const previousAuditMode = process.env.INTERNAL_AUDIT_MODE;
  process.env.APP_ENV = "production";
  process.env.INTERNAL_AUDIT_MODE = "false";
  try {
    await run();
  } finally {
    if (previousAppEnvironment === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previousAppEnvironment;
    if (previousAuditMode === undefined) delete process.env.INTERNAL_AUDIT_MODE;
    else process.env.INTERNAL_AUDIT_MODE = previousAuditMode;
  }
}

test("allows an authenticated platform session to reach the control dashboard", async () => {
  await withProductionEnvironment(() => {
    const response = proxy(new NextRequest("https://example.test/control", {
      headers: { cookie: sessionCookie },
    }));

    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("location"), null);
  });
});

test("allows an authenticated operations session to reach agency dashboards", async () => {
  await withProductionEnvironment(() => {
    const response = proxy(new NextRequest("https://example.test/operations", {
      headers: { cookie: sessionCookie },
    }));

    assert.equal(response.headers.get("x-middleware-next"), "1");
    assert.equal(response.headers.get("location"), null);
  });
});

test("redirects an unauthenticated control request to the control login", async () => {
  await withProductionEnvironment(() => {
    const response = proxy(new NextRequest("https://example.test/control"));

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://example.test/control/login");
  });
});

test("redirects an unauthenticated operations request to the operations login", async () => {
  await withProductionEnvironment(() => {
    const response = proxy(new NextRequest("https://example.test/operations"));

    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://example.test/operations/login");
  });
});
