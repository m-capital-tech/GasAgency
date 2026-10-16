# Tenant mobile app

The default runtime is the production tenant-authentication path. A registered tenant requests an OTP from the platform API, verifies it, stores the opaque session token in the device secure store, restores the session against the server on launch, and selects a tenant when one phone identity belongs to multiple businesses.

The production client never falls back to the bundled demo engine. The demo personas and fixed demo OTP appear only when `EXPO_PUBLIC_DEMO_MODE=true` is supplied for an explicitly marked demo build.

Copy `.env.example` to a local uncommitted environment file and set `EXPO_PUBLIC_PLATFORM_API_URL`. On a physical device this must be a LAN-reachable API address rather than `localhost`. Local API configuration may expose its configured test OTP in the request response; staging and production reject that server setting.

The production tenant path now includes serving-agency details, outlet stock, account-specific commercial-cylinder pricing, credit availability, delivery slots, server quotations, idempotent COD or approved-credit order placement, order history and timelines, billing summaries, GST invoice detail, and agency-recorded payment allocations. Quote totals are never calculated authoritatively on the device. Production support workflows and payment-provider checkout remain future milestones; their richer demo screens still run only under the explicit demo build flag.

## Notifications and OTA updates

The app config includes the Expo Notifications native plugin, an Android high-importance `orders` channel, foreground presentation, cold/warm notification-response handling, and validated routing to tenant-owned order or invoice screens. Push registration is authenticated and off by default; enable `EXPO_PUBLIC_PUSH_REGISTRATION_ENABLED=true` only after the server registration endpoint is deployed and an EAS project is configured.

`eas.json` defines development, preview, and production update channels. Run `eas init` after the final commercial app identity is chosen, then supply its UUID as `EXPO_EAS_PROJECT_ID`. EAS builds fail closed when that value is absent. Runtime compatibility follows the native app version, so an update cannot cross an incompatible binary version.

Expo Go remains the fast UI-review path and can exercise local notifications. Current Expo SDKs require a development/preview native build for remote push and for a realistic EAS Update test; Expo Go does not validate production remote delivery.
