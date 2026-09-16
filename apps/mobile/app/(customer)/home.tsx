import { Ionicons } from "@expo/vector-icons";
import { formatDateShort } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { AgencyCard } from "@/components/AgencyCard";
import { Cylinder } from "@/components/Cylinder";
import { GasGauge } from "@/components/GasGauge";
import { ActiveOrderCard, OrderRow } from "@/components/OrderCard";
import { useAgency, useCustomer, useMyBookings, useNotifications, useUsage } from "@/features/hooks";
import { useSession } from "@/lib/session";
import { Avatar, Button, Card, ErrorState, Row, Screen, SectionTitle, SkeletonCard, Text, t } from "@/ui";

const QUICK: { icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[] = [
  { icon: "time-outline", label: "History", href: "/(customer)/orders" },
  { icon: "card-outline", label: "Payments", href: "/(customer)/orders?tab=payments" },
  { icon: "chatbubble-ellipses-outline", label: "Support", href: "/support" },
  { icon: "shield-checkmark-outline", label: "Safety tips", href: "/support?tab=safety" },
];

/** C5 — Home dashboard */
export default function HomeScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const customer = useCustomer();
  const usage = useUsage();
  const bookings = useMyBookings();
  const agency = useAgency(customer.data?.assignedAgencyId);
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;
  const active = (bookings.data ?? []).find((b) => !["DELIVERED", "REJECTED", "CANCELLED"].includes(b.status));
  const recent = (bookings.data ?? []).filter((b) => b.id !== active?.id).slice(0, 3);
  const addr = customer.data?.addresses.find((a) => a.id === customer.data?.defaultAddressId);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const refresh = () => {
    customer.refetch();
    usage.refetch();
    bookings.refetch();
  };

  return (
    <Screen tabBar refreshing={customer.isRefetching} onRefresh={refresh} padded={false}>
      {/* top bar */}
      <Row between style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <Pressable onPress={() => router.push("/(customer)/profile")} accessibilityLabel="Profile">
          <Avatar name={user?.name || "?"} color={user?.avatarColor} size={40} />
        </Pressable>
        <Pressable onPress={() => router.push("/addresses")} style={styles.addrPill} accessibilityLabel="Delivery address">
          <Ionicons name="location-outline" size={15} color={t.colors.inkMuted} />
          <Text variant="small" numberOfLines={1} style={{ maxWidth: 190, fontWeight: "600" }}>
            {addr ? `${addr.line1.split(",")[0]}, ${addr.line2 ?? addr.city}` : "Set address"}
          </Text>
          <Ionicons name="chevron-down" size={14} color={t.colors.inkMuted} />
        </Pressable>
        <Pressable onPress={() => router.push("/(customer)/notifications")} style={styles.bell} accessibilityLabel={`Notifications, ${unread} unread`}>
          <Ionicons name="notifications-outline" size={20} color={t.colors.ink} />
          {unread ? <View style={styles.bellDot} /> : null}
        </Pressable>
      </Row>

      <View style={{ paddingHorizontal: 20, paddingTop: 18, gap: 14 }}>
        <View>
          <Text variant="title">
            {greeting}, {user?.name?.split(" ")[0] || "there"} 👋
          </Text>
          <Text variant="small" tone="muted">
            {customer.data?.type === "commercial" ? "Commercial connection" : "Domestic connection"}
            {customer.data?.connection ? ` · ${customer.data.connection.omc} · ${customer.data.connection.consumerNo}` : ""}
          </Text>
        </View>

        {/* hero: gauge + CTA */}
        {usage.isLoading ? (
          <SkeletonCard lines={5} />
        ) : usage.isError ? (
          <ErrorState message={(usage.error as Error).message} onRetry={() => usage.refetch()} />
        ) : (
          <Card style={{ overflow: "hidden" }}>
            <Row between center={false}>
              <View style={{ flex: 1 }}>
                <Text variant="label" tone="faint">
                  Cooking gas
                </Text>
                <Text variant="h2" style={{ marginTop: 2 }}>
                  {usage.data.deliveries === 0 ? "Book your first refill" : usage.data.daysLeft <= 0 ? "Refill due now" : `Refill due in ${usage.data.daysLeft} day${usage.data.daysLeft === 1 ? "" : "s"}`}
                </Text>
                <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
                  {usage.data.lastDeliveredAt ? `Last refill ${formatDateShort(usage.data.lastDeliveredAt)} · ~${usage.data.cycleDays}-day cycle` : "Effortless, reliable cylinder refills"}
                </Text>
              </View>
              <View style={{ marginRight: -6, marginTop: -6 }}>
                <Cylinder size={62} />
              </View>
            </Row>
            <View style={{ alignItems: "center", marginTop: 6 }}>
              <GasGauge pct={usage.data.pct} daysLeft={usage.data.daysLeft} size={210} />
            </View>
            <Button title={active ? "Track current order" : "Book Refill"} size="lg" icon={active ? "navigate" : "flame"} onPress={() => (active ? router.push(`/order/${active.id}`) : router.push("/book/cylinder"))} style={{ marginTop: 4 }} />
            {!active && customer.data?.reminder.nextDate ? (
              <Pressable onPress={() => router.push("/reminders")} style={{ alignItems: "center", marginTop: 10 }} accessibilityRole="button">
                <Text variant="caption" tone="muted">
                  Reminder set for {formatDateShort(customer.data.reminder.nextDate)} · <Text variant="caption" tone="primary">Change</Text>
                </Text>
              </Pressable>
            ) : null}
          </Card>
        )}

        {active ? <ActiveOrderCard b={active} /> : null}

        {agency.data ? <AgencyCard agency={agency.data} onPress={() => router.push("/agency")} /> : customer.data && !customer.data.assignedAgencyId ? (
          <Card tone="soft" onPress={() => router.push("/(onboarding)/connection")}>
            <Text variant="bodyStrong">No agency linked yet</Text>
            <Text variant="small" tone="muted">
              Link your connection or find the nearest agency →
            </Text>
          </Card>
        ) : null}

        <Row gap={10}>
          {QUICK.map((q) => (
            <Pressable key={q.label} onPress={() => router.push(q.href as any)} style={styles.quick} accessibilityRole="button" accessibilityLabel={q.label}>
              <View style={styles.quickIcon}>
                <Ionicons name={q.icon} size={20} color={t.colors.ink} />
              </View>
              <Text variant="caption" tone="muted" center>
                {q.label}
              </Text>
            </Pressable>
          ))}
        </Row>

        {recent.length ? (
          <View>
            <SectionTitle title="Recent orders" action="See all" onAction={() => router.push("/(customer)/orders")} />
            <View style={{ gap: 10 }}>
              {recent.map((b) => (
                <OrderRow key={b.id} b={b} />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addrPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: t.colors.surface, paddingHorizontal: 12, height: 38, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  bell: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.surface, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  bellDot: { position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.danger, borderWidth: 1.5, borderColor: "#fff" },
  quick: { flex: 1, alignItems: "center", gap: 6 },
  quickIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: t.colors.surface, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
});
