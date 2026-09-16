import { Ionicons } from "@expo/vector-icons";
import { formatINR, haversineKm } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { ExpandedBooking } from "@/features/hooks";
import { Card, Row, StatusBadge, Text, t } from "@/ui";

export function DropCard({ b, index, from }: { b: ExpandedBooking; index?: number; from?: { lat: number; lng: number } }) {
  const router = useRouter();
  const live = b.status === "OUT_FOR_DELIVERY";
  const km = from ? haversineKm(from, { lat: b.address.lat, lng: b.address.lng }).toFixed(1) : null;
  return (
    <Card onPress={() => router.push(`/drop/${b.id}`)} style={live ? { borderColor: t.colors.primary, borderWidth: 1.5 } : undefined}>
      <Row gap={12} center={false}>
        <View style={[styles.idx, live && { backgroundColor: t.colors.primary }]}>
          {live ? <Ionicons name="navigate" size={16} color="#fff" /> : <Text variant="bodyStrong">{index ?? "•"}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Row between>
            <Text variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
              {b.customerName}
            </Text>
            <StatusBadge status={b.status} />
          </Row>
          <Text variant="small" tone="muted" numberOfLines={2}>
            {b.address.line1}, {b.address.line2} · {b.address.pincode}
          </Text>
          <Row gap={10} style={{ marginTop: 6, flexWrap: "wrap" }}>
            <Row gap={4}>
              <Ionicons name="flame-outline" size={13} color={t.colors.inkMuted} />
              <Text variant="caption" tone="muted">
                {b.items.map((i) => `${i.qty} × ${i.name.split(" ").slice(0, 2).join(" ")}`).join(", ")}
              </Text>
            </Row>
            <Row gap={4}>
              <Ionicons name={b.payment.method === "cod" ? "cash-outline" : "checkmark-circle-outline"} size={13} color={b.payment.method === "cod" ? "#9A6B00" : t.colors.success} />
              <Text variant="caption" style={{ color: b.payment.method === "cod" ? "#9A6B00" : t.colors.success }}>
                {b.payment.method === "cod" ? `Collect ${formatINR(b.charges.total, { decimals: false })}` : "Prepaid"}
              </Text>
            </Row>
            {km ? (
              <Text variant="caption" tone="faint">
                {km} km
              </Text>
            ) : null}
            {b.slot === "express" ? (
              <Text variant="caption" tone="primary">
                ⚡ Express
              </Text>
            ) : null}
          </Row>
        </View>
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({ idx: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center" } });
