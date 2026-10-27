import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
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
    login_otp: { id: "100000000001", text: "{{code}} is your OTP to log in to Munna Gas Connect. It is valid for 5 minutes. Do not share it with anyone." },
    tenant_registration: { id: "100000000002", text: "{{businessName}} is registered on Munna Gas Connect with {{servingAgencyName}}. Get the app: {{appLink}}. Support: {{supportContact}}." },
    platform_access: { id: "100000000003", text: "Your Munna Gas Connect platform access is ready. Log in with your registered mobile number and OTP." },
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
    message: "123456 is your OTP to log in to Munna Gas Connect. It is valid for 5 minutes. Do not share it with anyone.",
    sendername: "GASB2B",
    smstype: "TRANS",
    numbers: "919876543210",
    peid: "100123456789",
    templateid: "100000000001",
  });
});

test("signs relay submissions without placing the relay secret in the request", async () => {
  let capturedRequest: RequestInit | undefined;
  const relaySigningSecret = "relay-signing-secret-with-at-least-32-bytes";
  const provider = new MessageIndiaProvider(options(async (_input, init) => {
    capturedRequest = init;
    return new Response(JSON.stringify({ success: true, messageId: "provider-message-2" }), { status: 200 });
  }, { sendUrl: "https://myemipay.com/api/munna-sms-relay", relaySigningSecret }));

  await provider.send({
    idempotencyKey: "auth-otp-sms:challenge-signed",
    channel: "sms",
    destinationE164: "+919876543210",
    template: { name: "login_otp", version: "v1", parameters: { code: "123456" } },
  });

  const headers = new Headers(capturedRequest?.headers);
  const timestamp = headers.get("x-munna-timestamp");
  assert.ok(timestamp);
  assert.equal(headers.get("x-munna-idempotency-key"), "auth-otp-sms:challenge-signed");
  const expected = createHmac("sha256", relaySigningSecret)
    .update(`${timestamp}\nauth-otp-sms:challenge-signed\n${String(capturedRequest?.body)}`)
    .digest("hex");
  assert.equal(headers.get("x-munna-signature"), `v1=${expected}`);
  assert.doesNotMatch(JSON.stringify(Object.fromEntries(headers)), /relay-signing-secret/);
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
    template: {
      name: "tenant_registration",
      version: "v1",
      parameters: {
        businessName: "Test Kitchen",
        servingAgencyName: "City Gas Agency",
        appLink: "https://play.google.com/store/apps/details?id=com.munnagas.connect",
        supportContact: "support@munnaunited.com",
      },
    },
  });
  assert.equal(capturedUrl?.searchParams.get("apikey"), "secret-api-key-value");
  assert.equal(capturedUrl?.searchParams.get("templateid"), "100000000002");
  assert.equal(
    capturedUrl?.searchParams.get("message"),
    "Test Kitchen is registered on Munna Gas Connect with City Gas Agency. Get the app: https://play.google.com/store/apps/details?id=com.munnagas.connect. Support: support@munnaunited.com.",
  );
  assert.equal(receipt.providerReference, "abc-123");
  assert.throws(() => new MessageIndiaProvider(options(fetch, { sendUrl: "http://sms.example.test/v2/sendSMS" })), /must use HTTPS/);
});

test("requires the exact placeholder contract before accepting a configured DLT template", () => {
  assert.throws(
    () => new MessageIndiaProvider(options(fetch, {
      templates: {
        ...options(fetch).templates,
        tenant_registration: { id: "100000000002", text: "{{businessName}} is registered." },
      },
    })),
    /does not use parameter servingAgencyName,appLink,supportContact/,
  );
  assert.throws(
    () => new MessageIndiaProvider(options(fetch, {
      templates: {
        ...options(fetch).templates,
        platform_access: { id: "100000000003", text: "Welcome {{name}}." },
      },
    })),
    /missing parameter name/,
  );
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

test("production configuration requires HTTPS POST and validates configured DLT templates", () => {
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
    MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT: "{{code}} is your OTP to log in to Munna Gas Connect. It is valid for 5 minutes. Do not share it with anyone.",
    MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_ID: "100000000002",
    MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_TEXT: "{{businessName}} is registered on Munna Gas Connect with {{servingAgencyName}}. Get the app: {{appLink}}. Support: {{supportContact}}.",
    MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_ID: "100000000003",
    MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_TEXT: "Your Munna Gas Connect platform access is ready. Log in with your registered mobile number and OTP.",
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
  assert.throws(
    () => loadWorkerConfig({
      ...environment,
      MESSAGEINDIA_SEND_URL: "https://myemipay.com/api/munna-sms-relay",
      MESSAGEINDIA_TRANSPORT: "post",
    }),
    /My EMI relay/,
  );
  const relayParsed = loadWorkerConfig({
    ...environment,
    MESSAGEINDIA_SEND_URL: "https://myemipay.com/api/munna-sms-relay",
    MESSAGEINDIA_TRANSPORT: "post",
    MESSAGEINDIA_RELAY_SIGNING_SECRET: "relay-signing-secret-with-at-least-32-bytes",
  });
  assert.equal(relayParsed.messageIndia?.relaySigningSecret, "relay-signing-secret-with-at-least-32-bytes");
});

test("production configuration can activate approved login OTP while later DLT templates remain unavailable", () => {
  const parsed = loadWorkerConfig({
    APP_ENV: "production",
    DATABASE_URL: "postgresql://runtime:secret@db.example.test:25060/platform",
    DATABASE_SSL_MODE: "verify-full",
    DATABASE_CA_CERT: "test-ca",
    OTP_DELIVERY_KEY: Buffer.alloc(32, 9).toString("base64"),
    MESSAGE_PROVIDER: "messageindia",
    MESSAGEINDIA_SEND_URL: "https://myemipay.com/api/munna-sms-relay",
    MESSAGEINDIA_TRANSPORT: "post",
    MESSAGEINDIA_USERNAME: "account-user",
    MESSAGEINDIA_API_KEY: "secret-api-key-value",
    MESSAGEINDIA_SENDER_NAME: "MEMIPY",
    MESSAGEINDIA_ENTITY_ID: "1701178557282913157",
    MESSAGEINDIA_LOGIN_OTP_TEMPLATE_ID: "1777179264578233316",
    MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT: "Your My EMI login OTP is {{code}}. It is valid for 5 minutes. Do not share this OTP with anyone. - My EMI",
    MESSAGEINDIA_RELAY_SIGNING_SECRET: "relay-signing-secret-with-at-least-32-bytes",
  });
  assert.deepEqual(Object.keys(parsed.messageIndia?.templates ?? {}), ["login_otp"]);
});
