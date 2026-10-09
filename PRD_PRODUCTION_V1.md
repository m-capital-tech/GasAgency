# GasSetu production product specification

**Status:** Approved — Phase 1 implementation in progress  
**Version:** 1.0 approved  
**Date:** 30 Sep 2026  
**Owner:** Pranav Aditya

This document is the canonical product specification for the production build. It supersedes the onboarding, authentication, tenant-verification, and active-product-language sections of `PRD_LPG_Booking_Platform.md`, `PRD_B2B_ADDENDUM.md`, and the current prototype README. Those documents remain useful as implementation history and demo reference.

## 1. Product scope

GasSetu is a multi-agency commercial LPG ordering and account-management platform. Its primary tenants are restaurants and hotels. Cloud kitchens, canteens, bakeries, cafes, tea stalls, hospitals, hostels, and similar commercial buyers are supported secondary segments.

There is no domestic LPG customer journey in the active product.

The production surfaces are:

1. **Platform admin dashboard** — agency administration, tenant registration, commercial terms, invitations, oversight, and support.
2. **Tenant mobile app** — OTP login, outlet stock, commercial-cylinder ordering, order tracking, billing, and support.
3. **Agency operations panel** — fulfilment, inventory, delivery, pricing, collections, and account operations. The existing prototype surface will later be connected to the production backend.
4. **Delivery mode** — assigned drops, route progress, OTP delivery, empties, and COD collection. This remains part of the broader platform, even though the first production build focuses on admin and tenant surfaces.

## 2. Terminology and tenancy

- A **tenant** is a commercial LPG-buying business account, such as a restaurant or hotel.
- A tenant can have one or more **outlets**.
- Every active outlet belongs to exactly one tenant.
- Every tenant has exactly one active serving-agency assignment at a time.
- An authorized platform team member explicitly selects that agency; production onboarding never auto-assigns an agency.
- A **tenant user** is a person allowed to access a tenant in the mobile app.
- A phone number identifies a person, not a business. A user may eventually hold memberships in more than one tenant without duplicating the identity.
- If a user belongs to multiple tenants, the app must require an explicit tenant selection after login and preserve the last selection.

## 3. Administration hierarchy and RBAC

```text
Super Admin
  -> Platform Admin
      -> Platform team members with scoped roles
          -> Tenant creation and platform operations
  -> Agency owners and their staff
  -> Tenant owners and their staff
  -> Delivery partners
```

### 3.1 Super Admin

The Super Admin is the highest-trust executive role, intended for the Founder, Chairman, Managing Director, or an explicitly appointed equivalent. It is not the default role for routine operations.

Super Admin capabilities:

- Create, activate, suspend, and remove Platform Admin access.
- Define the global permission catalogue and the maximum permissions Platform Admins may delegate.
- View all agencies, tenants, orders, payments, credit, inventory, support, messaging, audit, and system-health data.
- View company-wide executive analytics, revenue streams, unit economics, trends, risk, and forecasts.
- Configure platform-wide commercial rules, feature flags, providers, and operational thresholds.
- Suspend or reinstate any agency, tenant, user, payment method, or affected workflow during an incident.
- Override tenant approval, agency assignment, pricing, and credit decisions only with a mandatory reason and immutable audit record.
- Run or authorize bulk operations and exports.
- Open a read-only support view of another role's experience; write impersonation is prohibited in v1.
- Review all privileged actions, including actions performed by Platform Admins.

Super Admin safeguards:

- Mandatory MFA and short privileged-session lifetime.
- No shared accounts.
- Step-up authentication for exports, permission changes, overrides, and destructive actions.
- Every action includes actor, reason, request metadata, before/after values, and correlation ID.
- Super Admin cannot erase audit events or permanently delete financial/order history.

### 3.2 Platform Admin

A Platform Admin leads an operations team. Platform Admin access may be scoped by region, city, agency group, or another explicit operating scope.

Platform Admin capabilities within that scope:

