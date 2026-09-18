import { Ionicons } from "@expo/vector-icons";
import { phoneSchema } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { ApiError, post } from "@/lib/api";
import { DEMO_OTP } from "@/lib/config";
import { mockAuth } from "@/lib/providers";
import { useSession } from "@/lib/session";
import { Button, Card, Input, OtpInput, Screen, Text, t } from "@/ui";

const DEMO_LOGINS = [
  { label: "Imran · Al-Madina Tiffin Centre", phone: "9000000001" },
  { label: "Fatima · Star Kitchens (cloud)", phone: "9000000002" },
  { label: "Ramesh · delivery partner", phone: "9000000003" },
];

/** C2 — Login / OTP */
export default function LoginScreen() {
  const router = useRouter();
  const login = useSession((s) => s.login);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (!timer) return;
    const id = setTimeout(() => setTimer(timer - 1), 1000);
    return () => clearTimeout(id);
  }, [timer]);

  const sendOtp = async () => {
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setError(null);
    setBusy(true);
    try {
      await mockAuth.requestOtp(phone);
      setStep("otp");
      setOtp("");
      setTimer(30);
      toast.info("OTP sent", `Demo OTP is ${DEMO_OTP}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code = otp) => {
    if (code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post("/auth/verify", { phone, otp: code });
      login(r.token, r.user, { isNew: r.isNew, hasProfile: !!r.profile, hasAgency: !!r.profile?.assignedAgencyId });
      if (r.user.role === "delivery") router.replace("/(delivery)/home");
      else if (!r.profile) router.replace("/(onboarding)/profile");
      else if (!r.profile.assignedAgencyId) router.replace("/(onboarding)/connection");
      else router.replace("/(business)/home");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not verify. Try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (step === "otp" && otp.length === 6) verify(otp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  return (
    <Screen back keyboard>
      {step === "phone" ? (
        <>
          <Text variant="title" style={{ marginTop: 12 }}>
            Enter your mobile number
          </Text>
          <Text variant="body" tone="muted" style={{ marginTop: 6, marginBottom: 24 }}>
            We'll send a one-time password to verify it's you.
          </Text>
          <Input
            label="Mobile number"
            value={phone}
            onChangeText={(v) => setPhone(v.replace(/\D/g, "").slice(0, 10))}
            keyboardType="number-pad"
            placeholder="98765 43210"
            error={error}
            autoFocus
            left={
              <Text variant="bodyStrong" tone="muted">
                +91
              </Text>
            }
            returnKeyType="done"
            onSubmitEditing={sendOtp}
          />
          <Button title="Send OTP" onPress={sendOtp} loading={busy} style={{ marginTop: 20 }} size="lg" />

          <Card tone="alt" style={{ marginTop: 28 }}>
            <Text variant="label" tone="faint" style={{ marginBottom: 8 }}>
              Demo logins
            </Text>
            {DEMO_LOGINS.map((d) => (
              <Pressable key={d.phone} onPress={() => setPhone(d.phone)} accessibilityRole="button" style={styles.demoRow}>
                <Ionicons name="storefront-outline" size={20} color={t.colors.inkMuted} />
                <Text variant="small" style={{ flex: 1 }}>
                  {d.label}
                </Text>
                <Text variant="small" tone="muted">
                  {d.phone}
                </Text>
              </Pressable>
            ))}
            <Text variant="caption" tone="faint" style={{ marginTop: 6 }}>
              Any other number registers a new business. OTP is always {DEMO_OTP}.
            </Text>
          </Card>
        </>
      ) : (
        <>
          <Text variant="title" style={{ marginTop: 12 }}>
            Enter the OTP
          </Text>
          <Text variant="body" tone="muted" style={{ marginTop: 6, marginBottom: 24 }}>
            Sent to +91 {phone}.{" "}
            <Text variant="body" tone="primary" onPress={() => setStep("phone")}>
              Change
            </Text>
          </Text>
          <OtpInput value={otp} onChange={setOtp} error={error} />
          <Button title="Verify & continue" onPress={() => verify()} loading={busy} disabled={otp.length !== 6} style={{ marginTop: 24 }} size="lg" />
          <View style={{ alignItems: "center", marginTop: 16 }}>
            {timer > 0 ? (
              <Text variant="small" tone="muted">
                Resend OTP in 0:{String(timer).padStart(2, "0")}
              </Text>
            ) : (
              <Pressable onPress={sendOtp} accessibilityRole="button">
                <Text variant="small" tone="primary" style={{ fontWeight: "600" }}>
                  Resend OTP
                </Text>
              </Pressable>
            )}
          </View>
          <Text variant="caption" tone="faint" center style={{ marginTop: 24 }}>
            Demo OTP: {DEMO_OTP}
          </Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ demoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 } });
