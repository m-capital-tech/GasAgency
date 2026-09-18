import { Ionicons } from "@expo/vector-icons";
import { formatINR, type AgencyPrice, type CylinderType } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Cylinder } from "@/components/Cylinder";
import { draftCount, useDraft } from "@/features/bookingDraft";
import { useAgency, useBusiness } from "@/features/hooks";
import { Button, Card, Chip, ErrorState, Row, Screen, SkeletonList, Text, t } from "@/ui";

/** C6 — Build the order: outlet, cylinder mix, empties to return */
export default function CylinderScreen() {
  const router = useRouter();
  const biz = useBusiness();
  const agency = useAgency(biz.data?.assignedAgencyId);
  const draft = useDraft();
  const types: CylinderType[] = agency.data?.cylinderTypes ?? [];
  const prices: AgencyPrice[] = agency.data?.prices ?? [];
  const b = biz.data;
  const count = draftCount(draft.qty);
  const outlet = b?.outlets.find((o) => o.id === draft.outletId) ?? b?.outlets.find((o) => o.id === b.defaultOutletId);
  const empties = draft.emptiesToCollect ?? Math.min(count, (outlet?.emptiesHeld ?? 0) + (outlet?.inUse ?? 0));

  useEffect(() => {
    if (b && !draft.outletId) draft.set({ outletId: b.defaultOutletId });
    if (b && count === 0 && types.length) {
      const qty: Record<string, number> = {};
      b.usualOrder.forEach((i) => (qty[i.cylinderTypeId] = i.qty));
      draft.set({ qty });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b?.userId, types.length]);

  const priceOf = (id: string) => prices.find((p) => p.cylinderTypeId === id);
  const subtotal = types.reduce((s, c) => s + (draft.qty[c.id] ?? 0) * (priceOf(c.id)?.price ?? 0), 0);

  return (
    <Screen
      title="Order cylinders"
      subtitle={agency.data ? `From ${agency.data.name}` : undefined}
      back
      footer={
        <Row between>
          <View>
            <Text variant="caption" tone="muted">
              {count} cylinder{count === 1 ? "" : "s"} · {empties} empties back
            </Text>
            <Text variant="h2">{formatINR(subtotal, { decimals: false })}</Text>
            <Text variant="caption" tone="faint">
              ex-GST · slab discount at review
            </Text>
          </View>
          <Button title="Choose slot" full={false} iconRight="arrow-forward" disabled={count === 0} onPress={() => router.push("/book/slot")} />
        </Row>
      }
    >
      {agency.isLoading || biz.isLoading ? (
        <SkeletonList count={3} />
      ) : agency.isError ? (
        <ErrorState message={(agency.error as Error).message} onRetry={() => agency.refetch()} />
      ) : !b?.assignedAgencyId ? (
        <ErrorState message="No agency linked yet. Link your connection first." onRetry={() => router.replace("/(onboarding)/connection")} />
      ) : (
        <View style={{ gap: 12 }}>
          {b.outlets.length > 1 ? (
            <View>
              <Text variant="label" tone="faint" style={{ marginBottom: 8 }}>
                Deliver to
              </Text>
              <Row gap={8} style={{ flexWrap: "wrap" }}>
                {b.outlets.map((o) => (
                  <Chip key={o.id} label={`${o.label} · ${o.daysLeft}d left`} active={draft.outletId === o.id} onPress={() => draft.set({ outletId: o.id, emptiesToCollect: null })} icon="storefront-outline" />
                ))}
              </Row>
            </View>
          ) : null}

          <Text variant="label" tone="faint">
            Cylinders
          </Text>
          {types.map((c) => {
            const p = priceOf(c.id);
            const q = draft.qty[c.id] ?? 0;
            const slab = p?.slabs?.find((s) => q >= s.minQty);
            return (
              <Card key={c.id} style={q > 0 ? { borderColor: t.colors.primary, borderWidth: 1.5 } : undefined}>
                <Row gap={12}>
                  <Cylinder size={44} color={c.id === "cyl_19" ? t.colors.primary : t.colors.primaryDark} dark={t.colors.primaryDark} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{c.name}</Text>
                    <Text variant="caption" tone="muted">
                      {p ? `${formatINR(p.price, { decimals: false })} each` : "—"}
                      {p?.slabs?.length ? ` · ${p.slabs.map((s) => `${s.minQty}+ @ ${formatINR(s.price, { decimals: false })}`).join(", ")}` : ""}
                    </Text>
                    {slab ? (
                      <Text variant="caption" tone="success">
                        Slab price applied · {formatINR(slab.price, { decimals: false })} each
                      </Text>
                    ) : null}
                  </View>
                  <Row gap={10}>
                    <Pressable onPress={() => draft.setQty(c.id, q - 1)} disabled={q <= 0} style={[styles.step, q <= 0 && { opacity: 0.4 }]} accessibilityLabel={`Fewer ${c.name}`}>
                      <Ionicons name="remove" size={20} color={t.colors.ink} />
                    </Pressable>
                    <Text variant="h2" style={{ minWidth: 26, textAlign: "center" }}>
                      {q}
                    </Text>
                    <Pressable onPress={() => draft.setQty(c.id, q + 1)} disabled={count >= 20} style={[styles.step, styles.stepPrimary, count >= 20 && { opacity: 0.4 }]} accessibilityLabel={`More ${c.name}`}>
                      <Ionicons name="add" size={20} color="#fff" />
                    </Pressable>
                  </Row>
                </Row>
              </Card>
            );
          })}

          <Card>
            <Row between>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text variant="bodyStrong">Empty cylinders to return</Text>
                <Text variant="caption" tone="muted">
                  {outlet ? `${outlet.emptiesHeld} empties + ${outlet.inUse} in use at ${outlet.label}` : "Collected by the delivery partner"}
                </Text>
              </View>
              <Row gap={10}>
                <Pressable onPress={() => draft.set({ emptiesToCollect: Math.max(0, empties - 1) })} style={[styles.step, empties <= 0 && { opacity: 0.4 }]} disabled={empties <= 0} accessibilityLabel="Fewer empties">
                  <Ionicons name="remove" size={20} color={t.colors.ink} />
                </Pressable>
                <Text variant="h2" style={{ minWidth: 26, textAlign: "center" }}>
                  {empties}
                </Text>
                <Pressable onPress={() => draft.set({ emptiesToCollect: Math.min(20, empties + 1) })} style={[styles.step, styles.stepPrimary]} accessibilityLabel="More empties">
                  <Ionicons name="add" size={20} color="#fff" />
                </Pressable>
              </Row>
            </Row>
          </Card>
          <Text variant="caption" tone="faint">
            Up to 20 cylinders per order. Prices are illustrative and set by the agency; 18% GST added at review.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { width: 38, height: 38, borderRadius: 19, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.colors.border },
  stepPrimary: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
});