- Add, suspend, and manage their platform team.
- Create roles by selecting delegable permissions up to the Platform Admin's own permission ceiling. Tenant approval, credit approval, role administration, and other reserved permissions cannot be delegated to ordinary team members.
- Approve, reject, or request changes to tenant submissions.
- Select or change a tenant's serving agency.
- Approve, suspend, and modify tenant credit limits and net terms.
- Manage tenant status, users, support cases, and controlled profile changes.
- View operational, onboarding, tenant, agency, order, delivery, credit, and messaging analytics for their scope.
- View audit history for their team and scoped operational entities.
- Export scoped operational reports when explicitly permitted.

A Platform Admin cannot:

- Grant Super Admin or Platform Admin status.
- Grant a permission they do not possess.
- Change or delete audit history.
- View system secrets or provider credentials.
- View executive-only company-wide profitability, capital, board, or ownership reporting unless the Super Admin grants a separate permission.

### 3.3 Platform team RBAC

RBAC uses three elements:

1. **Resource** — tenant, agency, order, credit, payment, report, support case, message, configuration, user, or role.
2. **Action** — view, create, edit, submit, approve, reject, suspend, export, execute, or manage.
3. **Scope** — all permitted operations, selected region/city, selected agencies, or assigned records.

Default-deny applies to every permission. Server-side authorization is mandatory; hiding a UI control is not authorization.

Recommended starter roles:

| Role | Intended permissions |
|---|---|
| Onboarding Executive | Create/edit tenant drafts, validate GSTIN and phone, select agency, submit for approval; cannot approve |
| Credit Analyst | View tenant financial history and recommend terms; cannot approve or modify limits/net terms |
| Finance Operations | View invoices/ledger and record collections; cannot change limits or net terms |
| Support Operations | View scoped tenant/order details, handle cases and change requests; sensitive fields masked by default |
| Operations Analyst | Read scoped analytics and reports; no mutations or PII export by default |

Platform Admins may combine or customize these roles within their permission ceiling.

### 3.4 Maker–checker rule

- A team member with `tenant.create` creates and submits a tenant.
- A Platform Admin approves, rejects, or requests changes.
- Ordinary platform team members cannot receive `tenant.approve` or `credit.approve`.
- The creator cannot approve their own submission.
- A Platform Admin may create a tenant, but their submission still requires another Platform Admin or a Super Admin override.
- Super Admin override requires step-up authentication and a reason.
- Invitation delivery starts only after approval.

### 3.5 Capability matrix

| Capability | Super Admin | Platform Admin | Platform team | Agency | Tenant | Delivery |
|---|---:|---:|---:|---:|---:|---:|
| Manage Platform Admins | Yes | No | No | No | No | No |
| Manage platform team/roles | Global | Own scope | If delegated | No | No | No |
| Create tenant draft | Yes | Yes | With permission | No | No | No |
| Approve tenant | Override | Yes | No | No | No | No |
| Approve own tenant submission | Override only | No | No | No | No | No |
| Select/change agency | Yes | Scoped | With permission | No | Request | No |
| Suspend/archive tenant | Yes | Scoped | With permission | No | No | No |
| Approve credit/limits/terms | Yes | Scoped | Recommend only | No | No | No |
| Enable agency credit globally | Yes | Scoped | With permission | Own agency | No | No |
| Set base/slab prices | Override | Scoped override | With permission | Own agency | No | No |
| Set negotiated tenant price | Override | Scoped override | With permission | Assigned account | No | No |
| Record credit payment | Yes | Scoped | With permission | Assigned account | No | No |
| Place an order | Audited support | Audited support | If delegated | No | Yes | No |
| Fulfil order | Override | Support override | If delegated | Yes | No | Assigned actions |
| View platform executive reports | Yes | If explicitly granted | No by default | No | No | No |

No client application is trusted to enforce this matrix. Every API operation must enforce it server-side.

## 4. Canonical tenant onboarding

