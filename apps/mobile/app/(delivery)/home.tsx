import { Ionicons } from "@expo/vector-icons";
import { formatINR } from "@gassetu/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { DropCard } from "@/components/DropCard";
import { toast } from "@/components/Toast";
import { useMyDrops } from "@/features/delivery";
import { patch } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Avatar, Button, Card, EmptyState, ErrorState, Row, Screen, SkeletonCard, Text, t } from "@/ui";

/** D1 — Delivery home */
export default function DeliveryHome() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useSession((s) => s.user);
  const { staff, drops, pending, done } = useMyDrops();
  const s = staff.data;
  const active = pending.find((b) => b.status === "OUT_FOR_DELIVERY");
  const next = pending.find((b) => b.status !== "OUT_FOR_DELIVERY");
  const toggle = async (online: boolean) => {
    if (!s) return;
    await patch(`/staff/${s.id}/online`, { online });
    qc.invalidateQueries({ queryKey: ["staff"] });
    toast.info(online ? "You're online" : "You're offline", online ? "New drops can be assigned to you." : "You won't get new drops.");
  };

  return (
    <Screen tabBar padded={false} refreshing={drops.isRefetching} onRefresh={() => { staff.refetch(); drops.refetch(); }}>
      <Row between style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <Row gap={12}>
          <Avatar name={user?.name || "?"} color={t.colors.gold} size={42} />
          <View>
            <Text variant="h3">{user?.name}</Text>
            <Text variant="caption" tone="muted">
              {s ? `${s.vehicle} · ${s.vehicleNo}` : "Delivery partner"}
            </Text>
          </View>
        </Row>
        <Row gap={8}>
          <Text variant="caption" tone={s?.online ? "success" : "muted"}>
            {s?.online ? "Online" : "Offline"}
          </Text>
          <Switch value={!!s?.online} onValueChange={toggle} trackColor={{ true: t.colors.success }} accessibilityLabel="Online status" />
        </Row>
      </Row>

      <View style={{ paddingHorizontal: 20, paddingTop: 18, gap: 14 }}>
        {staff.isLoading ? (
          <SkeletonCard lines={4} />
        ) : staff.isError ? (
          <ErrorState onRetry={() => staff.refetch()} />
        ) : (
          <>
            <Row gap={10}>
              {[
                { label: "Assigned", value: pending.length + done.length, icon: "list-outline" as const, color: t.colors.info },
                { label: "Delivered", value: done.filter((b) => b.status === "DELIVERED").length, icon: "checkmark-done-outline" as const, color: t.colors.success },
                { label: "Failed", value: done.filter((b) => b.status !== "DELIVERED").length, icon: "close-circle-outline" as const, color: t.colors.danger },
              ].map((k) => (
                <Card key={k.label} style={{ flex: 1 }} padded={false}>
                  <View style={{ padding: 12, gap: 6 }}>
                    <Ionicons name={k.icon} size={18} color={k.color} />
                    <Text variant="title">{k.value}</Text>
                    <Text variant="caption" tone="muted">
                      {k.label}
                    </Text>
                  </View>
                </Card>
              ))}
            </Row>

            <Card tone="navy" onPress={() => router.push("/(delivery)/summary")}>
              <Row between>
                <View>
                  <Text variant="label" style={{ color: "#9FB3C8" }}>
                    Cash in hand
                  </Text>
                  <Text variant="title" style={{ color: "#fff" }}>
                    {formatINR(s?.cashInHand ?? 0)}
                  </Text>
                </View>
                <View style={styles.pill}>
                  <Text variant="caption" style={{ color: "#fff" }}>
                    Deposit at day end
                  </Text>
                  <Ionicons name="arrow-forward" size={14} color="#fff" />
                </View>
              </Row>
            </Card>

            {active ? (
              <View>
                <Text variant="label" tone="faint" style={{ marginBottom: 8 }}>
                  In progress
                </Text>
                <DropCard b={active} from={s?.currentLocation} />
              </View>
            ) : null}

            {next ? (
              <View>
                <Text variant="label" tone="faint" style={{ marginBottom: 8 }}>
                  Next drop
                </Text>
                <DropCard b={next} index={active ? 2 : 1} from={s?.currentLocation} />
                {!active ? <Button title="Start trip" icon="navigate" size="lg" style={{ marginTop: 10 }} onPress={() => router.push(`/drop/${next.id}?start=1`)} /> : null}
              </View>
            ) : !active && !drops.isLoading ? (
              <EmptyState icon="checkmark-done-circle-outline" title="No pending drops" body="You're all done for now. New assignments from the agency will appear here." />
            ) : null}

            <Pressable onPress={() => router.push("/(delivery)/drops")} accessibilityRole="button" style={{ alignItems: "center", paddingVertical: 6 }}>
              <Text variant="small" tone="primary" style={{ fontWeight: "600" }}>
                View full drop list ({pending.length})
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ pill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.14)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 } });
