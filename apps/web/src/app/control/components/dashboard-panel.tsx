"use client";

import { Activity, ArrowDownRight, ArrowUpRight, Banknote, CheckCircle2, Clock3, Headphones, PackageCheck, RefreshCw, ShieldCheck, Truck } from "lucide-react";
import { DonutChart } from "@/components/charts";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Table, TBody, THead, Tr } from "@/components/ui";
import type { AdminDashboard, DashboardPeriod } from "@/lib/control-api";

function money(value: string | number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
}

function count(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function delta(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

function Change({ current, previous }: { current: number; previous: number }) {
  const value = delta(current, previous);
  if (value === null) return <span className="text-[11px] text-muted-foreground">New in this period</span>;
  const up = value >= 0;
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${up ? "text-success" : "text-danger"}`}>{up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(value).toFixed(1)}% vs previous</span>;
}

function Kpi({ label, value, current, previous, icon: Icon }: { label: string; value: string; current: number; previous: number; icon: typeof Banknote }) {
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p><p className="mt-2"><Change current={current} previous={previous} /></p></div><span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon /></span></div></CardContent></Card>;
}

function Risk({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return <div className={`rounded-xl border p-4 ${danger && value ? "border-danger/25 bg-danger-soft/45" : "bg-muted/40"}`}><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-bold ${danger && value ? "text-danger" : ""}`}>{count(value)}</p></div>;
}

export function DashboardPanel({ data, period, loading, onPeriod, onRefresh }: { data: AdminDashboard | null; period: DashboardPeriod; loading: boolean; onPeriod: (period: DashboardPeriod) => void; onRefresh: () => void }) {
  if (!data) return <Card><CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">No reporting data is available for this scope.</CardContent></Card>;
  const current = data.performance.current;
  const previous = data.performance.previous;
  const orderStateData = data.orderStates.map((item) => ({ name: item.status.replaceAll("_", " "), qty: item.count }));
  const scopeLabel = data.scope.global ? "Global platform" : [data.scope.regions.length ? `${data.scope.regions.length} region${data.scope.regions.length === 1 ? "" : "s"}` : "", data.scope.cities.length ? `${data.scope.cities.length} cit${data.scope.cities.length === 1 ? "y" : "ies"}` : "", data.scope.agencyCount ? `${data.scope.agencyCount} agenc${data.scope.agencyCount === 1 ? "y" : "ies"}` : "", data.scope.tenantCount ? `${data.scope.tenantCount} tenant${data.scope.tenantCount === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");

  return <div className="grid gap-5">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="text-xl font-bold">{data.audience === "super_admin" ? "Executive command centre" : "Operations dashboard"}</h2><Badge tone={data.scope.global ? "primary" : "info"}>{scopeLabel || "Assigned scope"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Daily, weekly, and monthly performance in {data.timezone}</p></div><div className="flex flex-wrap gap-2">{(["daily", "weekly", "monthly"] as DashboardPeriod[]).map((value) => <Button key={value} size="sm" variant={period === value ? "default" : "outline"} onClick={() => onPeriod(value)}>{value[0]!.toUpperCase() + value.slice(1)}</Button>)}<Button size="sm" variant="ghost" loading={loading} onClick={onRefresh}><RefreshCw />Refresh</Button></div></div>

    <div className={`grid gap-3 sm:grid-cols-2 ${data.revenue ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
      <Kpi label={`${data.periodLabel} GMV`} value={money(current.gmv)} current={Number(current.gmv)} previous={Number(previous.gmv)} icon={Banknote} />
      <Kpi label="Orders" value={count(current.orders)} current={current.orders} previous={previous.orders} icon={PackageCheck} />
      <Kpi label="Cylinders" value={count(current.cylinders)} current={current.cylinders} previous={previous.cylinders} icon={Truck} />
      <Kpi label="Delivered" value={count(current.delivered)} current={current.delivered} previous={previous.delivered} icon={CheckCircle2} />
      <Kpi label="Collections" value={money(current.collections)} current={Number(current.collections)} previous={Number(previous.collections)} icon={Banknote} />
      {data.revenue ? <Kpi label="Platform revenue" value={money(data.revenue.current)} current={Number(data.revenue.current)} previous={Number(data.revenue.previous)} icon={Activity} /> : null}
    </div>

    <div className={`grid gap-5 ${data.revenue ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
      {data.revenue ? <Card><CardHeader><div><CardTitle>Revenue mix</CardTitle><p className="mt-1 text-xs text-muted-foreground">Posted ledger entries only · Super Admin</p></div></CardHeader><CardContent className="grid gap-2">{data.revenue.mix.length ? data.revenue.mix.map((item) => <div key={item.type} className="flex items-center justify-between border-b py-2 text-sm last:border-0"><span className="capitalize text-muted-foreground">{item.type.replaceAll("_", " ")}</span><strong>{money(item.current)}</strong></div>) : <p className="py-8 text-center text-sm text-muted-foreground">No revenue entries posted in this period.</p>}</CardContent></Card> : null}
      <Card><CardHeader><div><div className="flex items-center gap-2"><Headphones className="size-4 text-primary" /><CardTitle>Support operations</CardTitle></div><p className="mt-1 text-xs text-muted-foreground">Cases and first-response SLA in your scope</p></div></CardHeader><CardContent className="grid grid-cols-2 gap-3"><Risk label="Open cases" value={data.support.openCases} /><Risk label="Critical open" value={data.support.criticalOpen} danger /><Risk label="Response SLA breaches" value={data.support.responseSlaBreaches} danger /><Risk label={`Resolved · ${data.periodLabel.toLowerCase()}`} value={data.support.resolved} /><div className="col-span-2 rounded-xl bg-muted p-3 text-sm"><span className="text-muted-foreground">Median resolution</span><strong className="float-right">{data.support.medianResolutionMinutes === null ? "No resolved cases" : `${Math.round(data.support.medianResolutionMinutes)} min`}</strong></div></CardContent></Card>
      <Card><CardHeader><div><div className="flex items-center justify-between gap-2"><CardTitle>Run-rate projection</CardTitle><Badge tone={data.projection.confidence === "high" ? "success" : data.projection.confidence === "medium" ? "warning" : "muted"}>{data.projection.confidence} confidence</Badge></div><p className="mt-1 text-xs text-muted-foreground">Projection—not actual · based on {data.projection.elapsedPercent}% of the period</p></div></CardHeader><CardContent>{data.projection.sufficientHistory ? <div className="grid gap-3"><div className="rounded-xl bg-muted p-3"><p className="text-[11px] text-muted-foreground">Projected orders</p><strong className="text-xl">{count(data.projection.orders ?? 0)}</strong></div><div className="rounded-xl bg-muted p-3"><p className="text-[11px] text-muted-foreground">Projected GMV</p><strong className="text-xl">{money(data.projection.gmv ?? 0)}</strong></div>{data.projection.revenue !== null ? <div className="rounded-xl bg-muted p-3"><p className="text-[11px] text-muted-foreground">Projected platform revenue</p><strong className="text-xl">{money(data.projection.revenue)}</strong></div> : null}</div> : <p className="py-10 text-center text-sm text-muted-foreground">Projection starts after 10% of the reporting period has elapsed.</p>}</CardContent></Card>
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Card><CardHeader><div><CardTitle>Onboarding funnel</CardTitle><p className="mt-1 text-xs text-muted-foreground">Current queue plus outcomes during {data.periodLabel.toLowerCase()}</p></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-4"><Risk label="Drafts / returned" value={data.onboarding.drafts} /><Risk label="Pending approval" value={data.onboarding.pendingApprovals} danger /><Risk label="Approved" value={data.onboarding.approvals} /><Risk label="Rejected" value={data.onboarding.rejections} /></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-muted p-3"><p className="text-[11px] text-muted-foreground">Invitations queued</p><strong>{count(data.onboarding.invitations)}</strong></div><div className="rounded-xl bg-muted p-3"><p className="text-[11px] text-muted-foreground">First logins</p><strong>{count(data.onboarding.firstLogins)}</strong></div><div className="rounded-xl bg-muted p-3"><p className="text-[11px] text-muted-foreground">First orders</p><strong>{count(data.onboarding.firstOrders)}</strong></div></div></CardContent></Card>
      <Card><CardHeader><div><CardTitle>Order state mix</CardTitle><p className="mt-1 text-xs text-muted-foreground">{count(data.orderStates.reduce((sum, item) => sum + item.count, 0))} orders in period</p></div></CardHeader><CardContent>{orderStateData.length ? <DonutChart data={orderStateData} height={180} /> : <p className="py-14 text-center text-sm text-muted-foreground">No orders in this period.</p>}</CardContent></Card>
    </div>

    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Card><CardHeader><div><CardTitle>Agency performance</CardTitle><p className="mt-1 text-xs text-muted-foreground">Volume, backlog, failures, acceptance speed, and stock risk</p></div></CardHeader><CardContent className="px-0 pb-0"><Table><THead><Tr><th>Agency</th><th>Orders</th><th>GMV</th><th>Backlog</th><th>Failures</th><th>Median accept</th><th>Low stock</th></Tr></THead><TBody>{data.agencies.map((agency) => <Tr key={agency.publicId}><td><strong>{agency.displayName}</strong><br /><span className="text-[11px] text-muted-foreground">{agency.city}</span></td><td>{count(agency.orders)}</td><td>{money(agency.gmv)}</td><td>{agency.backlog ? <Badge tone="warning">{agency.backlog}</Badge> : "0"}</td><td>{agency.failures ? <Badge tone="danger">{agency.failures}</Badge> : "0"}</td><td>{agency.medianAcceptanceMinutes === null ? "—" : `${Math.round(agency.medianAcceptanceMinutes)} min`}</td><td>{agency.lowStockItems ? <Badge tone="danger">{agency.lowStockItems}</Badge> : <Badge tone="success">Clear</Badge>}</td></Tr>)}</TBody></Table></CardContent></Card>
      <Card><CardHeader><div><CardTitle>Credit book</CardTitle><p className="mt-1 text-xs text-muted-foreground">Approved limits, exposure, and aging</p></div></CardHeader><CardContent className="grid gap-3"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted p-3"><p className="text-[11px] text-muted-foreground">Approved limit</p><strong>{money(data.credit.approvedLimit)}</strong></div><div className="rounded-xl bg-muted p-3"><p className="text-[11px] text-muted-foreground">Outstanding</p><strong>{money(data.credit.outstanding)}</strong></div></div>{[{ label: "Not due", value: data.credit.aging.current }, { label: "1–30 days", value: data.credit.aging.days_1_30 }, { label: "31–60 days", value: data.credit.aging.days_31_60 }, { label: "61–90 days", value: data.credit.aging.days_61_90 }, { label: "90+ days", value: data.credit.aging.days_90_plus }].map((bucket) => <div key={bucket.label} className="flex items-center justify-between border-b py-2 text-sm last:border-0"><span className="text-muted-foreground">{bucket.label}</span><strong className={bucket.label === "90+ days" && Number(bucket.value) ? "text-danger" : ""}>{money(bucket.value)}</strong></div>)}</CardContent></Card>
    </div>

    <Card><CardHeader><div><CardTitle>Requires attention</CardTitle><p className="mt-1 text-xs text-muted-foreground">Operational exceptions that need a review—not automatic execution</p></div></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Risk label="Approval SLA breaches" value={data.attention.approvalSlaBreaches} danger /><Risk label="Low-stock agencies" value={data.attention.lowStockAgencies} danger /><Risk label="Overdue accounts" value={data.attention.overdueAccounts} danger /><Risk label="Delivery failures" value={data.attention.deliveryFailures} danger /><Risk label="Messaging failures" value={data.attention.messagingFailures} danger /></CardContent></Card>

    {data.systemHealth ? <Card><CardHeader><div><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-primary" /><CardTitle>Platform operations</CardTitle></div><p className="mt-1 text-xs text-muted-foreground">Super Admin-only service and access indicators</p></div></CardHeader><CardContent className="grid gap-3 sm:grid-cols-4"><Risk label="Queued background jobs" value={data.systemHealth.queuedJobs} /><Risk label="Failed background jobs" value={data.systemHealth.failedJobs} danger /><Risk label="Active sessions" value={data.systemHealth.activeSessions} /><Risk label="Suspended users" value={data.systemHealth.suspendedUsers} /></CardContent></Card> : null}

    {data.recentActivity.length ? <Card><CardHeader><div><CardTitle>Privileged activity</CardTitle><p className="mt-1 text-xs text-muted-foreground">Latest immutable audit events visible in your scope</p></div></CardHeader><CardContent className="grid gap-2">{data.recentActivity.map((event) => <div key={event.publicId} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-semibold">{event.action.replaceAll("_", " ").replaceAll(".", " · ")}</p><p className="mt-1 text-xs text-muted-foreground">{event.actorName ?? "System"}{event.reason ? ` · ${event.reason}` : ""}</p></div><span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Clock3 className="size-3" />{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: data.timezone }).format(new Date(event.occurredAt))}</span></div>)}</CardContent></Card> : null}

    <div className="rounded-xl border bg-muted/35 p-4 text-xs text-muted-foreground"><strong className="text-foreground">Data basis:</strong> operational, support, and permitted revenue figures are source-backed actuals. Run-rate values are labelled estimates and never replace actuals. Revenue is {data.dataCoverage.platformRevenue.status === "available" ? "visible from the append-only ledger" : "restricted to Super Admin"}. Refreshed {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: data.timezone }).format(new Date(data.dataCoverage.generatedAt))}.</div>
  </div>;
}
