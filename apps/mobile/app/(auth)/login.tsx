import { Ionicons } from "@expo/vector-icons";
import { phoneSchema } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { ApiError, post } from "@/lib/api";
import { DEMO_MODE, DEMO_OTP } from "@/lib/config";
import { PlatformApiError, requestTenantOtp, verifyTenantOtp } from "@/lib/platform-api";
import { mockAuth } from "@/lib/providers";
import { useSession } from "@/lib/session";
import { Button, Card, Input, OtpInput, Screen, Text, t } from "@/ui";

const DEMO_LOGINS = [
  { label: "Imran · Al-Madina Tiffin Centre", phone: "9000000001" },
  { label: "Fatima · Star Kitchens (cloud)", phone: "9000000002" },
  { label: "Ramesh · delivery partner", phone: "9000000003" },
];

/** Registered-business login. Prototype personas appear only when demo mode is explicitly enabled. */
export default function LoginScreen() {
  const router = useRouter();
  const loginDemo = useSession((state) => state.login);
  const loginTenant = useSession((state) => state.loginTenant);
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [challengePublicId, setChallengePublicId] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [localDebugCode, setLocalDebugCode] = useState<string | null>(null);
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
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    setError(null);
    setBusy(true);
    try {
      if (DEMO_MODE) {
        await mockAuth.requestOtp(phone);
        setChallengePublicId(null);
        setDestination(`+91 ${phone}`);
        setLocalDebugCode(DEMO_OTP);
        setTimer(30);
      } else {
        const response = await requestTenantOtp(`+91${phone}`);
        setChallengePublicId(response.challengePublicId);
        setDestination(response.destination);
        setLocalDebugCode(response.localDebugCode ?? null);
        setTimer(response.resendAfterSeconds);
      }
      setStep("otp");
      setOtp("");
      toast.info("OTP requested", "If this number is registered, the code will arrive by SMS shortly.");
    } catch (caught) {
      setError(caught instanceof PlatformApiError || caught instanceof ApiError ? caught.message : "Could not request an OTP. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const verify = async (code = otp) => {
    if (code.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (DEMO_MODE) {
        const response = await post("/auth/verify", { phone, otp: code });
        loginDemo(response.token, response.user, { isNew: response.isNew, hasProfile: !!response.profile, hasAgency: !!response.profile?.assignedAgencyId });
        if (response.user.role === "delivery") router.replace("/(delivery)/home");
        else if (!response.profile) router.replace("/(onboarding)/profile");
        else if (!response.profile.assignedAgencyId) router.replace("/(onboarding)/connection");
        else router.replace("/(business)/home");
        return;
      }

      if (!challengePublicId) throw new PlatformApiError("missing_challenge", "Request a new OTP before continuing.", 400);
      const response = await verifyTenantOtp(challengePublicId, code);
      if (response.status !== "authenticated") {
        throw new PlatformApiError("privileged_login_not_supported", "This account requires the admin sign-in flow.", 403);
      }
      await loginTenant(response.accessToken, response.user, response.tenants);
      router.replace(response.tenants.length > 1 ? "/(auth)/select-tenant" : "/(tenant)/home");
    } catch (caught) {
      setError(caught instanceof PlatformApiError || caught instanceof ApiError ? caught.message : "Could not verify the OTP. Try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (step === "otp" && otp.length === 6 && !busy) void verify(otp);
    // Verification intentionally starts as soon as the sixth digit is entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp]);

  const changeNumber = () => {
    setStep("phone");
    setOtp("");
    setChallengePublicId(null);
    setDestination(null);
    setLocalDebugCode(null);
    setError(null);
  };

  return (
    <Screen back keyboard>
      {step === "phone" ? (
        <>
          <Text variant="title" style={{ marginTop: 12 }}>Sign in to your business</Text>
          <Text variant="body" tone="muted" style={{ marginTop: 6, marginBottom: 24 }}>
            Use the mobile number registered for your restaurant, hotel, or commercial account.
          </Text>
          <Input
            label="Registered mobile number"
            value={phone}
            onChangeText={(value) => setPhone(value.replace(/\D/g, "").slice(0, 10))}
            keyboardType="number-pad"
            placeholder="98765 43210"
            error={error}
            autoFocus
            left={<Text variant="bodyStrong" tone="muted">+91</Text>}
            returnKeyType="done"
            onSubmitEditing={sendOtp}
          />
          <Button title="Send OTP" onPress={sendOtp} loading={busy} style={{ marginTop: 20 }} size="lg" />

          {DEMO_MODE ? (
            <Card tone="alt" style={{ marginTop: 28 }}>
              <Text variant="label" tone="faint" style={{ marginBottom: 8 }}>Explicit demo mode</Text>
              {DEMO_LOGINS.map((demo) => (
                <Pressable key={demo.phone} onPress={() => setPhone(demo.phone)} accessibilityRole="button" style={styles.demoRow}>
                  <Ionicons name="storefront-outline" size={20} color={t.colors.inkMuted} />
                  <Text variant="small" style={{ flex: 1 }}>{demo.label}</Text>
                  <Text variant="small" tone="muted">{demo.phone}</Text>
                </Pressable>
              ))}
              <Text variant="caption" tone="faint" style={{ marginTop: 6 }}>Demo OTP: {DEMO_OTP}</Text>
            </Card>
          ) : null}
        </>
      ) : (
        <>
          <Text variant="title" style={{ marginTop: 12 }}>Enter the OTP</Text>
          <Text variant="body" tone="muted" style={{ marginTop: 6, marginBottom: 24 }}>
            Sent to {destination ?? `+91 ${phone}`}.{" "}
            <Text variant="body" tone="primary" onPress={changeNumber}>Change</Text>
          </Text>
          <OtpInput value={otp} onChange={setOtp} error={error} />
          <Button title="Verify & continue" onPress={() => verify()} loading={busy} disabled={otp.length !== 6} style={{ marginTop: 24 }} size="lg" />
          <View style={{ alignItems: "center", marginTop: 16 }}>
            {timer > 0 ? (
              <Text variant="small" tone="muted">Resend OTP in {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}</Text>
            ) : (
              <Pressable onPress={sendOtp} accessibilityRole="button">
                <Text variant="small" tone="primary" style={{ fontWeight: "600" }}>Resend OTP</Text>
              </Pressable>
            )}
          </View>
          {localDebugCode ? (
            <Text variant="caption" tone="faint" center style={{ marginTop: 24 }}>Local development OTP: {localDebugCode}</Text>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ demoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 } });
