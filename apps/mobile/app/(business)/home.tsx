import { Ionicons } from "@expo/vector-icons";
import { BUSINESS_TYPE_LABELS, formatDateShort, formatINR, WEEKDAY_SHORT } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { AgencyCard } from "@/components/AgencyCard";
import { ActiveOrderCard, OrderRow } from "@/components/OrderCard";
import { StockCard } from "@/components/StockCard";
import { draftItems, useDraft } from "@/features/bookingDraft";
import { useAgency, useBusiness, useMyBookings, useNotifications } from "@/features/hooks";
import { useSession } from "@/lib/session";
import { Avatar, Button, Card, ErrorState, Row, Screen, SectionTitle, SkeletonCard, Text, t } from "@/ui";

const QUICK: { icon: keyof typeof Ionicons.glyphMap; label: string; href: string }[] = [
  { icon: "calendar-outline", label: "Standing orders", href: "/standing-orders" },
  { icon: "receipt-outline", label: "Invoices", href: "/(business)/billing" },
  { icon: "storefront-outline", label: "Outlets", href: "/outlets" },
  { icon: "chatbubble-ellipses-outline", label: "Support", href: "/support" },
];

/** C5 — Business home: stock per outlet, credit, reorder */
export default function HomeScreen() {
  const router = useRouter();
  const user = useSession((s) => s.user);
  const biz = useBusiness();
  const bookings = useMyBookings();
  const agency = useAgency(biz.data?.assignedAgencyId);
  const notifications = useNotifications();
  const draft = useDraft();
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;
  const active = (bookings.data ?? []).filter((b) => !["DELIVERED", "REJECTED", "CANCELLED"].includes(b.status));
  const recent = (bookings.data ?? []).filter((b) => !active.some((a) => a.id === b.id)).slice(0, 3);
  const b = biz.data;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const mainOutlet = b?.outlets.find((o) => o.id === b.defaultOutletId) ?? b?.outlets[0];
  const lowest = b ? [...b.outlets].sort((x, y) => x.daysLeft - y.daysLeft)[0] : undefined;
  const so = b?.standingOrders.find((s) => s.active);

  const reorder = () => {
    if (!b) return;
    draft.reset();
    const qty: Record<string, number> = {};
    b.usualOrder.forEach((i) => (qty[i.cylinderTypeId] = i.qty));
    draft.set({ outletId: lowest?.id ?? b.defaultOutletId, qty, paymentMethod: b.credit.status === "approved" ? "credit" : "upi" });
    router.push("/book/cylinder");
  };

  return (
    <Screen tabBar refreshing={biz.isRefetching} onRefresh={() => { biz.refetch(); bookings.refetch(); }} padded={false}>
      <Row between style={{ paddingHorizontal: 20, paddingTop: 6 }}>
        <Pressable onPress={() => router.push("/(business)/profile")} accessibilityLabel="Profile">
          <Avatar name={b?.name || user?.name || "?"} color={user?.avatarColor} size={40} />
        </Pressable>
        <Pressable onPress={() => router.push("/outlets")} style={styles.addrPill} accessibilityLabel="Outlets">
          <Ionicons name="storefront-outline" size={15} color={t.colors.inkMuted} />
          <Text variant="small" numberOfLines={1} style={{ maxWidth: 190, fontWeight: "600" }}>
            {b ? `${b.outlets.length} outlet${b.outlets.length === 1 ? "" : "s"} · ${mainOutlet?.line2 ?? "Hyderabad"}` : "Outlets"}
          </Text>
          <Ionicons name="chevron-down" size={14} color={t.colors.inkMuted} />
        </Pressable>
        <Pressable onPress={() => router.push("/(business)/notifications")} style={styles.bell} accessibilityLabel={`Alerts, ${unread} unread`}>
          <Ionicons name="notifications-outline" size={20} color={t.colors.ink} />
          {unread ? <View style={styles.bellDot} /> : null}
        </Pressable>
      </Row>

      <View style={{ paddingHorizontal: 20, paddingTop: 18, gap: 14 }}>
        <View>
          <Text variant="title">{b ? b.name : `${greeting} 👋`}</Text>
          <Text variant="small" tone="muted">
            {b ? `${greeting}, ${user?.name?.split(" ")[0]} · ${BUSINESS_TYPE_LABELS[b.type]}${b.gstin ? " · GST registered" : ""}` : ""}
          </Text>
        </View>

        {biz.isLoading ? (
          <SkeletonCard lines={5} />
        ) : biz.isError || !b ? (
          <ErrorState message={(biz.error as Error | undefined)?.message} onRetry={() => biz.refetch()} />
        ) : (
          <>
            {/* stock per outlet */}
            {b.outlets.map((o) => (
              <StockCard key={o.id} outlet={o} onPress={() => router.push(`/outlets?focus=${o.id}`)} compact={b.outlets.length > 1} />
            ))}
            <Button title={active.length ? `Reorder usual · ${b.usualOrder.map((i) => `${i.qty} × ${i.cylinderTypeId === "cyl_19" ? "19 kg" : "47.5 kg"}`).join(" + ")}` : `Order cylinders · ${b.usualOrder.map((i) => `${i.qty} × ${i.cylinderTypeId === "cyl_19" ? "19 kg" : "47.5 kg"}`).join(" + ")}`} size="lg" icon="flame" onPress={reorder} />

            {active.map((a) => (
              <ActiveOrderCard key={a.id} b={a} />
            ))}

            {/* credit */}
            <Card onPress={() => router.push("/(business)/billing")} tone={b.creditOverdue > 0 ? "soft" : "surface"}>
              <Row between>
                <View style={{ flex: 1 }}>
                  <Text variant="label" tone="faint">
                    {b.credit.status === "approved" ? `Credit account · net-${b.credit.termDays}` : b.credit.status === "requested" ? "Credit account" : "Payments"}
                  </Text>
                  {b.credit.status === "approved" ? (
                    <>
                      <Text variant="h3" tone={b.creditOverdue > 0 ? "danger" : "ink"}>
                        {b.creditOverdue > 0 ? `${formatINR(b.creditOverdue, { decimals: false })} overdue` : `${formatINR(b.creditOutstanding, { decimals: false })} outstanding`}
                      </Text>
                      <Text variant="caption" tone="muted">
                        {formatINR(b.creditAvailable, { decimals: false })} of {formatINR(b.credit.limit, { decimals: false })} available
                      </Text>
                    </>
                  ) : b.credit.status === "requested" ? (
                    <>
                      <Text variant="h3">Awaiting approval</Text>
                      <Text variant="caption" tone="muted">
                        GasSetu is reviewing your credit request
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text variant="h3">Pay per order</Text>
                      <Text variant="caption" tone="muted">
                        UPI, card, netbanking or cash · request credit terms from Billing
                      </Text>
                    </>
                  )}
                </View>
                <View style={styles.creditIcon}>
                  <Ionicons name={b.credit.status === "approved" ? "card" : "card-outline"} size={20} color={t.colors.goldDark} />
                </View>
              </Row>
              {b.credit.status === "approved" ? (
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.min(100, (b.creditOutstanding / Math.max(1, b.credit.limit)) * 100)}%`, backgroundColor: b.creditOverdue > 0 ? t.colors.primary : t.colors.gold }]} />
                </View>
              ) : null}
            </Card>

            {/* standing order */}
            <Card onPress={() => router.push("/standing-orders")}>
              <Row gap={12}>
                <View style={[styles.creditIcon, { backgroundColor: t.colors.surfaceAlt }]}>
                  <Ionicons name="calendar-outline" size={20} color={t.colors.ink} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{so ? `Standing order · ${so.days.map((d) => WEEKDAY_SHORT[d]).join(", ")}` : "Set up a standing order"}</Text>
                  <Text variant="caption" tone="muted">
                    {so ? `${so.items.map((i) => `${i.qty} × ${i.cylinderTypeId === "cyl_19" ? "19 kg" : "47.5 kg"}`).join(" + ")} · next ${so.nextRunAt ? formatDateShort(so.nextRunAt) : "—"}` : "Auto-order your usual on fixed days, before opening"}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.colors.inkFaint} />
              </Row>
            </Card>

            {agency.data ? <AgencyCard agency={agency.data} onPress={() => router.push("/agency")} /> : !b.assignedAgencyId ? (
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
                <SectionTitle title="Recent orders" action="See all" onAction={() => router.push("/(business)/orders")} />
                <View style={{ gap: 10 }}>
                  {recent.map((r) => (
                    <OrderRow key={r.id} b={r} />
                  ))}
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  addrPill: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: t.colors.surface, paddingHorizontal: 12, height: 38, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  bell: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.colors.surface, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  bellDot: { position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.primary, borderWidth: 1.5, borderColor: "#fff" },
  quick: { flex: 1, alignItems: "center", gap: 6 },
  quickIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: t.colors.surface, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  creditIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: t.colors.goldSoft, alignItems: "center", justifyContent: "center" },
  track: { height: 6, borderRadius: 3, backgroundColor: t.colors.border, marginTop: 12, overflow: "hidden" },
  fill: { height: 6, borderRadius: 3 },
});
