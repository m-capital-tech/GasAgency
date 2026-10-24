import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkerConfig } from "../src/config";
import { ExpoPushProvider } from "../src/push/expo-provider";
import { buildPushContent } from "../src/push/handlers";
import { PushProviderError, type OutboundPush } from "../src/push/provider";
import type { OutboxEvent } from "@platform/database";

const tokenOne = "ExpoPushToken[unit-test-token-1234567890]";
const tokenTwo = "ExponentPushToken[unit-test-token-0987654321]";

function message(deliveryPublicId: string, token: string): OutboundPush {
  return {
    deliveryPublicId,
    token,
    title: "Order update",
    body: "ORD-100 is out for delivery.",
    data: { tenantPublicId: "0199ed7f-7450-7000-8000-000000000001", orderPublicId: "0199ed7f-7450-7000-8000-000000000002" },
  };
}

test("Expo adapter sends a bounded authenticated batch without returning tokens", async () => {
  let captured: { url: string; init?: RequestInit } | undefined;
  const provider = new ExpoPushProvider({
    requestTimeoutMs: 5_000,
    accessToken: "expo-access-token-value",
    fetchImplementation: async (input, init) => {
      captured = { url: String(input), init };
      return new Response(JSON.stringify({ data: [{ status: "ok", id: "ticket-one" }, { status: "ok", id: "ticket-two" }] }), { status: 200 });
    },
  });
  const results = await provider.send([message("delivery-one", tokenOne), message("delivery-two", tokenTwo)]);
  assert.equal(captured?.url, "https://exp.host/--/api/v2/push/send");
  assert.equal(captured?.init?.method, "POST");
  assert.equal((captured?.init?.headers as Record<string, string>).authorization, "Bearer expo-access-token-value");
  assert.equal((JSON.parse(String(captured?.init?.body)) as Array<{ channelId: string }>)[0]?.channelId, "account-updates");
  assert.deepEqual(results, [
    { deliveryPublicId: "delivery-one", outcome: "accepted", providerReference: "ticket-one" },
    { deliveryPublicId: "delivery-two", outcome: "accepted", providerReference: "ticket-two" },
  ]);
  assert.doesNotMatch(JSON.stringify(results), /unit-test-token/);
});

test("Expo adapter distinguishes stale devices, transient failures, and redacts provider responses", async () => {
  const provider = new ExpoPushProvider({
    requestTimeoutMs: 5_000,
    fetchImplementation: async () => new Response(JSON.stringify({ data: [
      { status: "error", message: `remove ${tokenOne}`, details: { error: "DeviceNotRegistered" } },
      { status: "error", message: `retry ${tokenTwo}`, details: { error: "MessageRateExceeded" } },
    ] }), { status: 200 }),
  });
  const results = await provider.send([message("delivery-one", tokenOne), message("delivery-two", tokenTwo)]);
  assert.deepEqual(results, [
    { deliveryPublicId: "delivery-one", outcome: "device_not_registered", errorCode: "DeviceNotRegistered" },
    { deliveryPublicId: "delivery-two", outcome: "failed", errorCode: "MessageRateExceeded", retryable: true },
  ]);
  assert.doesNotMatch(JSON.stringify(results), /unit-test-token/);

  const rejected = new ExpoPushProvider({
    requestTimeoutMs: 5_000,
    fetchImplementation: async () => new Response(`invalid ${tokenOne}`, { status: 401 }),
  });
  await assert.rejects(
    () => rejected.send([message("delivery-one", tokenOne)]),
    (error: Error) => {
      assert.ok(error instanceof PushProviderError);
      assert.equal(error.errorCode, "http_401");
      assert.equal(error.retryable, true);
      assert.doesNotMatch(error.message, /unit-test-token|ExpoPushToken/);
      return true;
    },
  );
});

test("Expo adapter aborts a stalled HTTPS request at the configured timeout", async () => {
  const provider = new ExpoPushProvider({
    requestTimeoutMs: 1_000,
    fetchImplementation: (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }),
  });
  await assert.rejects(
    () => provider.send([message("delivery-one", tokenOne)]),
    (error: Error) => error instanceof PushProviderError && error.errorCode === "request_timeout" && error.retryable,
  );
});

test("event payloads become tenant-scoped push content without using free-form reasons", () => {
  const event: OutboxEvent = {
    id: "1",
    publicId: "0199ed7f-7450-7000-8000-000000000010",
    eventType: "order.status_changed",
    aggregateType: "order",
    aggregatePublicId: "0199ed7f-7450-7000-8000-000000000002",
    payload: {
      tenantPublicId: "0199ed7f-7450-7000-8000-000000000001",
      orderPublicId: "0199ed7f-7450-7000-8000-000000000002",
      orderNumber: "ORD-100",
      toStatus: "out_for_delivery",
      reason: "sensitive internal note",
    },
    attemptCount: 1,
    createdAt: new Date(),
  };
  const content = buildPushContent(event);
  assert.equal(content.body, "ORD-100 is out for delivery.");
  assert.deepEqual(content.data, {
    tenantPublicId: "0199ed7f-7450-7000-8000-000000000001",
    orderPublicId: "0199ed7f-7450-7000-8000-000000000002",
    eventType: "order.status_changed",
  });
  assert.doesNotMatch(JSON.stringify(content), /sensitive internal note/);
});

