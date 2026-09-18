import { Ionicons } from "@expo/vector-icons";
import { STATUS_LABELS, TIMELINE_STEPS, formatDateShort, formatINR, formatTime } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { ExpandedBooking } from "@/features/hooks";
import { Card, Row, StatusBadge, Text, t } from "@/ui";

export const payLabel = (b: ExpandedBooking) =>
  b.payment.method === "credit" ? (b.payment.status === "CREDIT_PAID" ? "Credit · paid" : b.payment.status === "CREDIT_OVERDUE" ? "Credit · overdue" : "On credit") : b.payment.method === "cod" ? (b.payment.status === "COD_COLLECTED" ? "Cash paid" : "Cash on delivery") : b.payment.status === "PAID" ? `Paid · ${b.payment.method.toUpperCase()}` : b.payment.status === "REFUNDED" ? "Refunded" : "Payment pending";

export function OrderRow({ b }: { b: ExpandedBooking }) {
  const router = useRouter();
  return (
    <Card onPress={() => router.push(`/order/${b.id}`)} padded={false} style={{ borderRadius: 16 }}>
      <Row gap={12} style={{ padding: 14 }}>
        <View style={styles.icon}>
          <Text variant="bodyStrong" tone="primary">
            {b.cylinders}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{b.items.map((i) => `${i.qty} × ${i.name.replace(" Commercial", "")}`).join(" + ")}</Text>
          <Text variant="caption" tone="muted">
            {b.code} · {b.outlet.label} · {formatDateShort(b.createdAt)}, {formatTime(b.createdAt)}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Text variant="small" style={{ fontWeight: "600" }}>
            {formatINR(b.charges.total, { decimals: false })}
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
        <View style={{ flex: 1 }}>
          <Text variant="label" style={{ color: t.colors.gold }}>
            {b.code} · {b.outlet.label}
          </Text>
          <Text variant="h3" style={{ color: "#fff", marginTop: 2 }}>
            {awaitingPayment ? "Payment pending" : STATUS_LABELS[b.status]} · {b.items.map((i) => `${i.qty} × ${i.name.split(" ")[0]}`).join(" + ")}
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
      <Text variant="small" style={{ color: "#CFC7BB", marginTop: 8 }}>
        {b.status === "OUT_FOR_DELIVERY" && b.staff
          ? `${b.staff.name} is on the way · ETA ${b.etaMinutes ?? "—"} min`
          : b.status === "DELIVERY_FAILED"
            ? "Delivery attempt failed — agency will reschedule"
            : b.eta
              ? `Expected by ${formatDateShort(b.eta)}, ${formatTime(b.eta)} · ${payLabel(b)}`
              : payLabel(b)}
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
