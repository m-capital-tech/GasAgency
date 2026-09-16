import { Ionicons } from "@expo/vector-icons";
import { relativeTime, type NotificationType } from "@gassetu/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { keys, useNotifications, useUserId } from "@/features/hooks";
import { post } from "@/lib/api";
import { Chip, EmptyState, ErrorState, Row, Screen, SkeletonList, Text, t } from "@/ui";

const ICON: Record<NotificationType, { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  status: { name: "cube-outline", color: t.colors.primary },
  reminder: { name: "alarm-outline", color: t.colors.warning },
  offer: { name: "pricetag-outline", color: t.colors.success },
  system: { name: "information-circle-outline", color: t.colors.info },
};

/** C14 — Notifications */
export default function NotificationsScreen() {
  const q = useNotifications();
  const qc = useQueryClient();
  const userId = useUserId();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | NotificationType>("all");
  const list = (q.data ?? []).filter((n) => filter === "all" || n.type === filter);
  const markAll = async () => {
    await post(`/users/${userId}/notifications/read`);
    qc.invalidateQueries({ queryKey: keys.notifications(userId) });
  };
  return (
    <Screen
      title="Notifications"
      tabBar
      right={
        <Pressable onPress={markAll} accessibilityRole="button" hitSlop={8}>
          <Text variant="small" tone="primary" style={{ fontWeight: "600" }}>
            Mark all read
          </Text>
        </Pressable>
      }
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    >
      <Row gap={8} style={{ marginBottom: 14, flexWrap: "wrap" }}>
        {(["all", "status", "reminder", "offer"] as const).map((f) => (
          <Chip key={f} label={f === "all" ? "All" : f === "status" ? "Order updates" : f === "reminder" ? "Reminders" : "Offers"} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </Row>
      {q.isLoading ? (
        <SkeletonList />
      ) : q.isError ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title="You're all caught up" body="Order updates, refill reminders and offers will appear here." />
      ) : (
        <View style={{ gap: 8 }}>
          {list.map((n) => {
            const ic = ICON[n.type];
            return (
              <Pressable
                key={n.id}
                onPress={async () => {
                  if (!n.read) {
                    await post(`/users/${userId}/notifications/read`, { id: n.id });
                    qc.invalidateQueries({ queryKey: keys.notifications(userId) });
                  }
                  if (n.bookingId) router.push(`/order/${n.bookingId}`);
                }}
                style={[styles.row, !n.read && styles.unread]}
                accessibilityRole="button"
              >
                <View style={[styles.icon, { backgroundColor: ic.color + "1A" }]}>
                  <Ionicons name={ic.name} size={18} color={ic.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Row between>
                    <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                      {n.title}
                    </Text>
                    <Text variant="caption" tone="faint">
                      {relativeTime(n.createdAt)}
                    </Text>
                  </Row>
                  <Text variant="small" tone="muted">
                    {n.body}
                  </Text>
                </View>
                {!n.read ? <View style={styles.dot} /> : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 16, backgroundColor: t.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  unread: { backgroundColor: "#FFF8F3" },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.primary, marginTop: 6 },
});
