import { Ionicons } from "@expo/vector-icons";
import type { DeliveryFailReason } from "@gassetu/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { useBookingAction } from "@/features/hooks";
import { Button, Input, Screen, Text, t } from "@/ui";

const REASONS: { key: DeliveryFailReason; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "customer_not_home", label: "Customer not at home", sub: "No answer at door / phone", icon: "home-outline" },
  { key: "wrong_address", label: "Wrong address", sub: "Couldn't locate the address", icon: "map-outline" },
  { key: "refused", label: "Customer refused", sub: "Didn't want the cylinder", icon: "hand-left-outline" },
  { key: "other", label: "Other", sub: "Describe in notes", icon: "ellipsis-horizontal-circle-outline" },
];

/** D5 — Failed delivery */
export default function FailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const action = useBookingAction();
  const [reason, setReason] = useState<DeliveryFailReason | null>(null);
  const [notes, setNotes] = useState("");
  const submit = async () => {
    if (!reason) return;
    try {
      await action.mutateAsync({ id: id!, action: "fail", body: { reason, notes } });
      toast.info("Marked as failed", "The order is back in the agency queue for rescheduling.");
      router.replace("/(delivery)/home");
    } catch (e) {
      toast.error("Couldn't update", (e as Error).message);
    }
  };
  return (
    <Screen title="Couldn't deliver" subtitle="The agency will reschedule this drop" back keyboard footer={<Button title="Mark as failed" variant="danger" icon="close-circle" size="lg" disabled={!reason || (reason === "other" && notes.trim().length < 3)} loading={action.isPending} onPress={submit} />}>
      <View style={{ gap: 10 }}>
        {REASONS.map((r) => {
          const active = reason === r.key;
          return (
            <Pressable key={r.key} onPress={() => setReason(r.key)} accessibilityRole="radio" accessibilityState={{ selected: active }} style={[styles.opt, active && styles.optActive]}>
              <Ionicons name={r.icon} size={20} color={active ? t.colors.danger : t.colors.inkMuted} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{r.label}</Text>
                <Text variant="caption" tone="muted">
                  {r.sub}
                </Text>
              </View>
              <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? t.colors.danger : t.colors.inkFaint} />
            </Pressable>
          );
        })}
        <Input label="Notes (optional)" value={notes} onChangeText={setNotes} placeholder="e.g. Called twice, no answer" multiline style={{ minHeight: 70, textAlignVertical: "top" }} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  opt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.border },
  optActive: { borderColor: t.colors.danger, backgroundColor: "#FFF8F8" },
});
