"use client";
import { useQuery } from "@tanstack/react-query";
import { Building2, IndianRupee, MessageSquareWarning, Package, Users } from "lucide-react";
import { HBarList, MoneyBarChart, OrdersAreaChart } from "@/components/charts";
import { Map } from "@/components/map/Map";
import { PageHeader } from "@/components/shell/Shell";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, ErrorState, Kpi, OmcBadge } from "@/components/ui";
import { q } from "@/features/hooks";
import { formatCompactINR, formatINR, formatNumber } from "@/lib/format";

/** P1 — Overview */
export default function AdminOverview() {
  const o = useQuery(q.adminOverview());
  if (o.isLoading) return <div className="grid gap-3 md:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <CardSkeleton key={i} />)}</div>;
  if (o.isError || !o.data) return <ErrorState onRetry={() => o.refetch()} />;
  const d = o.data;
  const totalRev = d.revenueSplit.reduce((s: number, r: any) => s + r.amount, 0);
  return (
    <>
      <PageHeader title="Platform overview" subtitle="Hyderabad · last 90 days of seeded activity" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="GMV" value={formatCompactINR(d.kpis.gmv)} icon={IndianRupee} tone="warning" sub="delivered order value" />
        <Kpi label="Orders" value={formatNumber(d.kpis.orders)} icon={Package} tone="info" sub={`${d.kpis.ordersToday} today`} />
        <Kpi label="Active customers" value={d.kpis.activeCustomers} icon={Users} tone="primary" sub={`of ${d.kpis.totalCustomers} registered`} />
        <Kpi label="Active agencies" value={d.kpis.activeAgencies} icon={Building2} tone="muted" sub={`${d.kpis.pendingAgencies} pending approval`} />
        <Kpi label="Platform revenue" value={formatCompactINR(d.kpis.platformRevenue)} icon={IndianRupee} tone="warning" sub="commission + fees + SaaS" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Weekly orders & GMV</CardTitle>
              <CardDescription>13-week trend</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <OrdersAreaChart data={d.weekly} keys={[{ key: "orders", name: "Orders", color: "#A31E21" }]} height={200} />
            <MoneyBarChart data={d.weekly} dataKey="gmv" name="GMV" height={160} color="#C6953F" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Revenue by stream</CardTitle>
              <CardDescription>Business model (PRD §11) · {formatINR(totalRev, { decimals: false })} total</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <HBarList data={d.revenueSplit} nameKey="stream" valueKey="amount" money />
            <div className="mt-4 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
              <p>
                Commission <b>{d.config.commissionPct}%</b> of cylinder value on online orders · convenience fee <b>₹{d.config.convenienceFee}</b> · express fee <b>₹{d.config.expressFee}</b> split {d.config.expressAgencySharePct}/{100 - d.config.expressAgencySharePct} with agencies · SaaS plans ₹0 / ₹{d.config.plans.growth.monthlyFee} / ₹{d.config.plans.pro.monthlyFee}.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>City heatmap</CardTitle>
              <CardDescription>Agencies sized by 30-day orders</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <Map height={320} pins={d.cityHeat.map((a: any) => ({ id: a.id, lat: a.center.lat, lng: a.center.lng, kind: a.status === "approved" ? "agency" : "pending", label: a.name, sub: `${a.orders30} orders · ${formatCompactINR(a.gmv30)} · ${a.status}` }))} circles={d.cityHeat.filter((a: any) => a.status === "approved").map((a: any) => ({ lat: a.center.lat, lng: a.center.lng, radiusKm: Math.max(1.5, a.orders30 / 12) }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Agencies</CardTitle>
              <CardDescription>30-day performance</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-2">
            <ul className="divide-y text-sm">
              {[...d.cityHeat].sort((a: any, b: any) => b.orders30 - a.orders30).map((a: any) => (
                <li key={a.id} className="flex items-center gap-2 px-2 py-2">
                  <OmcBadge omc={a.omc} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{a.name}</p>
                    <p className="text-xs text-muted-foreground">{a.area} · ★ {a.rating || "—"}</p>
                  </div>
                  {a.status === "approved" ? (
                    <div className="text-right">
                      <p className="font-semibold tabular-nums">{a.orders30}</p>
                      <p className="text-xs text-muted-foreground">{formatCompactINR(a.gmv30)}</p>
                    </div>
                  ) : (
                    <Badge tone="warning">pending</Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      {d.kpis.openComplaints ? (
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <MessageSquareWarning className="size-3.5 text-danger" /> {d.kpis.openComplaints} open complaints across the platform.
        </p>
      ) : null}
    </>
  );
}
