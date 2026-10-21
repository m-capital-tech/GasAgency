"use client";

import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  Boxes,
  CircleDollarSign,
  Clock3,
  Flame,
  Gauge,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  RefreshCw,
  Route,
  Truck,
  Users,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DonutChart, MoneyBarChart, OrdersAreaChart } from "@/components/charts";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, NativeSelect } from "@/components/ui";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  OperationsApiError,
  operationsApi,
  type OperationsAgency,
  type OperationsDashboard,
  type OperationsDashboardPeriod,
  type OperationsSession,
} from "@/lib/operations-api";

function money(value: string | number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value));
}

function count(value: number) {
  return new Intl.NumberFormat("en-IN").format(value);
}

function change(current: number, previous: number) {
  if (!previous) return current ? null : 0;
  return ((current - previous) / previous) * 100;
}

function Change({ current, previous }: { current: number; previous: number }) {
  const value = change(current, previous);
  if (value === null) return <span className="text-[11px] text-muted-foreground">New in this period</span>;
  const positive = value >= 0;
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${positive ? "text-success" : "text-danger"}`}>{positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{Math.abs(value).toFixed(1)}% vs previous</span>;
}

function Metric({ label, value, current, previous, note, icon: Icon }: { label: string; value: string; current: number; previous: number; note?: string; icon: typeof Banknote }) {
  return <Card><CardContent className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold tabular-nums">{value}</p><p className="mt-2">{note ? <span className="text-[11px] text-muted-foreground">{note}</span> : <Change current={current} previous={previous} />}</p></div><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon className="size-5" /></span></div></CardContent></Card>;
}

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : "The operations dashboard could not be loaded.";
}

const statusLabels: Record<string, string> = {
  placed: "Awaiting acceptance",
  accepted: "Accepted",
  assigned: "Assigned",
  out_for_delivery: "Out for delivery",
  delivery_failed: "Delivery failed",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

export default function OperationsDashboardPage() {
  const router = useRouter();
  const [session, setSession] = useState<OperationsSession | null>(null);
  const [agency, setAgency] = useState<OperationsAgency | null>(null);
  const [period, setPeriod] = useState<OperationsDashboardPeriod>("daily");
  const [dashboard, setDashboard] = useState<OperationsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = useCallback(async (target: OperationsAgency, selectedPeriod: OperationsDashboardPeriod, quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const result = await operationsApi.dashboard(target.publicId, selectedPeriod);
      setAgency(target);
      setDashboard(result);
    } catch (cause) {
      if (cause instanceof OperationsApiError && cause.status === 401) { router.replace("/operations/login"); return; }
      setError(errorMessage(cause));
    } finally { setLoading(false); setRefreshing(false); }
  }, [router]);

  useEffect(() => {
    let active = true;
    operationsApi.session().then((result) => {
      if (!active) return;
      if (!result.agencies.length) throw new Error("This account has no authorized agency operations scope.");
      setSession(result);
      return loadDashboard(result.agencies[0]!, "daily");
    }).catch((cause) => {
      if (!active) return;
      if (cause instanceof OperationsApiError && cause.status === 401) router.replace("/operations/login");
      else { setError(errorMessage(cause)); setLoading(false); }
    });
    return () => { active = false; };
  }, [loadDashboard, router]);

  const selectPeriod = (next: OperationsDashboardPeriod) => {
    setPeriod(next);
    if (agency) void loadDashboard(agency, next);
  };

  const trend = useMemo(() => dashboard?.trend.map((point) => ({
    label: new Intl.DateTimeFormat("en-IN", dashboard.period === "daily" ? { hour: "numeric", timeZone: dashboard.timezone } : { day: "numeric", month: "short", timeZone: dashboard.timezone }).format(new Date(point.bucketStart)),
    orders: point.orders,
    delivered: point.delivered,
    gmv: Number(point.gmv),
  })) ?? [], [dashboard]);

  const orderMix = useMemo(() => dashboard?.orderStates.map((item) => ({ name: statusLabels[item.status] ?? item.status.replaceAll("_", " "), qty: item.count })) ?? [], [dashboard]);

  const logout = async () => { try { await operationsApi.logout(); } finally { router.replace("/operations/login"); } };

  if (loading && !dashboard) return <main className="flex min-h-screen items-center justify-center bg-muted/40"><RefreshCw className="size-7 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">Loading operations command centre…</span></main>;

  const current = dashboard?.performance.current;
  const previous = dashboard?.performance.previous;

  return <main className="min-h-screen bg-muted/40">
    <header className="border-b bg-card"><div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8"><div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white"><Flame className="size-5" /></span><div><h1 className="font-bold">Commercial LPG Operations</h1><p className="text-xs text-muted-foreground">Agency operations command centre</p></div></div><div className="flex flex-wrap items-center gap-2"><Link href="/operations/dashboard" className={cn(buttonVariants({ size: "sm" }))}><LayoutDashboard />Dashboard</Link><Link href="/operations/orders" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}><PackageCheck />Orders</Link><Link href="/operations/accounts" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}><WalletCards />Accounts</Link>{agency?.roleTypes.includes("agency_owner") ? <Link href="/operations/administration" className={cn(buttonVariants({ size: "sm", variant: "outline" }))}><Users />Admin</Link> : null}{session && session.agencies.length > 1 ? <NativeSelect aria-label="Serving agency" className="w-56" value={agency?.publicId ?? ""} onChange={(event) => { const next = session.agencies.find((item) => item.publicId === event.target.value); if (next) void loadDashboard(next, period); }}>{session.agencies.map((item) => <option key={item.publicId} value={item.publicId}>{item.displayName}</option>)}</NativeSelect> : <Badge tone="primary">{agency?.displayName ?? "Agency"}</Badge>}<Button size="sm" variant="outline" loading={refreshing} disabled={!agency} onClick={() => agency && void loadDashboard(agency, period, true)}><RefreshCw />Refresh</Button><Button size="sm" variant="ghost" onClick={() => void logout()}><LogOut />Sign out</Button></div></div></header>

    <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:px-8">
      {error ? <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger"><span>{error}</span><button className="font-semibold" onClick={() => setError(null)}>Dismiss</button></div> : null}
      {dashboard && current && previous ? <>
        <section className="flex flex-wrap items-end justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{dashboard.agency.displayName}</h2><Badge tone="info">{dashboard.agency.city}</Badge><Badge tone={dashboard.agency.creditEnabled ? "success" : "warning"}>Credit {dashboard.agency.creditEnabled ? "enabled" : "paused"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{dashboard.periodLabel} compared with the previous equivalent period · {dashboard.timezone}</p></div><div className="flex gap-2">{(["daily", "weekly", "monthly"] as OperationsDashboardPeriod[]).map((value) => <Button key={value} size="sm" variant={period === value ? "default" : "outline"} onClick={() => selectPeriod(value)}>{value[0]!.toUpperCase() + value.slice(1)}</Button>)}</div></section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Orders booked" value={count(current.orders)} current={current.orders} previous={previous.orders} icon={PackageCheck} />
          <Metric label="Booked value" value={money(current.gmv)} current={Number(current.gmv)} previous={Number(previous.gmv)} icon={Banknote} />
          <Metric label="Cylinders ordered" value={count(current.cylinders)} current={current.cylinders} previous={previous.cylinders} icon={Boxes} />
          <Metric label="Delivered" value={count(current.delivered)} current={current.delivered} previous={previous.delivered} icon={Truck} />
          <Metric label="Collections" value={money(current.collections)} current={Number(current.collections)} previous={Number(previous.collections)} icon={CircleDollarSign} />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]">
          <Card><CardHeader><div><CardTitle>Order flow</CardTitle><p className="mt-1 text-xs text-muted-foreground">Orders booked and deliveries completed during the selected period</p></div></CardHeader><CardContent>{trend.length ? <OrdersAreaChart data={trend} height={245} keys={[{ key: "orders", name: "Orders booked", color: "#A31E21" }, { key: "delivered", name: "Delivered", color: "#2E7D4F" }]} /> : <p className="py-20 text-center text-sm text-muted-foreground">No order activity in this period.</p>}</CardContent></Card>
          <Card><CardHeader><div><CardTitle>Current-period order mix</CardTitle><p className="mt-1 text-xs text-muted-foreground">State of orders booked in {dashboard.periodLabel.toLowerCase()}</p></div></CardHeader><CardContent>{orderMix.length ? <DonutChart data={orderMix} height={190} /> : <p className="py-16 text-center text-sm text-muted-foreground">No orders in this period.</p>}</CardContent></Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <Card><CardHeader><div><CardTitle>Booked value trend</CardTitle><p className="mt-1 text-xs text-muted-foreground">Server-priced order value; not a settlement or revenue measure</p></div></CardHeader><CardContent>{trend.length ? <MoneyBarChart data={trend} dataKey="gmv" name="Booked value" height={220} /> : <p className="py-16 text-center text-sm text-muted-foreground">No booked value in this period.</p>}</CardContent></Card>
          <Card><CardHeader><div><CardTitle>Fulfilment control</CardTitle><p className="mt-1 text-xs text-muted-foreground">Live queue and service-time indicators</p></div><Route className="size-5 text-primary" /></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">Active fulfilment</p><p className="mt-1 text-2xl font-bold">{count(dashboard.fulfillment.active)}</p></div><div className={`rounded-xl p-4 ${dashboard.fulfillment.awaitingAcceptance ? "bg-warning-soft" : "bg-muted"}`}><p className="text-xs text-muted-foreground">Awaiting acceptance</p><p className="mt-1 text-2xl font-bold">{count(dashboard.fulfillment.awaitingAcceptance)}</p></div><div className={`rounded-xl p-4 ${dashboard.fulfillment.awaitingAssignment ? "bg-warning-soft" : "bg-muted"}`}><p className="text-xs text-muted-foreground">Awaiting assignment</p><p className="mt-1 text-2xl font-bold">{count(dashboard.fulfillment.awaitingAssignment)}</p></div><div className={`rounded-xl p-4 ${dashboard.fulfillment.deliveryFailures ? "bg-danger-soft" : "bg-muted"}`}><p className="text-xs text-muted-foreground">Failed deliveries</p><p className="mt-1 text-2xl font-bold">{count(dashboard.fulfillment.deliveryFailures)}</p></div><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">Median acceptance</p><p className="mt-1 text-lg font-bold">{dashboard.fulfillment.medianAcceptanceMinutes === null ? "—" : `${Math.round(dashboard.fulfillment.medianAcceptanceMinutes)} min`}</p></div><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">Median delivery</p><p className="mt-1 text-lg font-bold">{dashboard.fulfillment.medianDeliveryMinutes === null ? "—" : `${Math.round(dashboard.fulfillment.medianDeliveryMinutes)} min`}</p></div></CardContent></Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
          <Card><CardHeader><div><CardTitle>Action queue</CardTitle><p className="mt-1 text-xs text-muted-foreground">Live exceptions requiring an operational or collection follow-up</p></div><Badge tone={dashboard.exceptions.length ? "danger" : "success"}>{dashboard.exceptions.length ? `${dashboard.exceptions.length} open` : "Clear"}</Badge></CardHeader><CardContent className="grid gap-2">{dashboard.exceptions.length ? dashboard.exceptions.map((item) => <Link key={`${item.kind}:${item.publicId}`} href={item.kind === "overdue_account" ? "/operations/accounts" : "/operations/orders"} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/60 ${item.severity === "critical" ? "border-danger/25" : "border-warning/30"}`}><div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${item.severity === "critical" ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}><AlertTriangle className="size-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p></div></div>{item.amount ? <strong className="text-sm">{money(item.amount)}</strong> : null}</Link>) : <div className="rounded-xl bg-success-soft p-6 text-center text-sm text-success">No current delivery, acceptance, stock or overdue-account exceptions.</div>}</CardContent></Card>

          <div className="grid gap-5">
            <Card><CardHeader><div><CardTitle>Inventory custody</CardTitle><p className="mt-1 text-xs text-muted-foreground">Current full, reserved, empty and account-held cylinders</p></div><Boxes className="size-5 text-primary" /></CardHeader><CardContent><div className="grid grid-cols-2 gap-3 sm:grid-cols-5"><div><p className="text-xs text-muted-foreground">Available</p><p className="mt-1 text-xl font-bold">{count(dashboard.inventory.availableFull)}</p></div><div><p className="text-xs text-muted-foreground">Reserved</p><p className="mt-1 text-xl font-bold">{count(dashboard.inventory.reservedFull)}</p></div><div><p className="text-xs text-muted-foreground">Full stock</p><p className="mt-1 text-xl font-bold">{count(dashboard.inventory.fullOnHand)}</p></div><div><p className="text-xs text-muted-foreground">Empties</p><p className="mt-1 text-xl font-bold">{count(dashboard.inventory.emptyOnHand)}</p></div><div><p className="text-xs text-muted-foreground">With accounts</p><p className="mt-1 text-xl font-bold">{count(dashboard.inventory.withAccounts)}</p></div></div><div className="mt-4 grid gap-2">{dashboard.inventory.items.map((item) => <div key={item.publicId} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs"><span>{item.displayName}</span><span className={item.availableFull <= item.lowStockThreshold ? "font-bold text-danger" : "font-semibold"}>{item.availableFull} available · threshold {item.lowStockThreshold}</span></div>)}</div></CardContent></Card>
            <Card><CardHeader><div><CardTitle>Delivery capacity</CardTitle><p className="mt-1 text-xs text-muted-foreground">Named delivery staff and current assignment coverage</p></div><Users className="size-5 text-primary" /></CardHeader><CardContent className="grid grid-cols-3 gap-3"><div><p className="text-xs text-muted-foreground">Active staff</p><p className="mt-1 text-xl font-bold">{dashboard.staff.active}</p></div><div><p className="text-xs text-muted-foreground">On active drops</p><p className="mt-1 text-xl font-bold">{dashboard.staff.withActiveDrops}</p></div><div><p className="text-xs text-muted-foreground">Available now</p><p className="mt-1 text-xl font-bold">{Math.max(0, dashboard.staff.active - dashboard.staff.withActiveDrops)}</p></div></CardContent></Card>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
          <Card><CardHeader><div><CardTitle>Commercial accounts</CardTitle><p className="mt-1 text-xs text-muted-foreground">Receivables and platform-approved credit exposure</p></div><WalletCards className="size-5 text-primary" /></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">Accounts</p><p className="mt-1 text-2xl font-bold">{dashboard.accounts.total}</p><p className="text-[11px] text-muted-foreground">{dashboard.accounts.credit} credit-enabled accounts</p></div><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">Approved limits</p><p className="mt-1 text-2xl font-bold">{money(dashboard.accounts.approvedCreditLimit)}</p></div><div className="rounded-xl bg-muted p-4"><p className="text-xs text-muted-foreground">Outstanding</p><p className="mt-1 text-2xl font-bold">{money(dashboard.accounts.outstanding)}</p><p className="text-[11px] text-muted-foreground">{dashboard.accounts.openInvoices} open invoices</p></div><div className={`rounded-xl p-4 ${Number(dashboard.accounts.overdue) ? "bg-danger-soft" : "bg-muted"}`}><p className="text-xs text-muted-foreground">Overdue</p><p className={`mt-1 text-2xl font-bold ${Number(dashboard.accounts.overdue) ? "text-danger" : ""}`}>{money(dashboard.accounts.overdue)}</p></div></CardContent></Card>
          <Card><CardHeader><div><CardTitle>Recent fulfilment activity</CardTitle><p className="mt-1 text-xs text-muted-foreground">Latest audited order-state transitions for this agency</p></div><Clock3 className="size-5 text-primary" /></CardHeader><CardContent className="grid gap-2">{dashboard.recentActivity.length ? dashboard.recentActivity.map((event) => <div key={event.publicId} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-semibold">{event.orderNumber} · {statusLabels[event.toStatus] ?? event.toStatus.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{event.reason ?? "Status updated"} · {event.actorName ?? "System"}</p></div><span className="text-[11px] text-muted-foreground">{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: dashboard.timezone }).format(new Date(event.occurredAt))}</span></div>) : <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">No fulfilment activity has been recorded.</p>}</CardContent></Card>
        </section>

        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Gauge className="size-4" />Transactional source: orders, inventory, commercial accounts, invoices and agency-recorded collections. Values refresh on request and do not estimate settlement revenue.</p>
      </> : <Card><CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">No operational reporting data is available for this agency.</CardContent></Card>}
    </div>
  </main>;
}
