import { Ionicons } from "@expo/vector-icons";
import { formatINR } from "@gassetu/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { useBooking, useBookingAction } from "@/features/hooks";
import { ApiError } from "@/lib/api";
import { Button, Card, ErrorState, OtpInput, Row, Screen, SkeletonCard, Text, t } from "@/ui";

/** D4 — Complete delivery: OTP, COD cash, empty collected, photo placeholder */
export default function CompleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useBooking(id);
  const action = useBookingAction();
  const [otp, setOtp] = useState("");
  const [cash, setCash] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [photo, setPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const b = q.data;
  if (q.isLoading) {
    return (
      <Screen title="Complete delivery" back>
        <SkeletonCard />
      </Screen>
    );
  }
  if (!b) {
    return (
      <Screen title="Complete delivery" back>
        <ErrorState onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  const cod = b.payment.method === "cod";
  const submit = async () => {
    setError(null);
    try {
      await action.mutateAsync({ id: b.id, action: "complete", body: { otp, cashCollected: cash, emptyCollected: empty } });
      toast.success("Delivered ✅", `${b.customerName}'s order is complete.`);
      router.replace("/(delivery)/home");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    }
  };

  const Check = ({ value, onChange, label, sub, icon }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string; icon: keyof typeof Ionicons.glyphMap }) => (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="checkbox" accessibilityState={{ checked: value }} style={styles.check}>
      <Ionicons name={icon} size={20} color={t.colors.inkMuted} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {sub ? (
          <Text variant="caption" tone="muted">
            {sub}
          </Text>
        ) : null}
      </View>
      <Ionicons name={value ? "checkbox" : "square-outline"} size={24} color={value ? t.colors.success : t.colors.inkFaint} />
    </Pressable>
  );

  return (
    <Screen title="Complete delivery" subtitle={`${b.customerName} · ${b.code}`} back keyboard footer={<Button title="Confirm delivery" icon="checkmark-done" size="lg" loading={action.isPending} disabled={otp.length !== 4 || (cod && !cash)} onPress={submit} />}>
      <View style={{ gap: 14 }}>
        <Card>
          <Text variant="bodyStrong">Customer's delivery OTP</Text>
          <Text variant="caption" tone="muted" style={{ marginBottom: 14 }}>
            Ask the customer for the 4-digit code shown in their app.
          </Text>
          <OtpInput length={4} value={otp} onChange={(v) => { setOtp(v); setError(null); }} error={error} />
        </Card>

        {cod ? (
          <Card style={{ borderColor: cash ? t.colors.success : t.colors.warning }}>
            <Row between>
              <View>
                <Text variant="label" tone="faint">
                  Cash on delivery
                </Text>
                <Text variant="title">{formatINR(b.charges.total)}</Text>
              </View>
              <Ionicons name="cash" size={30} color="#9A6B00" />
            </Row>
            <Check value={cash} onChange={setCash} label="Cash collected from customer" icon="cash-outline" sub="Required before confirming" />
          </Card>
        ) : (
          <Row gap={8} style={{ backgroundColor: t.colors.successSoft, padding: 12, borderRadius: 14 }}>
            <Ionicons name="checkmark-circle" size={18} color={t.colors.success} />
            <Text variant="small" style={{ color: t.colors.success }}>
              Prepaid · nothing to collect
            </Text>
          </Row>
        )}

        <Card>
          <Check value={empty} onChange={setEmpty} label="Empty cylinder collected" icon="repeat-outline" sub="Adds to agency's empty stock" />
          <Check value={photo} onChange={setPhoto} label="Delivery photo" icon="camera-outline" sub={photo ? "Photo attached (mock)" : "Optional — tap to attach"} />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ check: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 } });
