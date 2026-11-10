# Google Play preparation pack

Status date: 10 November 2026

This pack prepares the commercial tenant app for a Google Play developer account and a later app submission. It does not authorize creation of a paid account or publication. Items marked **Owner decision** must be confirmed before creating the permanent Android app record.

## 1. Current release status

| Area | Built | Live in production | Remaining gate |
| --- | --- | --- | --- |
| Tenant push-token registration | Yes | Enabled for signed preview/production builds | Physical-device registration and revocation test |
| Expo push delivery worker | Yes | Active on DigitalOcean | Physical-device receipt and stale-token test |
| Notification event generation | Yes | Active for the documented transactional events | Production device smoke test for every tap route |
| EAS Update / OTA configuration | Yes | Production channel and runtime `1.0.0` are active | Physical-device update and rollback acceptance test |
| Android App Bundle | Yes | Signed production AAB `1.0.0` build `2` completed | Upload to Play internal testing and complete device acceptance |
| Store listing and policy declarations | Drafted below | Privacy policy is live | Final screenshots, account verification, reviewer access, and declarations |

## 2. Google Play developer account

Use an **Organization** account because the app is a commercial B2B service operated for a business. Google requires an organization account to provide a D-U-N-S number and verification information. Obtain the D-U-N-S record before starting; Google notes that the process can take up to 30 days.

Official references:

