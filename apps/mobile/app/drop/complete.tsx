import { Ionicons } from "@expo/vector-icons";
import { formatINR } from "@gassetu/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { useBooking, useBookingAction } from "@/features/hooks";
import { ApiError } from "@/lib/api";
import { Button, Card, ErrorState, KeyValue, OtpInput, Row, Screen, SkeletonCard, Text, t } from "@/ui";

/** D4 — Complete delivery: OTP, cylinders handed over, empties collected, COD cash */
export default function CompleteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useBooking(id);
  const action = useBookingAction();
  const [otp, setOtp] = useState("");
  const [cash, setCash] = useState(false);
  const [empties, setEmpties] = useState<number | null>(null);
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
  const emptiesVal = empties ?? b.emptiesToCollect;
  const submit = async () => {
    setError(null);
    try {
      await action.mutateAsync({ id: b.id, action: "complete", body: { otp, cashCollected: cash, emptiesCollected: emptiesVal } });
      toast.success("Delivered ✅", `${b.businessName} · ${b.cylinders} cylinders in, ${emptiesVal} empties out.`);
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
    <Screen title="Complete delivery" subtitle={`${b.businessName} · ${b.outlet.label}`} back keyboard footer={<Button title="Confirm delivery" icon="checkmark-done" size="lg" loading={action.isPending} disabled={otp.length !== 4 || (cod && !cash)} onPress={submit} />}>
      <View style={{ gap: 14 }}>
        <Card>
          <Text variant="label" tone="faint" style={{ marginBottom: 6 }}>
            Handing over
          </Text>
          {b.items.map((i) => (
            <KeyValue key={i.cylinderTypeId} k={i.name} v={`${i.qty} cylinders`} strong />
          ))}
        </Card>
        <Card>
          <Text variant="bodyStrong">Outlet's delivery OTP</Text>
          <Text variant="caption" tone="muted" style={{ marginBottom: 14 }}>
            Ask the kitchen manager for the 4-digit code in their app.
          </Text>
          <OtpInput length={4} value={otp} onChange={(v) => { setOtp(v); setError(null); }} error={error} />
        </Card>

        <Card>
          <Row between>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">Empty cylinders collected</Text>
              <Text variant="caption" tone="muted">
                Outlet said {b.emptiesToCollect} — adjust if different
              </Text>
            </View>
            <Row gap={10}>
              <Pressable onPress={() => setEmpties(Math.max(0, emptiesVal - 1))} style={styles.step} accessibilityLabel="Fewer empties">
                <Ionicons name="remove" size={18} color={t.colors.ink} />
              </Pressable>
              <Text variant="h2" style={{ minWidth: 26, textAlign: "center" }}>
                {emptiesVal}
              </Text>
              <Pressable onPress={() => setEmpties(Math.min(50, emptiesVal + 1))} style={[styles.step, styles.stepPrimary]} accessibilityLabel="More empties">
                <Ionicons name="add" size={18} color="#fff" />
              </Pressable>
            </Row>
          </Row>
        </Card>

        {cod ? (
          <Card style={{ borderColor: cash ? t.colors.success : t.colors.gold }}>
            <Row between>
              <View>
                <Text variant="label" tone="faint">
                  Cash on delivery
                </Text>
                <Text variant="title">{formatINR(b.charges.total)}</Text>
              </View>
              <Ionicons name="cash" size={30} color={t.colors.goldDark} />
            </Row>
            <Check value={cash} onChange={setCash} label="Cash collected from outlet" icon="cash-outline" sub="Required before confirming" />
          </Card>
        ) : (
          <Row gap={8} style={{ backgroundColor: t.colors.successSoft, padding: 12, borderRadius: 14 }}>
            <Ionicons name="checkmark-circle" size={18} color={t.colors.success} />
            <Text variant="small" style={{ color: t.colors.success }}>
              {b.payment.method === "credit" ? "On credit · invoice raised on delivery, nothing to collect" : "Prepaid · nothing to collect"}
            </Text>
          </Row>
        )}

        <Card>
          <Check value={photo} onChange={setPhoto} label="Delivery challan photo" icon="camera-outline" sub={photo ? "Photo attached (mock)" : "Optional — signed challan"} />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  check: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  step: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.colors.border },
  stepPrimary: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
});
