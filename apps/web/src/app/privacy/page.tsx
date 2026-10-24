import type { Metadata } from "next";
import { ArrowLeft, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";

const effectiveDate = "24 October 2026";

export const metadata: Metadata = {
  title: "Privacy Policy | Munna Gas Connect",
  description: "How Munna Gas Connect collects, uses, shares, protects, and retains business and authorized-user information.",
};

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t pt-8 first:border-t-0 first:pt-0">
      <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-muted-foreground md:text-base">{children}</div>
    </section>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen px-5 py-8 md:px-8 md:py-14">
      <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border bg-card shadow-sm">
        <header className="border-b bg-primary px-6 py-9 text-primary-foreground md:px-12 md:py-12">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-white/85 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
            <ArrowLeft className="size-4" aria-hidden="true" />
            Munna Gas Connect
          </Link>
          <div className="mt-8 flex items-start gap-4">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white/15">
              <ShieldCheck className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/75">Your information</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Privacy Policy</h1>
              <p className="mt-3 text-sm text-white/80">Effective and last updated: {effectiveDate}</p>
            </div>
          </div>
        </header>

        <div className="space-y-10 px-6 py-9 md:px-12 md:py-12">
          <div className="rounded-2xl border bg-muted/60 p-5 text-sm leading-7 text-foreground md:text-base">
            MUNNA UNITED DISTRIBUTORS PRIVATE LIMITED ("we", "us", or "our") operates Munna Gas Connect, a business application for approved commercial LPG customers, their authorized users, and serving agencies. This policy explains how we handle information through the mobile app, dashboards, APIs, support channels, and related services.
          </div>

          <PolicySection title="1. Information we collect">
            <p>We collect and process information that is reasonably necessary to onboard, secure, and operate commercial LPG accounts, including:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-primary">
              <li><strong className="text-foreground">Authorized-user details:</strong> name, mobile number, role, account access, OTP and session records, support communications, and security events.</li>
              <li><strong className="text-foreground">Business and outlet details:</strong> legal and trade names, GSTIN and other approved identifiers, registered and delivery addresses, delivery coordinates, outlet contacts, LPG requirements, cylinder stock and return information, and serving-agency assignment.</li>
              <li><strong className="text-foreground">Commercial and operational records:</strong> quotations, negotiated prices, orders, deliveries, standing requirements, invoices, payment allocations, credit limits, credit status, net terms, balances, disputes, support cases, and audit history.</li>
              <li><strong className="text-foreground">App and device information:</strong> app version, device platform, notification permission status, encrypted push-notification token, and limited technical logs needed for security and reliability.</li>
              <li><strong className="text-foreground">Documents:</strong> business or verification documents submitted through approved workflows when private document storage is enabled.</li>
            </ul>
            <p>We do not store payment-card credentials in the current service. We do not sell personal information or use it for third-party behavioural advertising.</p>
          </PolicySection>

          <PolicySection title="2. How we use information">
            <p>We use the information to verify and administer business accounts; authenticate authorized users; prepare quotations; accept and fulfil orders; coordinate deliveries; manage invoices, credit and recorded payments; provide operational analytics and support; send transactional notifications; prevent misuse; maintain audit trails; and meet contractual, tax, accounting, security, and other legal obligations.</p>
            <p>Where consent or a separate notice is required, we will provide it at or before the relevant collection or permission request. Users can decline optional device permissions, although the related feature may then be unavailable.</p>
          </PolicySection>

          <PolicySection title="3. Notifications and communications">
            <p>We may send OTPs, registration confirmations, order and delivery updates, invoice reminders, payment confirmations, credit-status updates, support-case updates, and standing-order reminders through the app, SMS, or other approved communication channels. Push notifications can be disabled through device settings. Transactional records may still remain available inside the app.</p>
          </PolicySection>

          <PolicySection title="4. When information is shared">
            <p>We share only the information needed for the relevant business purpose with:</p>
            <ul className="list-disc space-y-2 pl-5 marker:text-primary">
              <li>the approved serving agency and authorized delivery or operational personnel responsible for the account;</li>
              <li>infrastructure, database, storage, security, support, messaging, and notification providers acting for us, including DigitalOcean for cloud infrastructure and Expo/Google Firebase for app updates and notifications;</li>
              <li>professional advisers, auditors, insurers, or contractual counterparties where reasonably necessary and subject to appropriate obligations; and</li>
              <li>government, regulatory, judicial, or law-enforcement authorities when disclosure is required by applicable law or a valid legal process.</li>
            </ul>
            <p>We do not permit service providers to use account information for their own advertising purposes.</p>
          </PolicySection>

          <PolicySection title="5. Retention">
            <p>We keep information only for as long as it is needed for the purposes described in this policy. Account and operational information is generally retained while the business relationship remains active. Notification tokens are retained until they are revoked, replaced, or become invalid. OTP challenges and technical security records are retained for limited security and troubleshooting periods.</p>
            <p>Orders, deliveries, invoices, payment records, credit decisions, audit trails, support cases, and verification documents may be retained for longer periods where necessary for tax, accounting, contractual, dispute-resolution, fraud-prevention, safety, or other legal requirements. When information is no longer required, we delete it, anonymize it, or securely isolate it until deletion is possible.</p>
          </PolicySection>

          <PolicySection title="6. Security">
            <p>We use role-based access controls, tenant and agency scoping, encryption in transit, protected device storage for sessions, encrypted storage for selected server-side secrets, audit logging, monitoring, and controlled administrative workflows. No online service can guarantee absolute security, but we review and improve safeguards as the platform develops.</p>
          </PolicySection>

          <PolicySection title="7. Your choices and requests">
            <p>Subject to applicable law and verification of your identity and authority, you may request access to information associated with you, correction or updating of inaccurate information, account deactivation, erasure of information that is no longer required, or grievance redressal.</p>
            <p>Some business and transaction records cannot be immediately deleted when retention is required by law, needed to complete an active transaction, or necessary to establish, exercise, or defend legal claims. Controlled business details such as legal identity, GSTIN, registered phone number, address, and serving-agency assignment are changed through an audited support or approval process.</p>
            <p>Send privacy and account-data requests to <a className="font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary" href="mailto:support@munnaunited.com">support@munnaunited.com</a>. We may ask for additional information to verify the requester and protect the account.</p>
          </PolicySection>

          <PolicySection title="8. Children">
            <p>Munna Gas Connect is a commercial service intended for adult representatives and authorized personnel of registered businesses. It is not directed to children, and we do not knowingly create accounts for children.</p>
          </PolicySection>

          <PolicySection title="9. Changes to this policy">
            <p>We may update this policy when the service, providers, or legal requirements change. The latest version will remain available at this address with its effective date. We will provide an additional notice when a material change requires one.</p>
          </PolicySection>

          <PolicySection title="10. Contact">
            <address className="not-italic text-foreground">
              <strong>MUNNA UNITED DISTRIBUTORS PRIVATE LIMITED</strong><br />
              GSTIN: 36AASCM8686R1ZY<br />
              2-2-1118/1/A/7, 3rd Floor, Hero Building<br />
              Tilak Nagar Road, New Nallakunta<br />
              Hyderabad, Telangana 500044, India
            </address>
            <a className="inline-flex items-center gap-2 font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary" href="mailto:support@munnaunited.com">
              <Mail className="size-4" aria-hidden="true" />
              support@munnaunited.com
            </a>
          </PolicySection>
        </div>
      </article>
    </main>
  );
}