- [Choose a developer account type](https://support.google.com/android-developer-console/answer/16641046)
- [Required Play Console account information](https://support.google.com/googleplay/android-developer/answer/13628312)
- [Developer identity verification](https://support.google.com/googleplay/android-developer/answer/10841920)

### Information the owner must confirm

- **Owner decision:** Final legal entity name exactly as registered.
- **Owner decision:** D-U-N-S number whose organization name and address exactly match the legal entity.
- **Owner decision:** Registered organization address and organization phone number.
- **Owner decision:** Official organization website. A temporary DigitalOcean app hostname should not be used as the company website.
- **Owner decision:** Public developer name shown on Google Play.
- **Owner decision:** Public developer email and phone number. These are displayed on Google Play and must remain monitored.
- **Owner decision:** Private Play Console contact name, email, and phone number.
- Government photo ID for the authorized representative.
- An accepted organization document whose name matches the D-U-N-S profile.
- A Google Payments organization profile using the same legal identity.
- Payment method for Google's account registration charge.

Do not use a personal account for this app merely to avoid organization verification. New personal accounts can also be subject to a production-access test requiring at least 12 testers continuously opted into a closed test for 14 days. [Google's current testing requirement](https://support.google.com/googleplay/android-developer/answer/14151465)

## 3. Permanent app identity

The permanent application identity was approved on 24 October 2026:

- Display name: `Munna Gas Connect`
- Expo slug: `munna-gas-connect`
- Deep-link scheme: `munnagasconnect`
- Android package: `com.munnagas.connect`
- iOS bundle identifier: `com.munnagas.connect`

The Android package is approved and must be used unchanged for Firebase and Google Play. Expo project `@m-capital/munna-gas-connect` is linked with project ID `4843ac47-13e9-4126-9874-77d49dc47aa2`. Remaining identity work is to replace the current placeholder icon, adaptive icon, splash artwork, and brand colors with approved production assets.

## 4. Notification catalogue

The production notification code currently handles the following tenant events:

| Event | Title | Trigger | Opens |
| --- | --- | --- | --- |
| `order.placed` | Order placed | Tenant successfully places an order | Order detail |
| `order.status_changed` | Order update | Agency accepts, rejects, assigns, dispatches, fails, delivers, or cancels an order | Order detail |
| `invoice.issued` | Invoice issued | Delivery completion creates the invoice | Invoice detail |
| `payment.recorded` | Payment recorded | Agency records and allocates a tenant payment | Billing |
| `credit.terms_changed` | Credit approved / Credit terms updated | Platform administrator approves or changes the limit or net term | Billing |
| `credit.status_changed` | Credit suspended / reinstated / agency credit availability | Platform administrator changes account status, or the serving agency changes its global credit availability | Billing |
| `invoice.due_soon` | Invoice due tomorrow | An open invoice enters the configured due-soon window (24 hours by default) | Invoice detail |
| `invoice.overdue` | Invoice overdue | An unpaid invoice crosses its due date | Invoice detail |
| `support_case.updated` | Support case update | Platform team creates, comments on, or transitions a tenant-linked support case | Support |
| `standing_order.reminder` | Standing order reminder | A saved weekly outlet requirement is due the next day | New order |

Foreground presentation, Android's high-importance `account-updates` channel, cold/warm tap handling, tenant-ownership validation, encrypted device-token storage, idempotent delivery records, bounded retries, and stale-device handling are implemented.

Scheduled reminders use the same durable worker and transactional outbox as order events. Due and overdue messages are deduplicated by invoice and due date. Standing-order reminders run after 07:00 Asia/Kolkata by default, summarize the saved outlet requirement, and open the order form; they never place an order automatically. Notification payloads deliberately omit internal credit reasons and support notes. Undelivered events expire after 48 hours by default so enabling push does not release stale operational messages.

Not currently triggered:

- Tenant registration approval or welcome push (the device has not logged in and registered a push token yet).
- OTP push (OTP is delivered by SMS; a push must never be used as the authentication factor).
- Marketing messages.

## 5. OTA update policy

The mobile app includes `expo-updates`, separates `preview` and `production` channels, checks for updates on launch, and uses the native app version as its runtime compatibility boundary.

The Expo/EAS project and development, preview, and production channels are configured. OTA is active on the production channel for runtime `1.0.0`; a compatible update becomes available after a native production build is installed. OTA may be used for JavaScript, styling, copy, and bundled asset changes that remain compatible with the installed native runtime. Changes to native modules, permissions, Android package metadata, SDK/runtime version, notification credentials, or other native configuration require a new Play build.

Required activation sequence:

1. Keep the approved Munna Gas Connect identity and `com.munnagas.connect` package unchanged.
2. Keep the linked Expo owner, slug, project UUID, and update channels unchanged.
3. Retain the Firebase Android app, EAS-hosted `google-services.json`, and FCM V1 credential under the organization account.
4. Install the signed build through Play internal testing and verify notification registration, revocation, receipt, tap routing, and OTA on physical Android devices.
5. Publish future compatible updates only to the `production` channel with the production EAS environment.
6. Ship native or runtime-incompatible changes as a new signed Android App Bundle.

## 6. Store listing draft (English, India)

**App name**

`Munna Gas Connect`

**Short description**

`Order commercial LPG, track deliveries, invoices, credit and payments.`

**Full description**

`Munna Gas Connect helps approved restaurants, hotels and other commercial LPG customers manage their account with their serving agency.`

`Registered businesses sign in securely with their approved mobile number and OTP. They can review outlet requirements and available cylinder products, receive server-confirmed account pricing, place COD or approved-credit orders, and follow each order from placement through delivery.`

`The app also provides invoices, statements, recorded payment allocations, credit availability and net terms, operational analytics, serving-agency details, private business-document metadata, and auditable support or registered-detail change requests.`

`Access is limited to businesses onboarded and approved by the platform team. Prices, credit limits and account terms shown in the app are specific to the approved tenant and serving agency.`

**Category**

Business

**Target audience**

Adults aged 18 and above who are authorized representatives or staff of registered commercial LPG customers. The app is not directed to children and is not a consumer LPG marketplace.

**Ads**

No.

**Monetization in the Android app**

No digital goods, subscriptions, or in-app purchases. Commercial LPG orders concern physical goods and offline/externally settled B2B transactions.

**Reviewer access**

The app requires an approved phone identity and OTP. Before review, create a dedicated review tenant with non-sensitive sample data and provide Google with a stable review phone/OTP path or other compliant access instructions. Never provide a real customer's account.

## 7. Data Safety draft

This is an engineering inventory, not legal advice. Reconcile it with the final privacy policy, provider contracts, retention periods, analytics/crash tooling, and live backend configuration before submitting.

### Data collected or processed by the app/backend

| Google Play data family | Examples in this product | Purpose | Handling notes |
| --- | --- | --- | --- |
| Personal info | Name, business phone, outlet contact | Account management, authentication, support | Required for approved business access |
| User IDs | Internal user, tenant, agency, membership IDs | Account management, security | Not used for advertising |
| Address | Registered business and outlet address | Account verification and delivery | Business delivery use |
| Precise/approximate location | Optional outlet/map coordinates if the user uses location-assisted selection | App functionality, delivery | Declare only if included in the final native build and flow |
| Financial info | Credit limit/usage, net terms, invoices, outstanding balances, payment allocations | App functionality and account management | No payment-card credential storage is implemented |
| Purchase history | LPG orders, cylinders, prices, invoices, payments | Order fulfilment, billing, support | Core service data |
| App activity | Order/support/account actions | App functionality, fraud prevention, auditing | Server audit logs |
| Device or other IDs | Expo push token, app version, platform | Transactional notifications, security | Token encrypted at rest; revoke on sign-out |
| Files and documents | GST/FSSAI and other onboarding document metadata; file content only after storage is activated | Business verification | Private Spaces bucket exists; application credentials and production acceptance remain pending |
| Messages | Support-case subjects/descriptions and change requests | Customer support | Not private person-to-person messaging |

### Current security assertions

- Data is encrypted in transit over HTTPS in production.
- Session and push secrets are stored in device secure storage or encrypted server-side fields, as applicable.
- Tenant data is authorization-scoped by membership.
- Users can request correction or deletion through audited in-app support; final legal retention exceptions must be documented.
- Data is not sold and is not used for third-party advertising in the current implementation.

### Items to verify immediately before declaration

- Whether Google treats infrastructure, Expo push, SMS, object storage, and support vendors as service providers for the final configuration.
- Final retention periods for authentication, audit, order, invoice, payment, support, document, and notification data.
- Whether crash reporting or analytics SDKs are added later; none should be declared absent if subsequently enabled.
- Whether the final release requests device location permission.

## 8. App content and policy checklist

Google's review setup includes a privacy policy, ads declaration, restricted-access instructions, target audience, content rating, sensitive-permission declarations, and Data Safety. [Prepare an app for review](https://support.google.com/googleplay/android-developer/answer/9859455)

- [ ] Publish a privacy policy on the final organization's HTTPS website and link it inside the app.
- [ ] Approve the data-retention and deletion-request process with legal/operations.
- [ ] Complete Data Safety using the final production behavior.
- [ ] Declare no ads.
- [ ] Set target audience to adults/business users; exclude children.
- [ ] Complete the IARC content-rating questionnaire.
- [ ] Provide working reviewer access instructions.
- [ ] Upload a signed Android App Bundle.
- [ ] Confirm the bundle targets Google's then-current required Android API. Current Google guidance requires new apps and updates to target Android 16 / API 36 or higher. [Target API requirement](https://developer.android.com/google/play/requirements/target-sdk)
- [ ] Upload a 512 × 512 app icon, 1024 × 500 feature graphic, phone screenshots, and any required tablet assets only if tablet support is enabled.
- [ ] Run Play pre-launch reports and fix crashes, ANRs, accessibility blockers, and broken authenticated paths.
- [ ] Start with Internal testing, then Closed testing, before Production.

## 9. Release acceptance tests

- Install from Play internal testing on at least two physical Android devices and two supported Android versions.
- Fresh install, OTP login, session restore, sign-out, and sign-in again.
- Register/revoke a push token and verify no token is exposed in logs.
- Place an order and receive the order-created notification.
- Exercise every agency order status and verify the correct tenant/device receives it.
- Issue an invoice and record a payment; verify notification text and safe navigation.
- Change credit limit/net terms and suspend/reinstate credit; verify Billing navigation and that internal reasons are absent from the payload.
- Move an invoice into the due and overdue windows; verify each reminder is generated once for that invoice/due date.
- Comment on and transition a tenant-linked support case; verify Support navigation without exposing the case note in the push payload.
- Verify a weekly standing requirement produces one day-before reminder and never creates an order without tenant confirmation.
- Verify another tenant cannot open a notification deep link for an unowned order/invoice.
- Publish a preview OTA copy/style change and verify it updates without changing native behavior.
- Confirm an incompatible native change is rejected from the OTA process and shipped as a new bundle.
- Verify offline/loading/error states, slow network behavior, and API maintenance behavior.
- Complete Play pre-launch report review and record evidence before production rollout.

## 10. Immediate blockers

1. Approved production icon, adaptive icon, splash artwork, and brand colors.
2. Organization Play account information, especially D-U-N-S and public developer contact details.
3. Play internal-testing upload and physical-device notification/OTA acceptance evidence.
4. Dedicated Google reviewer tenant/access method.
5. Final Data Safety, retention, deletion, and vendor declarations.