There is no public tenant self-registration.

```text
Authorized platform team member opens Create tenant
  -> enters business and contact details
  -> creates the initial outlet and LPG requirement
  -> explicitly selects the serving agency
  -> proposes prepaid or credit terms
  -> reviews and submits for approval
  -> Platform Admin reviews
     -> requests changes, rejects, or approves
  -> approval activates the tenant
  -> system queues registration SMS
  -> SMS delivered: invitation complete
  -> SMS failed/undelivered after fallback window: queue WhatsApp
  -> tenant opens app and verifies OTP
  -> tenant can place an order immediately
```

Platform approval is the verification event. There is no separate verification after an approved tenant is activated.

The create operation must atomically create:

- Person identity for the registered phone, or safely reuse an existing identity.
- Tenant business.
- Tenant-owner membership.
- Initial outlet and normalized address.
- Commercial LPG requirement.
- Explicit agency assignment.
- Prepaid account or approved credit terms.
- Invitation record.
- Audit event containing the creating admin and submitted values.

The initial save creates a tenant draft and an audit event. Submission freezes approval-sensitive values until the record is returned for changes. Approval and activation are transactional. If activation fails, the tenant remains pending approval and no invitation is sent. Retrying with the same idempotency key must return the original result rather than create a duplicate tenant or invitation.

## 5. Admin Create tenant fields

### Business and contact

| Field | Required | Notes |
|---|---:|---|
| Legal/trading business name | Yes | Displayed throughout the product |
| Business type | Yes | Restaurant and hotel appear first |
| Owner/contact name | Yes | First tenant owner |
| Mobile number | Yes | Normalized to E.164; used for invitation and OTP |
| Alternate mobile number | No | Not an authentication identity unless separately invited |
| GSTIN | Yes | Validated, normalized, and checked for an existing active tenant |
| FSSAI number | No | Relevant food-business identifier |
| Internal admin notes | No | Never shown to the tenant or agency |

### Initial outlet and address

| Field | Required | Notes |
|---|---:|---|
| Outlet label | Yes | For example, Main kitchen |
| Address line 1 | Yes | Building/door/street |
| Address line 2 / landmark | No | Area or landmark |
| City | Yes | Initially defaults to Hyderabad but is stored explicitly |
| State | Yes | Stored explicitly for future multi-city operation |
| Pincode | Yes | Validated and used for service checks |
| Latitude/longitude | Yes | Selected or confirmed on a map |
| Outlet contact name | No | Defaults to tenant owner |
| Outlet contact phone | No | Defaults to registered mobile |
| Delivery instructions | No | Gate, floor, receiving hours, etc. |

### LPG requirement

The requirement is structured operational data, not a free-text note:

| Field | Required | Notes |
|---|---:|---|
| Cylinder types | Yes | One or both of 19 kg and 47.5 kg commercial |
| Expected quantity | Yes | Positive value per selected cylinder type |
| Requirement period | Yes | Per week or per month |
| Current cylinders in use | Yes | May be zero |
| Spare full cylinders | Yes | May be zero |
| Empty cylinders held | Yes | May be zero |
| Preferred delivery days | No | Weekdays |
| Preferred delivery slot | No | Before opening, standard, evening, or express |
| Commercial connection | No | OMC and consumer/distributor reference when available |

### Agency and commercial terms

| Field | Required | Notes |
|---|---:|---|
| Serving agency | Yes | Admin explicitly chooses an approved, active agency |
| Pricing preview | Yes | Read-only effective base/slab price before creation |
| Account payment mode | Yes | Defaults to prepaid |
| Credit status | Conditional | Only admin can approve |
| Credit limit | Conditional | Required and positive for approved credit |
| Net terms | Conditional | Net-7, net-15, or net-30 in v1 |
| Credit decision note | Conditional | Required when approving, suspending, or declining credit |

## 6. Tenant lifecycle