test("all supported commercial events expose only trusted navigation identifiers", () => {
  const tenantPublicId = "0199ed7f-7450-7000-8000-000000000001";
  const orderPublicId = "0199ed7f-7450-7000-8000-000000000002";
  const invoicePublicId = "0199ed7f-7450-7000-8000-000000000003";
  const paymentPublicId = "0199ed7f-7450-7000-8000-000000000004";
  const event = (eventType: string, payload: unknown): OutboxEvent => ({
    id: "1",
    publicId: "0199ed7f-7450-7000-8000-000000000010",
    eventType,
    aggregateType: "test",
    aggregatePublicId: orderPublicId,
    payload,
    attemptCount: 1,
    createdAt: new Date(),
  });
  assert.deepEqual(buildPushContent(event("order.placed", { tenantPublicId, publicId: orderPublicId, orderNumber: "ORD-100" })).data, {
    tenantPublicId, orderPublicId, eventType: "order.placed",
  });
  assert.deepEqual(buildPushContent(event("invoice.issued", {
    tenantPublicId, orderPublicId, invoicePublicId, invoiceNumber: "INV-100", totalAmount: "500.00",
  })).data, { tenantPublicId, orderPublicId, invoicePublicId, eventType: "invoice.issued" });
  assert.deepEqual(buildPushContent(event("payment.recorded", { tenantPublicId, paymentPublicId, amount: "500.00" })).data, {
    tenantPublicId, paymentPublicId, eventType: "payment.recorded", route: "billing",
  });
  const creditAccountPublicId = "0199ed7f-7450-7000-8000-000000000005";
  const supportCasePublicId = "0199ed7f-7450-7000-8000-000000000006";
  const requirementPublicId = "0199ed7f-7450-7000-8000-000000000007";
  const outletPublicId = "0199ed7f-7450-7000-8000-000000000008";
  assert.deepEqual(buildPushContent(event("credit.terms_changed", {
    tenantPublicId, creditAccountPublicId, change: "updated", creditLimit: "150000.00", netTermDays: 30,
  })).data, { tenantPublicId, creditAccountPublicId, eventType: "credit.terms_changed", route: "billing" });
  assert.equal(buildPushContent(event("credit.status_changed", {
    tenantPublicId, creditAccountPublicId, status: "suspended", reason: "private internal reason",
  })).body, "Credit ordering is paused. Open Billing for account details.");
  assert.deepEqual(buildPushContent(event("invoice.due_soon", {
    tenantPublicId, invoicePublicId, invoiceNumber: "INV-100", outstandingAmount: "500.00", dueAt: "2026-10-23T04:30:00.000Z",
  })).data, { tenantPublicId, invoicePublicId, eventType: "invoice.due_soon" });
  assert.deepEqual(buildPushContent(event("support_case.updated", {
    tenantPublicId, casePublicId: supportCasePublicId, caseNumber: "CASE-100", status: "in_progress", updateType: "started", note: "private case response",
  })).data, { tenantPublicId, casePublicId: supportCasePublicId, eventType: "support_case.updated", route: "support" });
  assert.deepEqual(buildPushContent(event("standing_order.reminder", {
    tenantPublicId, requirementPublicId, outletPublicId, outletLabel: "Main kitchen", deliveryDate: "2026-10-23", totalQuantity: 3,
  })).data, { tenantPublicId, outletPublicId, eventType: "standing_order.reminder", route: "order" });
  assert.throws(() => buildPushContent(event("unknown.event", {})), /unsupported push event type/);
});

test("new account and support notifications never expose operator reasons or case notes", () => {
  const tenantPublicId = "0199ed7f-7450-7000-8000-000000000001";
  const aggregatePublicId = "0199ed7f-7450-7000-8000-000000000002";
  const event = (eventType: string, payload: unknown): OutboxEvent => ({
    id: "1", publicId: "0199ed7f-7450-7000-8000-000000000010", eventType,
    aggregateType: "test", aggregatePublicId, payload, attemptCount: 1, createdAt: new Date(),
  });
  const credit = buildPushContent(event("credit.status_changed", {
    tenantPublicId, creditAccountPublicId: aggregatePublicId, status: "suspended", reason: "risk-team-only text",
  }));
  const support = buildPushContent(event("support_case.updated", {
    tenantPublicId, casePublicId: aggregatePublicId, caseNumber: "CASE-100", status: "resolved", updateType: "resolved", note: "private resolution",
  }));
  assert.doesNotMatch(JSON.stringify([credit, support]), /risk-team-only|private resolution/);
});

test("production can run push-only while the local messaging provider remains forbidden", () => {
  const base = {
    APP_ENV: "production",
    DATABASE_URL: "postgresql://runtime:secret@db.example.test:25060/platform",
    DATABASE_SSL_MODE: "verify-full",
    DATABASE_CA_CERT: "test-ca",
  };
  const pushOnly = loadWorkerConfig({
    ...base,
    MESSAGE_PROVIDER: "disabled",
    PUSH_PROVIDER: "expo",
    PUSH_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString("base64"),
  });
  assert.equal(pushOnly.messageProvider, "disabled");
  assert.equal(pushOnly.otpDeliveryKey, undefined);
  assert.equal(pushOnly.pushProvider, "expo");
  assert.throws(() => loadWorkerConfig({ ...base, MESSAGE_PROVIDER: "local", PUSH_PROVIDER: "disabled" }), /local messaging provider is forbidden/);
});
