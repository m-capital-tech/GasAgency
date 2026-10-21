import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { loadTenantDashboard, type TenantDashboardResponse } from "@/lib/platform-api";
import { useSession } from "@/lib/session";
import { Card, Chip, EmptyState, ErrorState, KeyValue, Row, Screen, SkeletonList, Text, t } from "@/ui";

type Period = TenantDashboardResponse["period"];

function rupees(value: string) {
  return `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function comparison(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "No change" : "New activity";
  const change = Math.round(((current - previous) / previous) * 100);
  return `${change >= 0 ? "+" : ""}${change}% vs previous`;
}

function MetricCard({ label, value, note, icon }: { label: string; value: string; note: string; icon: keyof typeof Ionicons.glyphMap }) {
  return (
    <Card style={{ flex: 1, minWidth: 145 }}>
      <Row between>
        <Text variant="label" tone="muted">{label}</Text>
        <Ionicons name={icon} size={18} color={t.colors.primary} />
      </Row>
      <Text variant="h2" style={{ marginTop: 8 }}>{value}</Text>
      <Text variant="caption" tone="faint" style={{ marginTop: 3 }}>{note}</Text>
    </Card>
  );
}

export default function TenantAnalyticsScreen() {
  const sessionKind = useSession((state) => state.sessionKind);
  const tenantPublicId = useSession((state) => state.activeTenantPublicId);
  const [period, setPeriod] = useState<Period>("daily");
  const [dashboard, setDashboard] = useState<TenantDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantPublicId) return;
    setLoading(true);
    setError(null);
    try { setDashboard(await loadTenantDashboard(tenantPublicId, period)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Business insights could not be loaded."); }
    finally { setLoading(false); }
  }, [period, tenantPublicId]);

  useEffect(() => { void refresh(); }, [refresh]);
  if (sessionKind !== "tenant") return <Redirect href="/" />;
  if (!tenantPublicId) return <Redirect href="/(auth)/select-tenant" />;

  return (
    <Screen title="Business insights" subtitle="Your tenant only · Asia/Kolkata" tabBar refreshing={loading} onRefresh={() => { void refresh(); }}>
      <Row gap={8} style={{ marginBottom: 14 }}>
        <Chip label="Today" active={period === "daily"} onPress={() => setPeriod("daily")} />
        <Chip label="This week" active={period === "weekly"} onPress={() => setPeriod("weekly")} />
        <Chip label="This month" active={period === "monthly"} onPress={() => setPeriod("monthly")} />
      </Row>
      {loading && !dashboard ? <SkeletonList count={4} /> : null}
      {error && !dashboard ? <ErrorState message={error} onRetry={() => { void refresh(); }} /> : null}
      {dashboard ? (
        <View style={{ gap: 12 }}>
          <Row gap={10} style={{ flexWrap: "wrap" }} center={false}>
            <MetricCard label="Orders" value={String(dashboard.current.orders)} note={comparison(dashboard.current.orders, dashboard.previous.orders)} icon="cube-outline" />
            <MetricCard label="Cylinders" value={String(dashboard.current.cylinders)} note={comparison(dashboard.current.cylinders, dashboard.previous.cylinders)} icon="flame-outline" />
            <MetricCard label="Booked value" value={rupees(dashboard.current.bookedValue)} note={comparison(Number(dashboard.current.bookedValue), Number(dashboard.previous.bookedValue))} icon="cart-outline" />
            <MetricCard label="Delivered value" value={rupees(dashboard.current.deliveredValue)} note={`${dashboard.current.deliveredOrders} delivered`} icon="checkmark-circle-outline" />
          </Row>

          <Card tone="alt">
            <Text variant="h3">Account position</Text>
            <KeyValue k="Outstanding" v={rupees(dashboard.account.outstanding)} tone={Number(dashboard.account.overdue) ? "danger" : "ink"} />
            <KeyValue k="Overdue" v={rupees(dashboard.account.overdue)} tone={Number(dashboard.account.overdue) ? "danger" : "ink"} />
            <KeyValue k="Due in 7 days" v={rupees(dashboard.account.dueNext7Days)} />
            <KeyValue k="Collected this period" v={rupees(dashboard.current.collected)} />
            {dashboard.account.creditLimit ? <KeyValue k="Approved credit" v={`${rupees(dashboard.account.creditLimit)} · Net ${dashboard.account.netTermDays}`} /> : null}
          </Card>

          <View>
            <Text variant="h3" style={{ marginBottom: 9 }}>Stock runway</Text>
            <View style={{ gap: 9 }}>
              {dashboard.outlets.map((outlet) => (
                <Card key={outlet.publicId}>
                  <Row between center={false}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{outlet.label}</Text>
                      <Text variant="caption" tone="muted">{outlet.stock.inUse} in use · {outlet.stock.spareFull} full spare · {outlet.stock.empty} empty</Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text variant="h2" tone={outlet.estimatedDaysRemaining !== null && outlet.estimatedDaysRemaining < 3 ? "danger" : "primary"}>
                        {outlet.estimatedDaysRemaining === null ? "—" : `${outlet.estimatedDaysRemaining}d`}
                      </Text>
                      <Text variant="caption" tone="faint">estimated</Text>
                    </View>
                  </Row>
                </Card>
              ))}
            </View>
          </View>

          {dashboard.breakdown.outlets.length ? (
            <Card>
              <Text variant="h3" style={{ marginBottom: 8 }}>Outlet activity</Text>
              {dashboard.breakdown.outlets.map((outlet) => <KeyValue key={outlet.publicId} k={`${outlet.label} · ${outlet.cylinders} cylinders`} v={rupees(outlet.spend)} />)}
            </Card>
          ) : <EmptyState icon="stats-chart-outline" title="No activity in this period" body="Placed orders and delivered value will appear here." />}

          {dashboard.breakdown.cylinderTypes.length ? (
            <Card>
              <Text variant="h3" style={{ marginBottom: 8 }}>Cylinder mix</Text>
              {dashboard.breakdown.cylinderTypes.map((item) => <KeyValue key={item.code} k={`${item.displayName} · ${item.cylinders}`} v={rupees(item.spend)} />)}
            </Card>
          ) : null}

          <Card tone="soft">
            <Row gap={9} center={false}>
              <Ionicons name="information-circle-outline" size={20} color={t.colors.inkMuted} />
              <Text variant="caption" tone="muted" style={{ flex: 1 }}>{dashboard.definitions.stockEstimate} Booked and delivered values are shown separately.</Text>
            </Row>
          </Card>
          {error ? <Text variant="small" tone="danger">{error}</Text> : null}
        </View>
      ) : null}
    </Screen>
  );
}