```text
DRAFT -> PENDING_APPROVAL
  -> CHANGES_REQUESTED -> DRAFT
  -> REJECTED
  -> ACTIVE <-> SUSPENDED -> ARCHIVED
```

- **DRAFT:** editable by its creator and permitted team members; invisible to tenant and agency users.
- **PENDING_APPROVAL:** submitted and approval-sensitive fields are locked.
- **CHANGES_REQUESTED:** returned to the creating team for correction with a mandatory reviewer note.
- **REJECTED:** not activated; retained for audit and duplicate detection.
- **ACTIVE:** may authenticate and order, subject to agency, pricing, payment, and credit rules.
- **SUSPENDED:** cannot create sessions or orders; historical records remain visible to authorized operators.
- **ARCHIVED:** terminal for normal operations; data is retained according to policy and cannot be reused as a new tenant record.

Invitation delivery and first login do not control tenant activation. Approval activates the tenant; invitation delivery begins immediately afterwards.

## 7. Invitation delivery

SMS is primary. WhatsApp is fallback only; it is not sent after a successfully delivered SMS.

```text
QUEUED
  -> SMS_SENT
     -> SMS_DELIVERED (complete)
     -> SMS_FAILED -> WHATSAPP_QUEUED
     -> SMS_UNDELIVERED after configured window -> WHATSAPP_QUEUED
  -> WHATSAPP_SENT
     -> WHATSAPP_DELIVERED (complete)
     -> WHATSAPP_FAILED (manual attention)
```

Requirements:

- The fallback window is configurable; default target is 5 minutes unless provider constraints require a different value.
- Provider callbacks must be signature-verified and idempotent.
- Each attempt stores provider, channel, template version, destination, provider reference, timestamps, and failure reason.
- Admin can view delivery history and manually resend.
- Manual resend creates a new attempt under the same invitation; it does not create a new tenant.
- Messages must not contain passwords, OTPs, full credit details, or sensitive documents.

Registration message content:

- Confirmation that the named business was registered on GasSetu.
- App/deep link.
- Instruction to sign in with the registered number and OTP.
- Assigned agency name.
- Support contact.

## 8. Authentication

- Only registered, active identities may request a usable OTP.
- The public response for registered and unknown numbers must not disclose account existence.
- Unknown numbers cannot create a tenant account from the app.
- OTPs must expire, be stored as hashes, have attempt limits, resend cooldowns, replay protection, and per-phone/per-IP throttling.
- Successful OTP verification creates a revocable device session.
- For Super Admin, Platform Admin, and platform-team identities, phone OTP creates only a short-lived MFA handoff. First login enrolls an authenticator; subsequent logins require a current TOTP or an unused recovery code before a privileged session is issued.
- Authenticator secrets must be encrypted at rest. MFA handoff tokens and recovery codes must be stored only as keyed hashes; recovery codes are displayed once and consumed once.
- Suspending a tenant or user revokes affected sessions.
- The first login does not repeat business onboarding. It shows a read-only registration summary, followed by the tenant home.
- If the identity belongs to multiple tenants, successful OTP verification is followed by tenant selection.

## 9. Field ownership after onboarding

| Data | Tenant can edit | Agency can edit | Admin can edit |
|---|---:|---:|---:|
| Business name/type | Request change | No | Yes |
| GSTIN/FSSAI | Request change | No | Yes |
| Registered login phone | Request change | No | Yes |
| Outlet contact and delivery instructions | Yes | No | Yes |
| Outlet address/location | Request change | No | Yes |
| Outlet stock counts | Yes | Delivery updates | Yes |
| LPG requirement estimate | Yes | Can suggest | Yes |
| Serving agency | Request change | No | Yes |
| Base/slab pricing | No | Yes | Override |
| Negotiated price | No | Yes | Override |
| Credit approval/limit/terms | No | No | Yes |
| Agency-wide credit availability | No | Own agency | Yes |
| Recorded credit payment | No | Assigned accounts | Yes |

