import { ArrowRight, Building2, Eye, ShieldCheck, Truck } from "lucide-react";
import Link from "next/link";
import { Badge, Card, CardContent } from "@/components/ui";

const dashboards = [
  { href: "/review/control", title: "Platform Control", description: "Executive analytics, onboarding, Super Admin oversight, and team RBAC.", icon: Building2 },
  { href: "/review/operations", title: "Agency Operations", description: "Order fulfillment, inventory, delivery activity, and account operations.", icon: Truck },
];

export default function ReviewHome() {
  return <main className="min-h-screen bg-muted/40 px-5 py-12">
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><Badge tone="info"><Eye className="mr-1 size-3" />Team review</Badge><h1 className="mt-4 text-3xl font-bold tracking-tight">Commercial LPG platform preview</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">Review the dashboard experience without OTP. Every record on these pages is fictional sample data and every operational control is read-only.</p></div>
        <Link href="/control/login" className="text-sm font-semibold text-primary">Open secure login →</Link>
      </div>
      <div className="mt-8 grid gap-5 md:grid-cols-2">{dashboards.map(({ href, title, description, icon: Icon }) => <Link href={href} key={href} className="group"><Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary/40 group-hover:shadow-md"><CardContent className="p-7"><span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary"><Icon /></span><h2 className="mt-5 text-xl font-bold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-primary">Open dashboard <ArrowRight className="size-4" /></span></CardContent></Card></Link>)}</div>
      <div className="mt-6 flex gap-3 rounded-2xl border bg-card p-5 text-sm"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" /><div><p className="font-semibold">Production data remains protected</p><p className="mt-1 text-muted-foreground">The real Platform Control and Agency Operations dashboards still require OTP, MFA where applicable, and permission-scoped access.</p></div></div>
    </div>
  </main>;
}
