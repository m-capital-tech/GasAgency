# Tenant mobile app

The default runtime is the production tenant-authentication path. A registered tenant requests an OTP from the platform API, verifies it, stores the opaque session token in the device secure store, restores the session against the server on launch, and selects a tenant when one phone identity belongs to multiple businesses.

The production client never falls back to the bundled demo engine. The demo personas and fixed demo OTP appear only when `EXPO_PUBLIC_DEMO_MODE=true` is supplied for an explicitly marked demo build.

Copy `.env.example` to a local uncommitted environment file and set `EXPO_PUBLIC_PLATFORM_API_URL`. On a physical device this must be a LAN-reachable API address rather than `localhost`. Local API configuration may expose its configured test OTP in the request response; staging and production reject that server setting.

The production tenant path now includes serving-agency details, outlet stock, account-specific commercial-cylinder pricing, credit availability, delivery slots, server quotations, and idempotent COD or approved-credit order placement. Quote totals are never calculated authoritatively on the device. Production tracking, billing, and support remain future milestones; their richer demo screens still run only under the explicit demo build flag.