“Request change” creates an auditable support request; it does not mutate the controlled field immediately.

## 10. Credit rules

- A newly created tenant is prepaid unless the creating admin explicitly approves credit.
- Only a platform admin can approve credit or change its limit and net terms.
- Agencies can enable or disable credit globally for their agency.
- Effective credit ordering requires both an admin-approved tenant credit account and agency-wide credit availability.
- Agencies can record collections against their assigned tenants.
- Agencies can set negotiated prices but cannot change credit limits or terms.
- Credit ordering is blocked when the tenant is suspended, credit is suspended, an invoice is overdue, or the new exposure would exceed the approved limit.
- Every credit decision and change requires a reason and an immutable audit event.

## 11. Order eligibility

A tenant user may request a quote and place an order only when all of the following are true:

1. User and membership are active.
2. Tenant is active.
3. Selected outlet is active and belongs to the tenant.
4. An active admin-selected agency assignment exists.
5. Agency is approved and active.
6. Requested cylinder types are supplied and priced by the agency.
7. Quantity and slot rules pass.
8. The selected payment method is allowed.
9. Credit-specific rules pass when paying on credit.

The server recomputes pricing and eligibility at order creation. Client totals are never authoritative.

## 12. Analytics, events, and reporting boundaries

Analytics access follows the same scope and permissions as operational data. Aggregation does not grant access to data the viewer could not otherwise access. Exports are a separate permission and are always audited.

### 12.1 Super Admin executive command centre

The Super Admin sees the whole platform and can drill from an aggregate into the authorized underlying entities.

#### Daily summary

- GMV, net order value, platform revenue, orders, and cylinders for today versus yesterday and the comparable weekday.
- Orders by state: placed, accepted, assigned, out for delivery, delivered, failed, cancelled, and rejected.
- New tenant drafts, pending approvals, approvals, rejections, invitations, first logins, and first orders.
- Active agencies, agencies with order or delivery backlogs, and agencies with low inventory.
- Payment success/failure, COD outstanding, credit exposure, collections, newly overdue invoices, and overdue aging.
- Delivery on-time rate, median acceptance/assignment/delivery time, failed-delivery rate, and open operational exceptions.
- SMS, WhatsApp, and OTP delivery/success rates with failed or delayed provider activity.
- Critical support cases, security events, integration failures, background-job failures, and actions requiring executive attention.

#### Weekly summary

- Week-over-week GMV, orders, cylinders, revenue, active tenants, and active agencies.
- Tenant onboarding funnel: draft to submitted to approved to invited to first login to first order.
- Tenant activation, repeat-order, retention, inactive-account, and churn-risk cohorts.
- Agency performance comparison: fulfilment volume, acceptance time, on-time delivery, failure rate, inventory risk, complaints, and collections.
- Credit book movement, utilization, overdue trends, collection efficiency, concentration risk, and top exposures.
- Revenue mix: commission, facilitation, convenience, express, subscriptions, refunds, and reversals.
- Support volume, resolution SLA, recurring issue categories, and product adoption.
- Security, access, export, override, and audit exceptions.

#### Monthly summary

- Month-over-month and year-to-date GMV, orders, cylinders, revenue, active tenants, retention, and agency growth.
- Business-segment, geography, agency, outlet, cylinder, payment-method, and acquisition-source performance.
- Unit-economics view: gross platform revenue, direct transaction/provider costs when available, contribution indicators, and revenue per active tenant/agency.
- Credit-book closing position, aging, provisions/risk flags, collections, write-off recommendations, and limit utilization.
- Agency subscription and commercial performance.
- Operational SLA and customer-support trends.
- Product funnel and feature adoption.
- Forecast versus target and an exportable executive/board summary.

#### Executive actions

The command centre may surface executable actions, but each action still requires its own permission and confirmation:

