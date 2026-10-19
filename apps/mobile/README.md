# Tenant mobile app

The default runtime is the production tenant-authentication path. A registered tenant requests an OTP from the platform API, verifies it, stores the opaque session token in the device secure store, restores the session against the server on launch, and selects a tenant when one phone identity belongs to multiple businesses.

The production client never falls back to the bundled demo engine. The demo personas and fixed demo OTP appear only when `EXPO_PUBLIC_DEMO_MODE=true` is supplied for an explicitly marked demo build.

Copy `.env.example` to a local uncommitted environment file and set `EXPO_PUBLIC_PLATFORM_API_URL`. On a physical device this must be a LAN-reachable API address rather than `localhost`. Local API configuration may expose its configured test OTP in the request response; staging and production reject that server setting.

The production tenant path now includes serving-agency details, outlet stock, account-specific commercial-cylinder pricing, credit availability, delivery slots, server quotations, idempotent COD or approved-credit order placement, order history and timelines, billing summaries, GST invoice detail, and agency-recorded payment allocations. Quote totals are never calculated authoritatively on the device. Production support workflows and payment-provider checkout remain future milestones; their richer demo screens still run only under the explicit demo build flag.

## Notifications and OTA updates

The app config includes the Expo Notifications native plugin, an Android high-importance `orders` channel, foreground presentation, cold/warm notification-response handling, and validated routing to tenant-owned order or invoice screens. Push registration is authenticated and off by default; enable `EXPO_PUBLIC_PUSH_REGISTRATION_ENABLED=true` only after the server registration endpoint is deployed and an EAS project is configured.

Android production push additionally requires a Firebase app matching the final Android package. Store its `google-services.json` as an EAS file variable named `GOOGLE_SERVICES_JSON`; the dynamic app config consumes the temporary file path without storing the file in source control. Upload the separate private FCM V1 service-account key through `eas credentials`—never through a public `EXPO_PUBLIC_*` variable or Git. iOS requires an Apple Developer membership and an APNs push key, which EAS can manage during credential setup. The release preflight requires the Android client file whenever push registration is enabled.

`eas.json` keeps development, preview, and production builds on matching EAS environments and update channels. Preview and production are pinned to the DigitalOcean production API over HTTPS, force demo mode off, and keep push registration off until the production worker is active. Runtime compatibility follows the native app version, so an update cannot cross an incompatible binary version.

Run `eas init` only after the permanent commercial app name, Expo owner, slug, deep-link scheme, iOS bundle identifier, and Android package are approved. Commit the resulting non-secret project UUID under `expo.extra.eas.projectId` (or supply `EXPO_EAS_PROJECT_ID`). `pnpm release:check:preview` and `pnpm release:check:production` are mandatory preflights. The production preflight deliberately rejects a missing Expo owner, the temporary GasSetu identity, demo package identifiers, demo mode, missing project linkage, non-HTTPS/private API targets, and mismatched EAS environment/channel routing.

From this directory, the controlled release commands are:

```sh
pnpm release:check:preview
eas build --profile preview
EAS_BUILD_PROFILE=preview eas update --channel preview --environment preview

pnpm release:check:production
eas build --profile production
EAS_BUILD_PROFILE=production eas update --channel production --environment production
```

The explicit `EAS_BUILD_PROFILE` on update commands applies the same fail-closed validation while Expo evaluates the dynamic app config. Never publish an OTA update by omitting `--environment`.

Expo Go remains the fast UI-review path and can exercise local notifications. Current Expo SDKs require a development/preview native build for remote push and for a realistic EAS Update test; Expo Go does not validate production remote delivery.
