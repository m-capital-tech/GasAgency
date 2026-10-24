import { Building2, ShieldCheck, Smartphone } from "lucide-react";
import Link from "next/link";

const accessPoints = [
  {
    href: "/control/login",
    icon: ShieldCheck,
    title: "Platform Control",
    description: "Super Admin and Platform Admin access for tenant onboarding, approvals, credit policy, RBAC, and scoped analytics.",
  },
  {
    href: "/operations/login",
    icon: Building2,
    title: "Agency Operations",
    description: "Agency access for order fulfilment, inventory, negotiated prices, credit availability, collections, and account operations.",
  },
] as const;

export default function Landing() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">Commercial LPG operations</p>
        <h1 className="mt-4 max-w-2xl text-4xl font-bold tracking-tight text-foreground md:text-5xl">Secure business access</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
          Production access for platform teams and serving agencies. Tenant businesses order and manage billing through the mobile app.
        </p>

        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {accessPoints.map(({ href, icon: Icon, title, description }) => (
            <Link key={href} href={href} className="group rounded-2xl border bg-card p-6 transition hover:-translate-y-0.5 hover:border-primary hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon className="size-5" /></span>
              <h2 className="mt-5 text-xl font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
              <p className="mt-5 text-sm font-semibold text-primary">Continue securely →</p>
            </Link>
          ))}
        </div>

        <div className="mt-5 flex items-start gap-4 rounded-2xl border bg-card p-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gold-soft text-gold"><Smartphone className="size-5" /></span>
          <div>
            <h2 className="text-lg font-semibold">Tenant business app</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">Registered restaurants and hotels sign in with their approved mobile number and OTP in the tenant app.</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-faint">
          <p>Authorized business users only. Access attempts and account actions are auditable.</p>
          <Link href="/privacy" className="font-semibold text-primary underline decoration-primary/30 underline-offset-4 hover:decoration-primary">Privacy policy</Link>
        </div>
      </div>
    </main>
  );
}
