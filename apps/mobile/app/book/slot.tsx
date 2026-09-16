import { Ionicons } from "@expo/vector-icons";
import { formatINR, type SlotType } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useDraft } from "@/features/bookingDraft";
import { Button, Row, Screen, Text, t } from "@/ui";

const SLOTS: { key: SlotType; title: string; sub: string; icon: keyof typeof Ionicons.glyphMap; extra?: number; tag?: string }[] = [
  { key: "standard", title: "Standard", sub: "Delivered within 1–2 days", icon: "calendar-outline" },
  { key: "tomorrow_morning", title: "Tomorrow · Morning", sub: "8:00 AM – 12:00 PM", icon: "sunny-outline" },
  { key: "tomorrow_evening", title: "Tomorrow · Evening", sub: "4:00 PM – 8:00 PM", icon: "moon-outline" },
  { key: "express", title: "Express · Today", sub: "Within 3 hours, priority dispatch", icon: "flash", extra: 49, tag: "Fastest" },
];

/** C7 — Delivery slot */
export default function SlotScreen() {
  const router = useRouter();
  const draft = useDraft();
  return (
    <Screen title="Delivery slot" subtitle="Step 2 of 3" back footer={<Button title="Review & pay" size="lg" iconRight="arrow-forward" onPress={() => router.push("/book/review")} />}>
      <View style={{ gap: 10 }}>
        {SLOTS.map((s) => {
          const active = draft.slot === s.key;
          return (
            <Pressable key={s.key} onPress={() => draft.set({ slot: s.key })} accessibilityRole="radio" accessibilityState={{ selected: active }} style={[styles.opt, active && styles.optActive, s.key === "express" && styles.express]}>
              <View style={[styles.icon, s.key === "express" && { backgroundColor: t.colors.primary }]}>
                <Ionicons name={s.icon} size={20} color={s.key === "express" ? "#fff" : t.colors.ink} />
              </View>
              <View style={{ flex: 1 }}>
                <Row gap={8}>
                  <Text variant="bodyStrong">{s.title}</Text>
                  {s.tag ? (
                    <View style={styles.tag}>
                      <Text variant="caption" style={{ color: t.colors.primaryDark }}>
                        {s.tag}
                      </Text>
                    </View>
                  ) : null}
                </Row>
                <Text variant="caption" tone="muted">
                  {s.sub}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Text variant="small" style={{ fontWeight: "600" }}>
                  {s.extra ? `+ ${formatINR(s.extra, { decimals: false })}` : "Free"}
                </Text>
                <Ionicons name={active ? "checkmark-circle" : "ellipse-outline"} size={20} color={active ? t.colors.primary : t.colors.inkFaint} />
              </View>
            </Pressable>
          );
        })}
      </View>
      {draft.slot !== "express" ? (
        <Pressable onPress={() => draft.set({ slot: "express" })} style={styles.upsell} accessibilityRole="button">
          <Ionicons name="flash" size={18} color={t.colors.primary} />
          <Text variant="small" style={{ flex: 1 }}>
            Running low? <Text variant="small" style={{ fontWeight: "700" }}>Get it today with Express</Text> for just ₹49.
          </Text>
          <Ionicons name="chevron-forward" size={16} color={t.colors.primary} />
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  opt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.border },
  optActive: { borderColor: t.colors.primary, backgroundColor: "#FFFAF7" },
  express: {},
  icon: { width: 42, height: 42, borderRadius: 14, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  tag: { backgroundColor: t.colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  upsell: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: t.colors.primarySoft },
});
