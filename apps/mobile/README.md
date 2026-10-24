# Tenant mobile app

The default runtime is the production tenant-authentication path. A registered tenant requests an OTP from the platform API, verifies it, stores the opaque session token in the device secure store, restores the session against the server on launch, and selects a tenant when one phone identity belongs to multiple businesses.

The production client never falls back to the bundled demo engine. The demo personas and fixed demo OTP appear only when `EXPO_PUBLIC_DEMO_MODE=true` is supplied for an explicitly marked demo build.

Copy `.env.example` to a local uncommitted environment file and set `EXPO_PUBLIC_PLATFORM_API_URL`. On a physical device this must be a LAN-reachable API address rather than `localhost`. Local API configuration may expose its configured test OTP in the request response; staging and production reject that server setting.

Release builds also require `EXPO_PUBLIC_PRIVACY_POLICY_URL`, a public HTTPS page for the final legal entity and product. The Account screen exposes this link when configured. Do not point it at an unpublished draft or a temporary local address.

The production tenant path includes a first-login registration summary, serving-agency details, outlet stock and requirement maintenance, account-specific commercial-cylinder pricing, credit availability, delivery slots, server quotations, empty-cylinder handover and delivery instructions, idempotent COD or approved-credit order placement, live order timelines, billing summaries, GST invoice detail, agency-recorded payment allocations, daily/weekly/monthly tenant analytics, private-document metadata, and audited support or controlled-field change requests. Quote totals are never calculated authoritatively on the device. Payment-provider checkout remains a future integration and stays unavailable outside the explicit demo build flag.

The five production tabs are Home, Orders, Insights, Billing, and Account. Owners and managers can edit only operational outlet contact, handover, stock, and requirement fields. Staff have read-only access. Legal identity, GSTIN/FSSAI, registered phone, outlet address, and serving-agency changes are submitted as support requests for platform review rather than directly changing the approved record.

## Notifications and OTA updates

The app config includes the Expo Notifications native plugin, an Android high-importance `account-updates` channel, foreground presentation, cold/warm notification-response handling, and validated routing to tenant-owned order, invoice, Billing, Support, and new-order screens. Transactional events cover order placement/status, invoice issue, recorded payments, credit terms/status, invoice due/overdue reminders, support-case updates, and weekly standing-requirement reminders. Push registration is authenticated. It is enabled for preview and production builds after deployment of the server registration endpoint and configuration of the permanent EAS project.

Android production push uses Firebase project `munna-gas-connect`, whose Android app matches `com.munnagas.connect`. Its `google-services.json` is stored as the EAS file variable `GOOGLE_SERVICES_JSON`; the dynamic app config consumes the temporary file path without storing the file in source control. A dedicated least-privilege FCM V1 service-account key is assigned to the Android application in EAS credentials and must never be copied into a public `EXPO_PUBLIC_*` variable or Git. iOS requires an Apple Developer membership and an APNs push key, which EAS can manage during credential setup. The release preflight requires the Android client file whenever push registration is enabled.

The `myemipay.com` Google Cloud organization enforces managed service-account-key creation restrictions. FCM key rotation therefore requires an Organization Policy Administrator to create a temporary exception only for `munna-gas-connect`, upload the replacement directly to EAS, remove every local copy, and immediately restore the inherited restriction.

`eas.json` keeps development, preview, and production builds on matching EAS environments and update channels. Preview and production are pinned to the DigitalOcean production API over HTTPS, force demo mode off, and enable authenticated push registration. Runtime compatibility follows the native app version, so an update cannot cross an incompatible binary version.

The permanent identity is Munna Gas Connect: Expo owner `m-capital`, project `@m-capital/munna-gas-connect`, project UUID `4843ac47-13e9-4126-9874-77d49dc47aa2`, deep-link scheme `munnagasconnect`, and Android/iOS identifier `com.munnagas.connect`. Development, preview, and production EAS Update channels point to branches with the same names. `pnpm release:check:preview` and `pnpm release:check:production` are mandatory preflights. The production preflight deliberately rejects a different Expo owner/project, the retired GasSetu identity, demo package identifiers, demo mode, missing project linkage, non-HTTPS/private API targets, and mismatched EAS environment/channel routing.

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
