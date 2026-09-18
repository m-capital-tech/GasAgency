import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { OrderRow } from "@/components/OrderCard";
import { useBusiness, useMyBookings } from "@/features/hooks";
import { Chip, EmptyState, ErrorState, Row, Screen, SkeletonList, Text } from "@/ui";

type Filter = "all" | "active" | "delivered" | "cancelled";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

/** C12 — Order history with outlet filter */
export default function OrdersScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [outlet, setOutlet] = useState<string | null>(null);
  const q = useMyBookings();
  const biz = useBusiness();
  const list = (q.data ?? []).filter((b) => {
    if (outlet && b.outletId !== outlet) return false;
    if (filter === "active") return !["DELIVERED", "REJECTED", "CANCELLED"].includes(b.status);
    if (filter === "delivered") return b.status === "DELIVERED";
    if (filter === "cancelled") return ["REJECTED", "CANCELLED", "PAYMENT_FAILED"].includes(b.status);
    return true;
  });
  const cylinders30 = biz.data?.cylinders30 ?? 0;

  return (
    <Screen title="Orders" subtitle={`${cylinders30} cylinders in the last 30 days`} tabBar refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Row gap={8} style={{ marginBottom: 10, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </Row>
      {(biz.data?.outlets.length ?? 0) > 1 ? (
        <Row gap={8} style={{ marginBottom: 14, flexWrap: "wrap" }}>
          <Chip label="All outlets" active={!outlet} onPress={() => setOutlet(null)} icon="storefront-outline" />
          {biz.data!.outlets.map((o) => (
            <Chip key={o.id} label={o.label} active={outlet === o.id} onPress={() => setOutlet(o.id)} />
          ))}
        </Row>
      ) : (
        <View style={{ height: 4 }} />
      )}
      {q.isLoading ? (
        <SkeletonList count={4} />
      ) : q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon="cube-outline" title={filter === "all" ? "No orders yet" : `No ${filter} orders`} body="Your cylinder orders will show up here with live status and invoices." action="Order cylinders" onAction={() => router.push("/book/cylinder")} />
      ) : (
        <View style={{ gap: 10 }}>
          {list.map((b) => (
            <OrderRow key={b.id} b={b} />
          ))}
          <Text variant="caption" tone="faint" center style={{ marginTop: 6 }}>
            Tap an order for its GST invoice
          </Text>
        </View>
      )}
    </Screen>
  );
}
