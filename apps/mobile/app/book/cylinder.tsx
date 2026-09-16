import { Ionicons } from "@expo/vector-icons";
import { formatINR, type AgencyPrice, type CylinderType } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Cylinder } from "@/components/Cylinder";
import { useDraft } from "@/features/bookingDraft";
import { useAgency, useCustomer } from "@/features/hooks";
import { Button, Card, ErrorState, Row, Screen, SkeletonList, Text, t } from "@/ui";

/** C6 — Choose cylinder & quantity */
export default function CylinderScreen() {
  const router = useRouter();
  const customer = useCustomer();
  const agency = useAgency(customer.data?.assignedAgencyId);
  const draft = useDraft();
  const types: CylinderType[] = agency.data?.cylinderTypes ?? [];
  const prices: AgencyPrice[] = agency.data?.prices ?? [];
  const category = customer.data?.type ?? "domestic";
  const visible = types.filter((x) => x.category === category);
  const other = types.filter((x) => x.category !== category);
  const selected = types.find((x) => x.id === draft.cylinderTypeId);
  const isDomestic = selected?.category === "domestic";

  useEffect(() => {
    if (!draft.cylinderTypeId && visible.length) draft.set({ cylinderTypeId: visible[0].id, qty: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible.length]);

  const priceOf = (id: string) => prices.find((p) => p.cylinderTypeId === id);
  const unit = selected ? (priceOf(selected.id)?.price ?? 0) : 0;

  const Option = ({ c }: { c: CylinderType }) => {
    const active = draft.cylinderTypeId === c.id;
    const p = priceOf(c.id);
    return (
      <Pressable onPress={() => draft.set({ cylinderTypeId: c.id, qty: c.category === "domestic" ? 1 : Math.max(1, draft.qty) })} accessibilityRole="radio" accessibilityState={{ selected: active }} style={[styles.opt, active && styles.optActive]}>
        <Cylinder size={44} color={c.category === "domestic" ? t.colors.primary : "#2F6FED"} dark={c.category === "domestic" ? "#C4520D" : "#1D4FB8"} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{c.name}</Text>
          <Text variant="caption" tone="muted">
            {c.category === "domestic" ? "Home use · 1 per booking" : "Commercial use"}
            {p && p.deliveryCharge ? ` · delivery ${formatINR(p.deliveryCharge, { decimals: false })}` : " · free delivery"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text variant="h3">{p ? formatINR(p.price, { decimals: false }) : "—"}</Text>
          <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={20} color={active ? t.colors.primary : t.colors.inkFaint} />
        </View>
      </Pressable>
    );
  };

  return (
    <Screen
      title="Book a refill"
      subtitle={agency.data ? `From ${agency.data.name}` : undefined}
      back
      footer={
        <Row between>
          <View>
            <Text variant="caption" tone="muted">
              {draft.qty} × {selected?.name ?? "cylinder"}
            </Text>
            <Text variant="h2">{formatINR(unit * draft.qty)}</Text>
          </View>
          <Button title="Choose slot" full={false} iconRight="arrow-forward" disabled={!selected} onPress={() => router.push("/book/slot")} />
        </Row>
      }
    >
      {agency.isLoading || customer.isLoading ? (
        <SkeletonList count={3} />
      ) : agency.isError ? (
        <ErrorState message={(agency.error as Error).message} onRetry={() => agency.refetch()} />
      ) : !customer.data?.assignedAgencyId ? (
        <ErrorState message="No agency linked yet. Link your connection first." onRetry={() => router.replace("/(onboarding)/connection")} />
      ) : (
        <View style={{ gap: 10 }}>
          <Text variant="label" tone="faint">
            {category === "domestic" ? "Domestic cylinders" : "Commercial cylinders"}
          </Text>
          {visible.map((c) => (
            <Option key={c.id} c={c} />
          ))}
          <Text variant="label" tone="faint" style={{ marginTop: 8 }}>
            {category === "domestic" ? "Commercial (for businesses)" : "Domestic"}
          </Text>
          {other.map((c) => (
            <Option key={c.id} c={c} />
          ))}

          <Card style={{ marginTop: 8 }}>
            <Row between>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text variant="bodyStrong">Quantity</Text>
                <Text variant="caption" tone="muted">
                  {isDomestic ? "Domestic bookings are capped at 1" : "Up to 10 per booking"}
                </Text>
              </View>
              <Row gap={14}>
                <Pressable onPress={() => draft.set({ qty: Math.max(1, draft.qty - 1) })} disabled={isDomestic || draft.qty <= 1} style={[styles.step, (isDomestic || draft.qty <= 1) && { opacity: 0.4 }]} accessibilityLabel="Decrease quantity">
                  <Ionicons name="remove" size={20} color={t.colors.ink} />
                </Pressable>
                <Text variant="h2">{draft.qty}</Text>
                <Pressable onPress={() => draft.set({ qty: Math.min(10, draft.qty + 1) })} disabled={isDomestic || draft.qty >= 10} style={[styles.step, styles.stepPrimary, (isDomestic || draft.qty >= 10) && { opacity: 0.4 }]} accessibilityLabel="Increase quantity">
                  <Ionicons name="add" size={20} color="#fff" />
                </Pressable>
              </Row>
            </Row>
          </Card>
          <Text variant="caption" tone="faint">
            Prices are illustrative and set by the agency. Convenience fee and GST shown at review.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  opt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.border },
  optActive: { borderColor: t.colors.primary, backgroundColor: "#FFFAF7" },
  step: { width: 38, height: 38, borderRadius: 19, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.colors.border },
  stepPrimary: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
});
