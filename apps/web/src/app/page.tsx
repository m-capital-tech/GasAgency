"use client";
import { Flame, LayoutDashboard, ShieldCheck, Smartphone } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui";

export default function Landing() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="flex items-center gap-2 text-primary">
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white">
          <Flame className="size-5" />
        </span>
        <span className="text-2xl font-bold tracking-tight text-foreground">GasSetu</span>
      </div>
      <p className="mt-3 max-w-md text-center text-sm text-muted-foreground">LPG cylinder booking marketplace — investor prototype. Mock data only, no real payments.</p>
      <div className="mt-10 grid w-full max-w-3xl gap-4 md:grid-cols-3">
        <Link href="/login?as=agency" className="group rounded-2xl border bg-card p-5 transition hover:border-primary hover:shadow-md">
          <LayoutDashboard className="size-6 text-primary" />
          <p className="mt-3 font-semibold">Agency panel</p>
          <p className="mt-1 text-xs text-muted-foreground">Live order board, staff, stock, settlements. Log in as Suresh (HP Gas, Amberpet).</p>
        </Link>
        <Link href="/login?as=admin" className="group rounded-2xl border bg-card p-5 transition hover:border-primary hover:shadow-md">
          <ShieldCheck className="size-6 text-info" />
          <p className="mt-3 font-semibold">Platform admin</p>
          <p className="mt-1 text-xs text-muted-foreground">GMV, revenue streams, agency approvals, config.</p>
        </Link>
        <div className="rounded-2xl border bg-card p-5">
          <Smartphone className="size-6 text-success" />
          <p className="mt-3 font-semibold">Mobile app</p>
          <p className="mt-1 text-xs text-muted-foreground">Run <code className="rounded bg-muted px-1">pnpm demo</code> and open the Expo app on the iOS Simulator for Riya (customer) and Ramesh (delivery).</p>
        </div>
      </div>
      <div className="mt-8 flex gap-3">
        <Button onClick={() => (window.location.href = "/agency/register")} variant="outline">
          Register a new agency
        </Button>
      </div>
      <p className="mt-10 text-xs text-faint">Demo logins: suresh@demo · admin@demo · password 123456</p>
    </main>
  );
}