- Approve or suspend Platform Admins.
- Resolve urgent approval or operational backlogs.
- Suspend affected entities or payment methods during an incident.
- Change thresholds and platform configuration.
- Approve exceptional credit, pricing, or assignment overrides.
- Launch an audited bulk operation.
- Export an executive report.

Analytics cards themselves must never execute a mutation without an explicit review step.

### 12.2 Platform Admin analytics

Platform Admins receive daily, weekly, and monthly analytics for their assigned operating scope. Their dashboard is operational rather than ownership/board focused.

Platform Admin analytics may show:

- Scoped tenant drafts, pending approvals, reviewer workload, approval time, invitation delivery, first login, and first order.
- Scoped tenant growth, active/inactive tenants, business segments, outlets, order frequency, cylinder demand, and low-stock risk.
- Scoped agency volume, backlog, delivery SLA, failure rate, inventory risk, complaints, and account coverage.
- Scoped GMV, orders, payments, refunds, COD, credit exposure, outstanding invoices, aging, and collections.
- Scoped messaging/OTP health and operational integration failures.
- Team workload, turnaround time, actions, and approval/audit exceptions.
- Tenant-level drilldown when the role has the necessary operational permission.

Platform Admin analytics must not show by default:

- Company ownership, capital, valuation, board material, executive targets, or founder-only notes.
- Unscoped regions, agencies, tenants, or team activity.
- Platform-wide profitability or confidential unit-economics inputs.
- Provider credentials, infrastructure secrets, raw OTP values, or unrestricted security data.
- Another team's private performance or disciplinary data unless expressly authorized.

### 12.3 Platform team analytics

Team members see only the metrics needed for their role and scope:

- Onboarding staff: their drafts, submissions, requested changes, approval turnaround, invitation outcomes, and first-login conversion.
- Approvers: pending queue, age/SLA, validation warnings, decision history, and team quality indicators.
- Credit/finance: scoped exposure, utilization, aging, collections, due invoices, and reconciliation exceptions.
- Support/operations: scoped orders, delivery exceptions, cases, response SLA, and resolution trends.
- Analysts: explicitly permitted aggregates; raw PII and exports are separate permissions.

Individual staff productivity must not be used as a hidden disciplinary score. If performance reporting is introduced, its definitions and visibility must be documented.

### 12.4 Tenant analytics

Tenant analytics are strictly limited to the selected tenant and its outlets. A tenant never sees another tenant's behavior, agency margins, platform revenue, internal risk scores, or admin/team performance.

#### Daily tenant view

- Current stock and estimated days of LPG remaining by outlet.
- Orders placed today and active delivery states.
- Cylinders ordered/delivered and empties due/collected.
- Today's spend and invoices due or overdue.
- Low-stock, delivery, billing, account, and support events.

#### Weekly tenant view

- Cylinder consumption and spend versus the prior week.
- Orders and cylinders by outlet and cylinder type.
- Average delivery time and on-time delivery rate for their orders.
- Empty-cylinder reconciliation.
- Credit used, available, collected, and becoming due.
- Standing-order performance and exceptions.

#### Monthly tenant view

- Total orders, cylinders, taxable value, GST, fees, and total spend.
- Outlet and cylinder-type comparison.
- Invoice, payment, credit-ledger, and statement summary.
- Pricing/slab/negotiated-rate savings where objectively calculable.
- Consumption trend and next-period requirement estimate.
- Downloadable invoices and consolidated statement.

Tenant analytics are operational estimates unless labelled as accounting records. Financial totals must reconcile to invoices and ledger entries before being represented as final.

### 12.5 Event visibility

| Event class | Super Admin | Platform Admin/team | Tenant |
|---|---|---|---|
| Tenant created/submitted/approved | Global | Scoped and permissioned | Approval/invitation outcome only |
| Role, permission, export, override | Global audit | Own team/scope if permitted | No |
| Agency assignment/status | Global | Scoped | Own assignment/status only |
| Order and delivery | Global | Scoped | Own tenant only |
| Credit decision and collections | Global | Scoped and permissioned | Own terms, invoices, and payments only |
| Messaging and OTP operations | Aggregate + failures | Scoped delivery status | User-facing delivery/login result only |
| Security and infrastructure | Global | Operational subset if permitted | Service-status message only |
| Company revenue/unit economics | Global | Explicit permission only | No |

