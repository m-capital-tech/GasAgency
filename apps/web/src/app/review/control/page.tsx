"use client";

import { BarChart3, Building2, ClipboardCheck, Crown, Eye, LockKeyhole, Shield, Users } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, THead, Tr } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import type { DashboardPeriod } from "@/lib/control-api";
import { DashboardPanel } from "@/app/control/components/dashboard-panel";
import { sampleDashboard, sampleRoles, sampleTenants } from "../sample-data";

type Tab = "dashboard" | "super" | "tenants" | "team";

const nav = [
  { id: "dashboard" as const, label: "Dashboard", icon: BarChart3 },
  { id: "super" as const, label: "Super Admin", icon: Crown },
  { id: "tenants" as const, label: "Tenant accounts", icon: ClipboardCheck },
  { id: "team" as const, label: "Team & RBAC", icon: Users },
];

function SuperAdminPreview() {
  return <div className="grid gap-5">
    <div><h2 className="text-xl font-bold">Super Admin overview</h2><p className="mt-1 text-sm text-muted-foreground">Founder-level visibility without replacing operational owners.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Platform GMV", "₹48.54K", "Three sample orders"], ["Active tenants", "3", "Across 3 sample agencies"], ["Credit exposure", "₹36K", "No overdue amount"], ["Approval SLA", "100%", "No sample submission outside target"]].map(([label, value, note]) => <Card key={label}><CardContent className="p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-2 text-[11px] text-faint">{note}</p></CardContent></Card>)}</div>
    <div className="grid gap-5 xl:grid-cols-2"><Card><CardHeader><CardTitle>Execution cadence</CardTitle></CardHeader><CardContent className="grid gap-3">{[["Daily", "Orders, fulfillment exceptions, collections, onboarding SLA and service health"], ["Weekly", "Agency performance, tenant activation, credit movement and team execution"], ["Monthly", "GMV, operating trends, portfolio risk, commercial outcomes and governance"]].map(([period, detail]) => <div className="rounded-xl border p-4" key={period}><p className="font-semibold">{period} summary</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>)}</CardContent></Card><Card><CardHeader><CardTitle>Reserved controls</CardTitle></CardHeader><CardContent className="grid gap-3">{["Manage global roles and privileged access", "Approve account limits and net terms", "Review cross-region performance and risks", "Suspend access and inspect immutable audit events"].map((text) => <div key={text} className="flex gap-3 rounded-xl bg-muted p-3 text-sm"><Shield className="size-4 shrink-0 text-primary" />{text}</div>)}</CardContent></Card></div>
  </div>;
}

function TenantsPreview() {
  return <div className="grid gap-5"><div><h2 className="text-xl font-bold">Tenant onboarding & accounts</h2><p className="mt-1 text-sm text-muted-foreground">Mandatory GSTIN, outlet address, requirement, and explicitly selected serving agency.</p></div><Card><CardContent className="overflow-x-auto p-0"><Table><THead><Tr><th>Business</th><th>GSTIN</th><th>Serving agency</th><th>Requirement</th><th>Commercial setup</th><th>Status</th></Tr></THead><TBody>{sampleTenants.map((tenant) => <Tr key={tenant.name}><td><strong>{tenant.name}</strong><br /><span className="text-[11px] text-muted-foreground">{tenant.type} · {tenant.city}</span></td><td>{tenant.gstin}</td><td>{tenant.agency}</td><td>{tenant.requirement}</td><td>{tenant.payment}</td><td><Badge tone={tenant.status === "Active" ? "success" : tenant.status === "Pending approval" ? "warning" : "danger"}>{tenant.status}</Badge></td></Tr>)}</TBody></Table></CardContent></Card><div className="rounded-xl border border-info/20 bg-info-soft p-4 text-sm text-info"><strong>Review boundary:</strong> contact numbers, full addresses, legal documents, and real credit exposure are deliberately hidden in this public review mode.</div></div>;
}

function TeamPreview() {
  return <div className="grid gap-5"><div><h2 className="text-xl font-bold">Team & role-based access</h2><p className="mt-1 text-sm text-muted-foreground">Platform team members receive explicit roles and scoped agency or regional access.</p></div><Card><CardContent className="overflow-x-auto p-0"><Table><THead><Tr><th>Role</th><th>Members</th><th>Scope</th><th>Access boundary</th></Tr></THead><TBody>{sampleRoles.map((role) => <Tr key={role.role}><td><strong>{role.role}</strong></td><td>{role.members}</td><td><Badge tone={role.scope === "Global" ? "primary" : "info"}>{role.scope}</Badge></td><td>{role.permissions}</td></Tr>)}</TBody></Table></CardContent></Card><Card><CardContent className="flex gap-3 p-5"><LockKeyhole className="size-5 shrink-0 text-primary" /><div><p className="font-semibold">Maker–checker control</p><p className="mt-1 text-sm text-muted-foreground">Onboarding executives create and submit tenant registrations. A separately authorized Platform Admin approves them; all decisions are audited.</p></div></CardContent></Card></div>;
}

export default function ControlReviewPage() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [period, setPeriod] = useState<DashboardPeriod>("daily");
  const data = useMemo(() => sampleDashboard(period), [period]);
  return <main className="min-h-screen bg-muted/40">
    <div className="border-b border-info/20 bg-info-soft"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-5 py-2 text-xs text-info lg:px-8"><span className="flex items-center gap-2 font-semibold"><Eye className="size-4" />Team review mode · fictional sample data · read only</span><Link href="/review/operations" className="font-semibold">View Agency Operations →</Link></div></div>
    <header className="border-b bg-card"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-navy text-background"><Building2 /></span><div><h1 className="font-bold">Platform Control</h1><p className="text-xs text-muted-foreground">Commercial LPG administration</p></div></div><div className="flex items-center gap-2"><Badge tone="primary">Super Admin preview</Badge><Link href="/control/login" className={buttonVariants({ size: "sm", variant: "outline" })}><LockKeyhole />Secure login</Link></div></div></header>
    <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8"><aside><nav className="grid gap-1 rounded-2xl border bg-card p-2">{nav.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${tab === item.id ? "bg-primary text-white" : "hover:bg-muted"}`}><item.icon className="size-4" />{item.label}</button>)}</nav><div className="mt-4 rounded-2xl border bg-card p-4"><p className="flex items-center gap-2 text-xs font-semibold"><Shield className="size-4" />Production boundary</p><p className="mt-2 text-xs leading-5 text-muted-foreground">No production API is called from this preview. Real data and all write actions remain behind OTP, MFA, and RBAC.</p></div></aside><section className="min-w-0">{tab === "dashboard" ? <DashboardPanel data={data} period={period} loading={false} onPeriod={setPeriod} onRefresh={() => undefined} /> : null}{tab === "super" ? <SuperAdminPreview /> : null}{tab === "tenants" ? <TenantsPreview /> : null}{tab === "team" ? <TeamPreview /> : null}</section></div>
  </main>;
}
