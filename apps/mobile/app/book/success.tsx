import { Ionicons } from "@expo/vector-icons";
import { formatDateShort, formatINR, formatTime } from "@gassetu/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useBooking } from "@/features/hooks";
import { Button, Card, ErrorState, KeyValue, Row, Screen, SkeletonCard, Text, t } from "@/ui";

/** C10 — Booking success */
export default function SuccessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useBooking(id);
  const scale = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 9 }).start();
  }, [scale]);
  const b = q.data;
  return (
    <Screen
      footer={
        <View style={{ gap: 8 }}>
          <Button title="Track order" size="lg" icon="navigate" onPress={() => router.replace(`/order/${id}`)} />
          <Button title="Back to home" variant="ghost" onPress={() => router.replace("/(business)/home")} />
        </View>
      }
    >
      <View style={{ alignItems: "center", paddingTop: 36, gap: 10 }}>
        <Animated.View style={[styles.check, { transform: [{ scale }] }]}>
          <Ionicons name="checkmark" size={44} color="#fff" />
        </Animated.View>
        <Text variant="title" center>
          Order confirmed!
        </Text>
        <Text variant="body" tone="muted" center style={{ maxWidth: 300 }}>
          {b ? `${b.agencyName} has your order for ${b.outlet.label}. We'll notify you at every step.` : ""}
        </Text>
      </View>
      {q.isLoading ? (
        <SkeletonCard lines={5} />
      ) : q.isError || !b ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <View style={{ gap: 12, marginTop: 24 }}>
          <Card tone="navy">
            <Text variant="label" style={{ color: "#9FB3C8" }}>
              Delivery OTP — the outlet shares this with the delivery partner
            </Text>
            <Row between style={{ marginTop: 8 }}>
              <Row gap={8}>
                {b.deliveryOtp.split("").map((d, i) => (
                  <View key={i} style={styles.otpBox}>
                    <Text variant="title" style={{ color: "#fff" }}>
                      {d}
                    </Text>
                  </View>
                ))}
              </Row>
              <Ionicons name="shield-checkmark" size={32} color={t.colors.primary} />
            </Row>
          </Card>
          <Card>
            <KeyValue k="Order" v={b.code} strong />
            <KeyValue k="Invoice" v={b.invoiceNo} />
            <KeyValue k="Items" v={b.items.map((i) => `${i.qty} × ${i.name}`).join(", ")} />
            <KeyValue k="Empties to return" v={String(b.emptiesToCollect)} />
            <KeyValue k="Estimated delivery" v={b.eta ? `${formatDateShort(b.eta)}, by ${formatTime(b.eta)}` : "—"} />
            <KeyValue k="Payment" v={b.payment.method === "credit" ? `On credit · ${formatINR(b.charges.total)} due after delivery` : b.payment.method === "cod" ? `Cash on delivery · ${formatINR(b.charges.total)}` : `Paid ${formatINR(b.charges.total)} via ${b.payment.method.toUpperCase()}`} tone={b.payment.method === "cod" || b.payment.method === "credit" ? "ink" : "success"} />
            {b.payment.gatewayRef ? <KeyValue k="Payment ref" v={b.payment.gatewayRef} /> : null}
          </Card>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  check: { width: 96, height: 96, borderRadius: 48, backgroundColor: t.colors.success, alignItems: "center", justifyContent: "center" },
  otpBox: { width: 44, height: 52, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
});