Sensitive personal fields must be masked in lists and analytics. Revealing full values or exporting them requires an explicit permission and generates an audit event.

## 13. Phase 0 acceptance criteria

- [x] Product is unambiguously commercial/B2B.
- [x] Restaurants and hotels are the primary tenant segments.
- [x] Tenant registration is platform-team-led; public self-registration is excluded.
- [x] An authorized platform team member explicitly selects the serving agency.
- [x] A Platform Admin activates a team-created tenant through a maker–checker workflow.
- [x] GSTIN is mandatory during tenant creation.
- [x] SMS is primary and WhatsApp is fallback.
- [x] Registered tenants authenticate with OTP and may order immediately.
- [x] Credit authority is limited to platform admin.
- [x] Agencies retain negotiated pricing, payment-recording, and global credit controls.
- [x] Super Admin authority and safeguards are defined.
- [x] Platform Admin team RBAC and delegation boundaries are defined.
- [x] Super Admin, Platform Admin/team, and tenant analytics boundaries are defined.
- [x] Daily, weekly, and monthly reporting expectations are defined.
- [x] Field ownership and server-side role authority are defined.
- [x] Tenant, invitation, authentication, credit, and order-eligibility rules are defined.

### Approved implementation defaults

The following defaults were approved on 29 Sep 2026 and are part of the production baseline:

| Decision | Approved rule |
|---|---|
| Can one phone identity access multiple tenant businesses? | Yes; use tenant memberships and require tenant selection after login |
| Platform Admin/team operating scope | Explicit assignment by city/region and, where needed, selected agencies |
| Number of Super Admin accounts | Support multiple named accounts for continuity, with a very small authorized set; never share one login |
| GSTIN verification | Format/checksum at draft time, authoritative verification before approval when an approved integration is available |
| SMS-to-WhatsApp fallback window | Configurable, initially 5 minutes |
| Tenant-editable fields | Outlet contact, delivery instructions, stock, and requirement estimates; controlled fields use change requests |
| Admin pricing override | Allowed only through a separate permission, reason, and audit event |
| Credit terms in v1 | Net-7, net-15, and net-30; exceptional terms require Super Admin override |

## 14. Explicit prototype-to-production changes

The production implementation must change these current prototype behaviours:

- Remove login-time self-registration for unknown phone numbers.
- Remove the mobile business-profile and agency-assignment onboarding flow.
- Remove automatic business verification from connection linking and nearest-agency assignment.
- Replace nearest-agency assignment during onboarding with explicit admin selection.
- Replace the current admin onboarding queue with team tenant drafting, maker–checker approval, activation, and tenant management.
- Add Super Admin and scoped Platform Admin/team RBAC.
- Add bounded executive, operational, and tenant analytics.
- Replace synthetic tokens and unrestricted routes with production sessions and server-side authorization.
- Replace in-memory runtime state with persistent transactional storage.
- Replace mock OTP and registration messages with provider-backed delivery and audited attempts.
- Keep the demo engine available only in explicitly marked demo environments.

## 15. Phase 1 connection checkpoints

No external connection was required to complete Phase 0. DigitalOcean is now the approved production cloud provider, with Bangalore (`blr1`; App Platform region `blr`) confirmed as the primary region. Before provisioning Phase 1 resources, confirm:

- The DigitalOcean team/project owner and the people who require infrastructure access.

The commercial product name and custom domain are intentionally undecided. GasSetu is a working name only. Development and early staging may use local addresses and DigitalOcean-generated application domains. Custom domains are attached later without changing application identity, authorization, storage keys, or database records.

