import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { TenantOrderStatusBadge } from "@/components/TenantStatusBadge";
import { loadTenantOrders, type TenantOrderSummary } from "@/lib/platform-api";
import { useSession } from "@/lib/session";
import { Button, Card, Chip, EmptyState, ErrorState, Row, Screen, SkeletonList, Text, t } from "@/ui";

type Filter = "all" | "active" | "delivered" | "cancelled";

const terminalStatuses = new Set(["delivered", "rejected", "cancelled"]);

function rupees(value: string) {
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function TenantOrdersScreen() {
  const router = useRouter();
  const sessionKind = useSession((state) => state.sessionKind);
  const tenantPublicId = useSession((state) => state.activeTenantPublicId);
  const [orders, setOrders] = useState<TenantOrderSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantPublicId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadTenantOrders(tenantPublicId, { limit: 50 });
      setOrders(result.orders);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Orders could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [tenantPublicId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadMore = async () => {
    if (!tenantPublicId || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await loadTenantOrders(tenantPublicId, { limit: 50, cursor: nextCursor });
      setOrders((current) => [...current, ...result.orders]);
      setNextCursor(result.nextCursor);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "More orders could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = useMemo(() => orders.filter((order) => {
    if (filter === "active") return !terminalStatuses.has(order.status);
    if (filter === "delivered") return order.status === "delivered";
    if (filter === "cancelled") return order.status === "cancelled" || order.status === "rejected" || order.status === "payment_failed";
    return true;
  }), [filter, orders]);

  if (sessionKind !== "tenant") return <Redirect href="/" />;
  if (!tenantPublicId) return <Redirect href="/(auth)/select-tenant" />;

  return (
    <Screen title="Orders" subtitle="Live status from your serving agency" back refreshing={loading} onRefresh={() => { void refresh(); }}>
      <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 14 }}>
        <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
        <Chip label="Active" active={filter === "active"} onPress={() => setFilter("active")} />
        <Chip label="Delivered" active={filter === "delivered"} onPress={() => setFilter("delivered")} />
        <Chip label="Cancelled" active={filter === "cancelled"} onPress={() => setFilter("cancelled")} />
      </Row>

      {loading && !orders.length ? <SkeletonList count={4} /> : null}
      {error && !orders.length ? <ErrorState message={error} onRetry={() => { void refresh(); }} /> : null}
      {!loading && !error && visible.length === 0 ? (
        <EmptyState
          icon="cube-outline"
          title={filter === "all" ? "No orders yet" : `No ${filter} orders`}
          body="Orders placed by your business will appear here."
          action="Place an order"
          onAction={() => router.push("/(tenant)/order")}
        />
      ) : null}

      <View style={{ gap: 10 }}>
        {visible.map((order) => (
          <Card key={order.publicId} onPress={() => router.push({ pathname: "/(tenant)/order-detail", params: { id: order.publicId } })}>
            <Row between center={false}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text variant="bodyStrong">{order.items.map((item) => `${item.quantity} × ${item.displayName}`).join(" + ")}</Text>
                <Text variant="caption" tone="muted" style={{ marginTop: 3 }}>{order.orderNumber} · {order.outlet.label}</Text>
                <Text variant="caption" tone="faint" style={{ marginTop: 3 }}>{shortDate(order.placedAt ?? order.createdAt)} · {order.agency.displayName}</Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 7 }}>
                <Text variant="bodyStrong">{rupees(order.totalAmount)}</Text>
                <TenantOrderStatusBadge status={order.status} />
              </View>
            </Row>
            {order.status === "out_for_delivery" ? (
              <Row gap={7} style={{ marginTop: 12 }}>
                <Ionicons name="navigate-circle" size={18} color={t.colors.primary} />
                <Text variant="small" tone="primary">Your order is on the way</Text>
              </Row>
            ) : null}
          </Card>
        ))}
      </View>

      {error && orders.length ? <Text variant="small" tone="danger" style={{ marginTop: 12 }}>{error}</Text> : null}
      {nextCursor ? <Button title="Load more orders" variant="secondary" loading={loadingMore} style={{ marginTop: 16 }} onPress={() => { void loadMore(); }} /> : null}
      <Button title="Place a new order" icon="cart" style={{ marginTop: 18 }} onPress={() => router.push("/(tenant)/order")} />
    </Screen>
  );
}
