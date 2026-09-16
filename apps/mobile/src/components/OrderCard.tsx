import { Ionicons } from "@expo/vector-icons";
import { STATUS_LABELS, TIMELINE_STEPS, formatDateShort, formatINR, formatTime } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { ExpandedBooking } from "@/features/hooks";
import { Card, Row, StatusBadge, Text, t } from "@/ui";

export function OrderRow({ b }: { b: ExpandedBooking }) {
  const router = useRouter();
  const item = b.items[0];
  return (
    <Card onPress={() => router.push(`/order/${b.id}`)} padded={false} style={{ borderRadius: 16 }}>
      <Row gap={12} style={{ padding: 14 }}>
        <View style={styles.icon}>
          <Ionicons name="flame" size={18} color={t.colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{b.code}</Text>
          <Text variant="caption" tone="muted">
            {formatDateShort(b.createdAt)}, {formatTime(b.createdAt)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text variant="small" tone="muted">
            {item.qty} × {item.name.split(" ").slice(0, 2).join(" ")}
          </Text>
          <StatusBadge status={b.status} />
        </View>
      </Row>
    </Card>
  );
}

/** Compact "active order" tracker card for the home dashboard. */
export function ActiveOrderCard({ b }: { b: ExpandedBooking }) {
  const router = useRouter();
  const idx = Math.max(0, TIMELINE_STEPS.indexOf(b.status === "DELIVERY_FAILED" ? "ACCEPTED" : b.status));
  const awaitingPayment = b.status === "PENDING_PAYMENT" || b.status === "PAYMENT_FAILED";
  return (
    <Card onPress={() => router.push(`/order/${b.id}`)} tone="navy">
      <Row between>
        <View>
          <Text variant="label" style={{ color: "#9FB3C8" }}>
            Active order · {b.code}
          </Text>
          <Text variant="h3" style={{ color: "#fff", marginTop: 2 }}>
            {awaitingPayment ? "Payment pending" : STATUS_LABELS[b.status]}
          </Text>
        </View>
        <View style={styles.trackBtn}>
          <Text variant="caption" style={{ color: "#fff" }}>
            {awaitingPayment ? "Pay now" : "Track"}
          </Text>
          <Ionicons name="arrow-forward" size={14} color="#fff" />
        </View>
      </Row>
      {!awaitingPayment ? (
        <View style={styles.steps}>
          {TIMELINE_STEPS.map((s, i) => (
            <View key={s} style={[styles.step, { backgroundColor: i <= idx ? t.colors.primary : "rgba(255,255,255,0.18)" }]} />
          ))}
        </View>
      ) : null}
      <Text variant="small" style={{ color: "#C9D6E3", marginTop: 8 }}>
        {b.status === "OUT_FOR_DELIVERY" && b.staff
          ? `${b.staff.name} is on the way · ETA ${b.etaMinutes ?? "—"} min`
          : b.status === "DELIVERY_FAILED"
            ? "Delivery attempt failed — agency will reschedule"
            : b.eta
              ? `Expected by ${formatDateShort(b.eta)}, ${formatTime(b.eta)} · ${formatINR(b.charges.total)}`
              : formatINR(b.charges.total)}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  icon: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.colors.primarySoft, alignItems: "center", justifyContent: "center" },
  trackBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: t.colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  steps: { flexDirection: "row", gap: 4, marginTop: 14 },
  step: { flex: 1, height: 5, borderRadius: 3 },
});