Messaging-provider selection and Indian sender/template approval should begin during Phase 0 because approval lead time may extend beyond the Phase 2 integration work. Credentials are not required until the integration checkpoint.

## 16. Approved DigitalOcean production baseline

### 16.1 Core services

| Concern | DigitalOcean service | Production intent |
|---|---|---|
| Admin dashboard | App Platform web service | Run the Next.js dashboard with server-side authentication and authorization |
| API | App Platform web service | Run the production API as the only trusted business-rule and data-access boundary |
| Background processing | App Platform worker | Process invitation delivery, SMS-to-WhatsApp fallback, provider callbacks, exports, and scheduled summaries without blocking user requests |
| Transactional data | Managed PostgreSQL | Store identity, memberships, tenants, approvals, agencies, orders, invoices, payments, credit, events, and audit records |
| Private networking | VPC | Keep App Platform-to-database traffic on the private network and restrict database trusted sources |
| Business documents | Spaces, private by default | Store KYC evidence, invoices, statements, exports, and delivery evidence behind short-lived authorized access |
| Container images | Container Registry, when needed | Hold versioned deployable images if the Git-based App Platform build is insufficient |
| Queue/cache | Managed Valkey, when justified | Introduce for durable background-work coordination, rate limits, and short-lived state when PostgreSQL-only processing no longer meets the load or reliability target |

The mobile app is distributed through the iOS and Android stores. It calls the DigitalOcean-hosted API but is not itself hosted on App Platform.

### 16.2 Environment layout

- Maintain separate development, staging, and production configuration and credentials.
- Staging and production must not share databases, storage buckets, OTP credentials, signing keys, or third-party webhook secrets.
- Provision staging first. Production resources are provisioned only after the schema, migrations, restore procedure, authorization tests, and deployment pipeline pass in staging.
- Keep the database, application components, and primary storage in the same selected region where the service supports it.
- Use encrypted environment secrets for runtime credentials. Never commit credentials to the repository or place production secrets in demo configuration.

### 16.3 Initial application topology

```text
Tenant mobile app ───────┐
                        ├── HTTPS ──> API service ── private VPC ──> Managed PostgreSQL
Admin dashboard ────────┘                  │
                                           ├──> private Spaces objects
                                           └──> background worker ──> SMS / WhatsApp providers
```

The API remains the authorization boundary. The browser and mobile app never receive database credentials or unrestricted object-storage credentials. Business documents are served through permission-checked, short-lived links or streamed by the API.

### 16.4 DigitalOcean connection sequence

1. The account owner creates the DigitalOcean team and a GasSetu staging project, enables MFA, and adds named operators with least-privilege access.
2. Use Bangalore (`blr1`; App Platform region `blr`) and provider-generated staging domains until the product name and custom domain are finalized.
3. Create the regional VPC and staging Managed PostgreSQL cluster.
4. Create private staging Spaces storage and dedicated application credentials; verify the provider's credential scope and use stronger account/team isolation if bucket-level isolation is not sufficient.
5. Create the App Platform application from the repository using an infrastructure specification maintained in version control.
6. Connect the API and worker to PostgreSQL over the VPC, run migrations as a controlled release job, and verify backup/restore.
7. Configure custom domains, TLS, health checks, deployment alerts, application monitoring, and audit retention.
8. Connect SMS first and WhatsApp second in Phase 2; provider secrets are added only through encrypted environment configuration.
9. Reproduce the tested staging design for production with separate secrets and data stores.

### 16.5 Storage and recovery safeguards

- Spaces buckets containing tenant documents are private; a public CDN is not used for KYC, invoices, statements, or delivery evidence.
- Object keys must not expose GSTINs, phone numbers, or other personal data.
- Retention, deletion, access logging, and signed-link lifetime are documented per document class.
- Because object storage is not the database backup, PostgreSQL recovery and document recovery are tested independently.
- Maintain a separate copy/backup strategy for Spaces objects; availability of an object in the primary bucket is not treated as a backup.
