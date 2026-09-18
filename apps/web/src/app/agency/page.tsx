"use client";
import { AlertTriangle, Banknote, CheckCircle2, Clock, Flame, IndianRupee, Package, Truck, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { DonutChart, MoneyBarChart, OrdersAreaChart } from "@/components/charts";
import { Map } from "@/components/map/Map";
import { PageHeader } from "@/components/shell/Shell";
import { Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, ErrorState, Kpi, StatusBadge, Tabs, TabsList, TabsTrigger } from "@/components/ui";
import { useDashboard, type ExpandedStaff } from "@/features/hooks";
import { useSession } from "@/lib/session";
import { formatCompactINR, formatINR, relativeTime } from "@/lib/format";
import { BUSINESS_TYPE_LABELS } from "@gassetu/shared";

/** A2 — Dashboard */
export default function AgencyDashboard() {
  const d = useDashboard();
  const user = useSession((s) => s.user);
  const [range, setRange] = useState<"7" | "30">("7");
  if (d.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
    );
  }
  if (d.isError || !d.data) return <ErrorState message={(d.error as Error)?.message} onRetry={() => d.refetch()} />;
  const { kpis, agency } = d.data;
  const staff: ExpandedStaff[] = d.data.staff;
  const series = range === "7" ? d.data.series7 : d.data.series30;
  return (
    <>
      <PageHeader title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}, ${(user?.name ?? agency.name).split(" ")[0]}`} subtitle={`${agency.name} · ${agency.omc} · ${agency.area}`}>
        {d.data.lowStock.length ? (
          <Link href="/agency/inventory" className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-[#9c7328] dark:text-warning">
            <AlertTriangle className="size-4" /> Low stock: {d.data.lowStock.map((l: any) => l.name).join(", ")}
          </Link>
        ) : null}
      </PageHeader>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Today's orders" value={kpis.todayOrders} icon={Package} tone="info" sub={`${kpis.todayCylinders} cylinders · ${kpis.failedToday} failed`} />
        <Kpi label="Pending" value={kpis.pending} icon={Clock} tone="warning" sub="awaiting accept" />
        <Kpi label="Out for delivery" value={kpis.outForDelivery} icon={Truck} tone="primary" sub={`${kpis.accepted} accepted/assigned`} />
        <Kpi label="Revenue today" value={formatCompactINR(kpis.revenueToday)} icon={IndianRupee} tone="warning" sub={`${formatCompactINR(kpis.revenue30)} last 30 days`} />
        <Kpi label="Receivables" value={formatCompactINR(kpis.receivables)} icon={Banknote} tone={kpis.overdue ? "danger" : "warning"} sub={kpis.overdue ? `${formatCompactINR(kpis.overdue)} overdue` : `${kpis.creditAccounts} credit accounts`} />
        <Kpi label="Accounts" value={kpis.accounts} icon={CheckCircle2} tone="success" sub={`${d.data.lowStockAccounts.length} running low`} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Cylinders per day</CardTitle>
              <CardDescription>Cylinders ordered and order count</CardDescription>
            </div>
            <Tabs value={range} onValueChange={(v) => setRange(v as any)}>
              <TabsList className="h-8">
                <TabsTrigger value="7" className="h-6 text-xs">7 days</TabsTrigger>
                <TabsTrigger value="30" className="h-6 text-xs">30 days</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <OrdersAreaChart data={series} keys={[{ key: "cylinders", name: "Cylinders", color: "#A31E21" }, { key: "orders", name: "Orders", color: "#C6953F" }]} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Cylinder mix</CardTitle>
              <CardDescription>Units booked, last 30 days</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <DonutChart data={d.data.cylinderMix} height={150} />
            <p className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Accounts by segment</p>
            <ul className="space-y-1 text-xs">
              {d.data.segments.slice(0, 5).map((s: any) => (
                <li key={s.type} className="flex justify-between">
                  <span className="text-muted-foreground">{BUSINESS_TYPE_LABELS[s.type as keyof typeof BUSINESS_TYPE_LABELS]}</span>
                  <span className="font-semibold tabular-nums">{s.count}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Revenue per day</CardTitle>
              <CardDescription>Delivered order value</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <MoneyBarChart data={series} />
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardHeader>
            <div>
              <CardTitle>Staff on the road</CardTitle>
              <CardDescription>{staff.filter((s) => s.online).length} online · {staff.filter((s) => s.activeBookingId).length} delivering</CardDescription>
            </div>
            <Link href="/agency/tracking" className="text-xs font-semibold text-primary">
              Open map →
            </Link>
          </CardHeader>
          <CardContent className="flex-1">
            <Map height={200} pins={[{ id: "ag", lat: agency.serviceArea.center.lat, lng: agency.serviceArea.center.lng, kind: "agency", label: agency.name }, ...staff.filter((s) => s.online).map((s) => ({ id: s.id, lat: s.currentLocation.lat, lng: s.currentLocation.lng, kind: s.activeBookingId ? ("staff" as const) : ("staff-idle" as const), label: s.name, sub: s.activeBookingId ? "Delivering" : "Idle" }))]} />
          </CardContent>
        </Card>
      </div>
      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Recent orders</CardTitle>
            <CardDescription>Latest activity across the board</CardDescription>
          </div>
          <Link href="/agency/orders" className="text-xs font-semibold text-primary">
            Open orders board →
          </Link>
        </CardHeader>
        <CardContent className="px-2">
          <ul className="divide-y">
            {d.data.recent.map((b: any) => (
              <li key={b.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <Link href={`/agency/orders?open=${b.id}`} className="w-24 font-semibold text-primary">
                  {b.code}
                </Link>
                <span className="flex-1 truncate">{b.businessName} <span className="text-xs text-muted-foreground">· {b.outlet.label}</span></span>
                <span className="hidden text-xs text-muted-foreground md:inline">{b.items.map((i: any) => `${i.qty} × ${i.name.split(" ")[0]}`).join(" + ")} · {b.payment.method === "credit" ? "credit" : b.payment.method}</span>
                <span className="w-20 text-right tabular-nums">{formatINR(b.charges.total, { decimals: false })}</span>
                <StatusBadge status={b.status} />
                <span className="w-16 text-right text-xs text-faint">{relativeTime(b.createdAt)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      {d.data.lowStockAccounts.length ? (
        <Card className="mt-4">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2"><Flame className="size-4 text-primary" /> Accounts running low</CardTitle>
              <CardDescription>Outlets with ≤ 2 days of LPG — nudge them from Business accounts</CardDescription>
            </div>
            <Link href="/agency/accounts" className="text-xs font-semibold text-primary">
              Open accounts →
            </Link>
          </CardHeader>
          <CardContent className="px-2">
            <ul className="divide-y">
              {d.data.lowStockAccounts.map((b: any) => (
                <li key={b.userId} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <span className="flex-1 font-medium">{b.name}</span>
                  <span className="text-xs text-muted-foreground">{b.outlets.filter((o: any) => o.lowStock).map((o: any) => `${o.label} · ${o.daysLeft}d`).join(", ")}</span>
                  <span className="text-xs text-muted-foreground">usual {b.usualOrder.map((i: any) => `${i.qty} × ${i.cylinderTypeId === "cyl_19" ? "19 kg" : "47.5 kg"}`).join(" + ")}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
      {kpis.failedToday ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <XCircle className="size-3.5 text-danger" /> {kpis.failedToday} failed delivery today — reschedule from the orders board.
        </p>
      ) : null}
    </>
  );
}
