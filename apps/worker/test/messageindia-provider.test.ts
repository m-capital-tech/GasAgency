import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkerConfig } from "../src/config";
import { MessageIndiaProvider, type MessageIndiaProviderOptions } from "../src/messaging/messageindia-provider";

const options = (fetchImplementation: typeof fetch, overrides: Partial<MessageIndiaProviderOptions> = {}): MessageIndiaProviderOptions => ({
  sendUrl: "https://sms.example.test/v2/sendSMS",
  transport: "post",
  username: "account-user",
  apiKey: "secret-api-key-value",
  senderName: "GASB2B",
  entityId: "100123456789",
  requestTimeoutMs: 5_000,
  templates: {
    login_otp: { id: "100000000001", text: "Your login OTP is {{code}}. It expires in 5 minutes." },
    tenant_registration: { id: "100000000002", text: "{{businessName}} is registered. Sign in to place your LPG order." },
    platform_access: { id: "100000000003", text: "Your platform access is ready. Sign in with your registered mobile number." },
  },
  fetchImplementation,
  ...overrides,
});

test("sends an encoded DLT-compliant request without changing the provider contract", async () => {
  let capturedUrl: URL | undefined;
  let capturedRequest: RequestInit | undefined;
  const provider = new MessageIndiaProvider(options(async (input, init) => {
    capturedUrl = new URL(String(input));
    capturedRequest = init;
    return new Response(JSON.stringify({ success: true, messageId: "provider-message-1" }), { status: 200 });
  }));

  const receipt = await provider.send({
    idempotencyKey: "auth-otp-sms:challenge-1",
    channel: "sms",
    destinationE164: "+919876543210",
    template: { name: "login_otp", version: "v1", parameters: { code: "123456" } },
  });

  assert.deepEqual(receipt, { provider: "messageindia", providerReference: "provider-message-1", status: "sent" });
  assert.equal(capturedUrl?.toString(), "https://sms.example.test/v2/sendSMS");
  assert.equal(capturedRequest?.method, "POST");
  const body = new URLSearchParams(String(capturedRequest?.body));
  assert.deepEqual(Object.fromEntries(body), {
    username: "account-user",
    apikey: "secret-api-key-value",
    message: "Your login OTP is 123456. It expires in 5 minutes.",
    sendername: "GASB2B",
    smstype: "TRANS",
    numbers: "919876543210",
    peid: "100123456789",
    templateid: "100000000001",
  });
});

test("supports the provider dashboard GET contract only over HTTPS", async () => {
  let capturedUrl: URL | undefined;
  const provider = new MessageIndiaProvider(options(async (input) => {
    capturedUrl = new URL(String(input));
    return new Response("msgid=abc-123", { status: 200 });
  }, { transport: "get" }));
  const receipt = await provider.send({
    idempotencyKey: "tenant-invitation-sms:invitation-1",
    channel: "sms",
    destinationE164: "+919999999999",
    template: { name: "tenant_registration", version: "v1", parameters: { businessName: "Test Kitchen" } },
  });
  assert.equal(capturedUrl?.searchParams.get("apikey"), "secret-api-key-value");
  assert.equal(capturedUrl?.searchParams.get("templateid"), "100000000002");
  assert.equal(receipt.providerReference, "abc-123");
  assert.throws(() => new MessageIndiaProvider(options(fetch, { sendUrl: "http://sms.example.test/v2/sendSMS" })), /must use HTTPS/);
});

test("rejects provider failures without leaking credentials or destinations", async () => {
  const provider = new MessageIndiaProvider(options(async () => new Response(JSON.stringify({ success: false, message: "invalid api key" }), { status: 200 })));
  await assert.rejects(
    () => provider.send({
      idempotencyKey: "auth-otp-sms:challenge-2",
      channel: "sms",
      destinationE164: "+919876543210",
      template: { name: "login_otp", version: "v1", parameters: { code: "654321" } },
    }),
    (error: Error) => {
      assert.match(error.message, /rejected/);
      assert.doesNotMatch(error.message, /secret-api-key-value|9876543210|654321/);
      return true;
    },
  );
});

test("production configuration requires HTTPS POST and every DLT template", () => {
  const environment = {
    APP_ENV: "staging",
    DATABASE_URL: "postgresql://runtime:secret@db.example.test:25060/platform",
    DATABASE_SSL_MODE: "verify-full",
    DATABASE_CA_CERT: "test-ca",
    OTP_DELIVERY_KEY: Buffer.alloc(32, 9).toString("base64"),
    MESSAGE_PROVIDER: "messageindia",
    MESSAGEINDIA_SEND_URL: "http://sms.example.test/v2/sendSMS",
    MESSAGEINDIA_TRANSPORT: "get",
    MESSAGEINDIA_USERNAME: "account-user",
    MESSAGEINDIA_API_KEY: "secret-api-key-value",
    MESSAGEINDIA_SENDER_NAME: "GASB2B",
    MESSAGEINDIA_ENTITY_ID: "100123456789",
    MESSAGEINDIA_LOGIN_OTP_TEMPLATE_ID: "100000000001",
    MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT: "Your login OTP is {{code}}.",
    MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_ID: "100000000002",
    MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_TEXT: "{{businessName}} is registered.",
    MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_ID: "100000000003",
    MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_TEXT: "Your platform access is ready.",
  };
  assert.throws(() => loadWorkerConfig(environment), /must use HTTPS/);
  assert.throws(() => loadWorkerConfig({ ...environment, MESSAGEINDIA_SEND_URL: "https://sms.example.test/v2/sendSMS" }), /require POST/);
  const parsed = loadWorkerConfig({
    ...environment,
    MESSAGEINDIA_SEND_URL: "https://sms.example.test/v2/sendSMS",
    MESSAGEINDIA_TRANSPORT: "post",
  });
  assert.equal(parsed.messageProvider, "messageindia");
  assert.equal(parsed.messageIndia?.templates.login_otp.id, "100000000001");
});
