import { Ionicons } from "@expo/vector-icons";
import { formatDate, formatDateShort } from "@gassetu/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { GasGauge } from "@/components/GasGauge";
import { toast } from "@/components/Toast";
import { useCustomer, useUpdateReminder, useUsage } from "@/features/hooks";
import { Card, Divider, ErrorState, KeyValue, Row, Screen, SkeletonCard, Text, t } from "@/ui";

const DAY = 86_400_000;

/** C13 — Reminders & Auto-book */
export default function RemindersScreen() {
  const customer = useCustomer();
  const usage = useUsage();
  const update = useUpdateReminder();
  const c = customer.data;
  const [offset, setOffset] = useState<number | null>(null);
  if (customer.isLoading || usage.isLoading) {
    return (
      <Screen title="Reminders" back>
        <SkeletonCard lines={6} />
      </Screen>
    );
  }
  if (!c || !usage.data) {
    return (
      <Screen title="Reminders" back>
        <ErrorState onRetry={() => customer.refetch()} />
      </Screen>
    );
  }
  const r = c.reminder;
  const base = usage.data.lastDeliveredAt ? new Date(usage.data.lastDeliveredAt).getTime() : Date.now();
  const suggested = new Date(base + (usage.data.cycleDays - 2) * DAY);
  const options = [-3, 0, 3, 7].map((d) => new Date(suggested.getTime() + d * DAY));
  const set = (patch: Partial<typeof r>, msg?: string) =>
    update
      .mutateAsync(patch)
      .then(() => {
        if (msg) toast.success(msg);
      })
      .catch((e) => toast.error("Couldn't save", e.message));

  return (
    <Screen title="Reminders & Auto-book" back>
      <Card>
        <Text variant="label" tone="faint">
          Estimated usage
        </Text>
        <View style={{ alignItems: "center", marginTop: 6 }}>
          <GasGauge pct={usage.data.pct} daysLeft={usage.data.daysLeft} size={200} />
        </View>
        <KeyValue k="Average refill cycle" v={`${usage.data.cycleDays} days`} />
        <KeyValue k="Based on" v={`last ${Math.min(3, usage.data.deliveries)} deliveries`} />
        <KeyValue k="Last delivered" v={usage.data.lastDeliveredAt ? formatDate(usage.data.lastDeliveredAt) : "—"} />
        <KeyValue k="Expected to run out" v={formatDateShort(new Date(base + usage.data.cycleDays * DAY).toISOString())} tone="danger" />
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Row between>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">Refill reminder</Text>
            <Text variant="small" tone="muted">
              {r.enabled && r.nextDate ? `Next reminder ${formatDate(r.nextDate)}` : "Get a nudge before you run out"}
            </Text>
          </View>
          <Switch value={r.enabled} onValueChange={(v) => set({ enabled: v, nextDate: v ? (r.nextDate ?? suggested.toISOString()) : r.nextDate }, v ? "Reminder on" : "Reminder off")} trackColor={{ true: t.colors.primary }} accessibilityLabel="Refill reminder" />
        </Row>
        {r.enabled ? (
          <>
            <Divider />
            <Text variant="caption" tone="muted" style={{ marginBottom: 8 }}>
              Remind me on
            </Text>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              {options.map((d, i) => {
                const iso = d.toISOString();
                const active = r.nextDate ? r.nextDate.slice(0, 10) === iso.slice(0, 10) : i === 1;
                return (
                  <Pressable key={iso} onPress={() => { setOffset(i); set({ nextDate: iso }, `Reminder set for ${formatDateShort(iso)}`); }} style={[styles.date, active && styles.dateActive]} accessibilityRole="radio" accessibilityState={{ selected: active }}>
                    <Text variant="small" style={{ color: active ? "#fff" : t.colors.ink, fontWeight: "600" }}>
                      {formatDateShort(iso)}
                    </Text>
                    {i === 1 ? (
                      <Text variant="caption" style={{ color: active ? "#FFD9C2" : t.colors.inkFaint }}>
                        suggested
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </Row>
          </>
        ) : null}
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Row between>
          <View style={{ flex: 1 }}>
            <Row gap={6}>
              <Text variant="bodyStrong">Auto-book</Text>
              <View style={styles.beta}>
                <Text variant="caption" style={{ color: t.colors.primaryDark }}>
                  Smart
                </Text>
              </View>
            </Row>
            <Text variant="small" tone="muted">
              Book automatically on the reminder date with your saved payment method{c.type === "domestic" ? " (within refill rules)" : ""}.
            </Text>
          </View>
          <Switch value={r.autoBook} onValueChange={(v) => set({ autoBook: v, enabled: v ? true : r.enabled }, v ? "Auto-book on — we'll book for you" : "Auto-book off")} trackColor={{ true: t.colors.primary }} accessibilityLabel="Auto-book" />
        </Row>
        {r.autoBook ? (
          <Row gap={8} style={{ marginTop: 10, backgroundColor: t.colors.successSoft, padding: 10, borderRadius: 12 }}>
            <Ionicons name="checkmark-circle" size={18} color={t.colors.success} />
            <Text variant="caption" style={{ color: t.colors.success, flex: 1 }}>
              We'll place a 14.2 kg standard booking on {r.nextDate ? formatDateShort(r.nextDate) : "the reminder date"} and pay via UPI (mock). You can cancel anytime.
            </Text>
          </Row>
        ) : null}
      </Card>
      {offset !== null ? null : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  date: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: t.colors.border, backgroundColor: t.colors.surface, alignItems: "center" },
  dateActive: { backgroundColor: t.colors.navy, borderColor: t.colors.navy },
  beta: { backgroundColor: t.colors.primarySoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
});
