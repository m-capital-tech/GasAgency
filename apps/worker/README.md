# Production worker

This process handles asynchronous work recorded in `app.outbox_events`. It claims only event types with registered handlers, so deploying the foundation before SMS/WhatsApp integration cannot consume or discard invitation events.

Claims use short transactions with `FOR UPDATE SKIP LOCKED`. Provider calls happen after the transaction has committed. Successful events are completed only by the worker holding the lock; failures are released with capped exponential retry and a bounded error message.

The worker uses a provider-neutral `MessagingProvider` contract and registers handlers for tenant invitations, platform-team invitations, and login OTP messages. The included local provider records deterministic delivery receipts and can optionally reveal template parameters in local/test logs. It is rejected by configuration in staging and production.

OTP values arrive as AES-256-GCM envelopes and are decrypted only after the worker has re-read the challenge and confirmed that it is unexpired, unconsumed, not invalidated, belongs to an active or invited user, and still targets the same phone number. Tenant and platform invitations are likewise checked against their current completion, cancellation, user, tenant, role-assignment, and destination state before delivery. Skipped stale events are recorded as failed deliveries without exposing or decrypting an OTP. Delivery rows, provider references, attempts, invitation state, and outbox completion are persisted without storing the plaintext code.

The push pipeline consumes tenant order, invoice, and recorded-payment events. It resolves only active tenant memberships with active Expo devices, decrypts each token immediately before delivery with the dedicated push-token key and domain-bound associated data, and records an idempotent event/device result. Expo ticket acceptance is recorded separately from device delivery. `DeviceNotRegistered` makes the device stale; transient errors use the worker's capped backoff and a per-device attempt ceiling. Tokens are never logged, returned, or stored in delivery rows.

The MessageIndia adapter supports form-encoded POST and the legacy query-string GET contract for local contract testing, but always requires an HTTPS endpoint and permits only POST in staging or production so credentials never appear in URLs. It renders only configured DLT templates, supplies the sender header, principal entity ID and template ID on every request, treats submission as `sent` rather than delivered, redacts credentials and message contents from errors, and uses a bounded request timeout. The API key must remain an encrypted runtime secret.

Production or staging startup with `MESSAGE_PROVIDER=messageindia` requires all three approved templates. Template text must exactly match the DLT registration. The supported placeholder contract is `{{code}}` for login OTP; `{{businessName}}`, `{{servingAgencyName}}`, `{{appLink}}`, and `{{supportContact}}` for tenant registration; and no placeholders for platform access. Provider startup rejects missing, extra, or unused placeholders. Do not enable the worker against the legacy plaintext HTTP endpoint.

Delivery callbacks remain blocked until MessageIndia supplies the real callback signing/authentication scheme, message-reference field, retry behavior, and terminal status mapping. Do not invent or expose an unsigned callback endpoint. WhatsApp fallback execution also remains subsequent work; the worker now persists each invitation's payload-controlled fallback deadline instead of hardcoding five minutes.

```bash
pnpm --filter @platform/worker build
APP_ENV=local \
DATABASE_URL='postgresql://...' \
DATABASE_SSL_MODE=disable \
MESSAGE_PROVIDER=local \
OTP_DELIVERY_KEY='base64-encoded-32-byte-local-key' \
pnpm --filter @platform/worker start
```

MessageIndia configuration:

```text
MESSAGE_PROVIDER=messageindia
MESSAGEINDIA_SEND_URL=https://provider-issued-secure-endpoint
MESSAGEINDIA_TRANSPORT=post
MESSAGEINDIA_USERNAME=...
MESSAGEINDIA_API_KEY=...                         # encrypted secret
MESSAGEINDIA_SENDER_NAME=ABCDEF                 # approved six-character header
MESSAGEINDIA_ENTITY_ID=...                      # DLT principal entity ID
MESSAGEINDIA_LOGIN_OTP_TEMPLATE_ID=...
MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT={{code}} is your OTP to log in to Munna Gas Connect. It is valid for 5 minutes. Do not share it with anyone.
MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_ID=...
MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_TEXT={{businessName}} is registered on Munna Gas Connect with {{servingAgencyName}}. Get the app: {{appLink}}. Support: {{supportContact}}.
MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_ID=...
MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_TEXT=Your Munna Gas Connect platform access is ready. Log in with your registered mobile number and OTP.
MESSAGEINDIA_REQUEST_TIMEOUT_MS=10000
```

Expo push configuration:

```text
PUSH_PROVIDER=expo
PUSH_TOKEN_ENCRYPTION_KEY=...                   # canonical base64 32-byte key; must match the API
EXPO_PUSH_ACCESS_TOKEN=...                      # optional Expo enhanced-security token
EXPO_PUSH_REQUEST_TIMEOUT_MS=10000
PUSH_MAX_DELIVERY_ATTEMPTS=5
PUSH_MAX_EVENT_AGE_SECONDS=172800             # discard stale transactional events after 48 hours
NOTIFICATION_SCHEDULER_INTERVAL_MS=300000     # materialize time-based reminders every five minutes
INVOICE_DUE_REMINDER_HOURS=24                # send one reminder in the final 24 hours
STANDING_ORDER_REMINDER_LOCAL_HOUR=7         # 07:00 in the business time zone, one day before
BUSINESS_TIME_ZONE=Asia/Kolkata
```

A production worker may run push-only while the SMS provider is pending:

```text
MESSAGE_PROVIDER=disabled
PUSH_PROVIDER=expo
```

This does not permit `MESSAGE_PROVIDER=local` in staging or production; the local messaging provider remains forbidden there.

Scheduled push events are written into the same durable outbox as transactional events. Invoice due reminders are sent once per invoice/due-date pair, overdue reminders are sent once after the invoice crosses its due date, and weekly standing-order reminders are derived from each outlet's saved requirement and preferred delivery days. A reminder opens the order form but never places an order automatically.
