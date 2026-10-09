# Production worker

This process handles asynchronous work recorded in `app.outbox_events`. It claims only event types with registered handlers, so deploying the foundation before SMS/WhatsApp integration cannot consume or discard invitation events.

Claims use short transactions with `FOR UPDATE SKIP LOCKED`. Provider calls happen after the transaction has committed. Successful events are completed only by the worker holding the lock; failures are released with capped exponential retry and a bounded error message.

The worker now uses a provider-neutral `MessagingProvider` contract and registers handlers for tenant invitations, platform-team invitations, and login OTP messages. The included local provider records deterministic delivery receipts and can optionally reveal template parameters in local/test logs. It is rejected by configuration in staging and production.

OTP values arrive as AES-256-GCM envelopes and are decrypted only immediately before provider delivery. Delivery rows, provider references, attempts, invitation state, and outbox completion are persisted without storing the plaintext code.

A real provider adapter will implement the same interface once the SMS account, DLT templates, callback authentication, and credentials are available. SMS failure/undelivered callbacks will then drive the WhatsApp fallback path.

```bash
pnpm --filter @platform/worker build
APP_ENV=local \
DATABASE_URL='postgresql://...' \
DATABASE_SSL_MODE=disable \
MESSAGE_PROVIDER=local \
OTP_DELIVERY_KEY='base64-encoded-32-byte-local-key' \
pnpm --filter @platform/worker start
```
