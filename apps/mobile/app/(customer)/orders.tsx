import { formatDateShort, formatINR } from "@gassetu/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { OrderRow } from "@/components/OrderCard";
import { useMyBookings } from "@/features/hooks";
import { Card, Chip, EmptyState, ErrorState, Row, Screen, SkeletonList, Text, t } from "@/ui";

type Filter = "all" | "active" | "delivered" | "cancelled";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

/** C12 — Order history (with a Payments view) */
export default function OrdersScreen() {
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<"orders" | "payments">(params.tab === "payments" ? "payments" : "orders");
  const [filter, setFilter] = useState<Filter>("all");
  const q = useMyBookings();
  const list = (q.data ?? []).filter((b) => {
    if (filter === "active") return !["DELIVERED", "REJECTED", "CANCELLED"].includes(b.status);
    if (filter === "delivered") return b.status === "DELIVERED";
    if (filter === "cancelled") return ["REJECTED", "CANCELLED", "PAYMENT_FAILED"].includes(b.status);
    return true;
  });
  const paid = (q.data ?? []).filter((b) => ["PAID", "COD_COLLECTED", "REFUNDED"].includes(b.payment.status));

  return (
    <Screen title={tab === "orders" ? "Your orders" : "Payments"} tabBar refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Row gap={8} style={{ marginBottom: 14 }}>
        <Chip label="Orders" active={tab === "orders"} onPress={() => setTab("orders")} icon="receipt-outline" />
        <Chip label="Payments" active={tab === "payments"} onPress={() => setTab("payments")} icon="card-outline" />
      </Row>
      {tab === "orders" ? (
        <>
          <Row gap={8} style={{ marginBottom: 14, flexWrap: "wrap" }}>
            {FILTERS.map((f) => (
              <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
            ))}
          </Row>
          {q.isLoading ? (
            <SkeletonList count={4} />
          ) : q.isError ? (
            <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState icon="receipt-outline" title={filter === "all" ? "No orders yet" : `No ${filter} orders`} body="Your bookings will show up here with live status." action="Book a refill" onAction={() => router.push("/book/cylinder")} />
          ) : (
            <View style={{ gap: 10 }}>
              {list.map((b) => (
                <OrderRow key={b.id} b={b} />
              ))}
            </View>
          )}
        </>
      ) : q.isLoading ? (
        <SkeletonList count={4} />
      ) : paid.length === 0 ? (
        <EmptyState icon="card-outline" title="No payments yet" body="Online and cash payments for your bookings appear here." />
      ) : (
        <View style={{ gap: 10 }}>
          {paid.map((b) => (
            <Card key={b.id} onPress={() => router.push(`/order/${b.id}`)} padded={false} style={{ borderRadius: 16 }}>
              <Row between style={{ padding: 14 }}>
                <View>
                  <Text variant="bodyStrong">{b.payment.method === "cod" ? "Cash on delivery" : b.payment.method.toUpperCase()}</Text>
                  <Text variant="caption" tone="muted">
                    {b.code} · {formatDateShort(b.payment.paidAt ?? b.createdAt)}
                    {b.payment.gatewayRef ? ` · ${b.payment.gatewayRef}` : ""}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text variant="bodyStrong" style={{ color: b.payment.status === "REFUNDED" ? t.colors.info : t.colors.ink }}>
                    {b.payment.status === "REFUNDED" ? "+" : ""}
                    {formatINR(b.charges.total)}
                  </Text>
                  <Text variant="caption" tone={b.payment.status === "REFUNDED" ? "primary" : "success"}>
                    {b.payment.status === "REFUNDED" ? "Refunded" : "Paid"}
                  </Text>
                </View>
              </Row>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
