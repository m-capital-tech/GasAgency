# Production worker

This process handles asynchronous work recorded in `app.outbox_events`. It claims only event types with registered handlers, so deploying the foundation before SMS/WhatsApp integration cannot consume or discard invitation events.

Claims use short transactions with `FOR UPDATE SKIP LOCKED`. Provider calls happen after the transaction has committed. Successful events are completed only by the worker holding the lock; failures are released with capped exponential retry and a bounded error message.

The worker uses a provider-neutral `MessagingProvider` contract and registers handlers for tenant invitations, platform-team invitations, and login OTP messages. The included local provider records deterministic delivery receipts and can optionally reveal template parameters in local/test logs. It is rejected by configuration in staging and production.

OTP values arrive as AES-256-GCM envelopes and are decrypted only immediately before provider delivery. Delivery rows, provider references, attempts, invitation state, and outbox completion are persisted without storing the plaintext code.

The MessageIndia adapter supports form-encoded POST and the legacy query-string GET contract for local contract testing, but always requires an HTTPS endpoint and permits only POST in staging or production so credentials never appear in URLs. It renders only configured DLT templates, supplies the sender header, principal entity ID and template ID on every request, treats submission as `sent` rather than delivered, redacts credentials and message contents from errors, and uses a bounded request timeout. The API key must remain an encrypted runtime secret.

Production or staging startup with `MESSAGE_PROVIDER=messageindia` requires all three approved templates. Template text must exactly match the DLT registration, with `{{code}}` in the login template and `{{businessName}}` in the tenant-registration template. Do not enable the worker against the legacy plaintext HTTP endpoint. Delivery callbacks and the WhatsApp fallback remain subsequent work.

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
MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT=Your OTP is {{code}} ...
MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_ID=...
MESSAGEINDIA_TENANT_REGISTRATION_TEMPLATE_TEXT={{businessName}} ...
MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_ID=...
MESSAGEINDIA_PLATFORM_ACCESS_TEMPLATE_TEXT=...
MESSAGEINDIA_REQUEST_TIMEOUT_MS=10000
```
