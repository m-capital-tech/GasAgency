import { Ionicons } from "@expo/vector-icons";
import { phoneSchema } from "@gassetu/shared";
import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { ApiError, post } from "@/lib/api";
import { DEMO_MODE, DEMO_OTP } from "@/lib/config";
import {
  beginMfaEnrollment,
  confirmMfaEnrollment,
  PlatformApiError,
  requestTenantOtp,
  type MfaEnrollmentResponse,
  type MfaAuthenticationResponse,
  verifyMfa,
  verifyTenantOtp,
} from "@/lib/platform-api";
import { mockAuth } from "@/lib/providers";
import { useSession } from "@/lib/session";
import { Button, Card, Input, OtpInput, Screen, Text, t } from "@/ui";

const DEMO_LOGINS = [
  { label: "Imran · Al-Madina Tiffin Centre", phone: "9000000001" },
  { label: "Fatima · Star Kitchens (cloud)", phone: "9000000002" },
  { label: "Ramesh · delivery partner", phone: "9000000003" },
];

type LoginStep = "phone" | "otp" | "mfa-enroll" | "mfa-verify" | "recovery";

/** Registered-business login. Prototype personas appear only when demo mode is explicitly enabled. */
export default function LoginScreen() {
  const router = useRouter();
  const submitLock = useRef(false);
  const loginDemo = useSession((state) => state.login);
  const loginTenant = useSession((state) => state.loginTenant);
  const [step, setStep] = useState<LoginStep>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [challengePublicId, setChallengePublicId] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [localDebugCode, setLocalDebugCode] = useState<string | null>(null);
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaEnrollment, setMfaEnrollment] = useState<MfaEnrollmentResponse | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [selectTenantAfterRecovery, setSelectTenantAfterRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    if (step !== "otp" || timer <= 0) return;
    const id = setTimeout(() => setTimer((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => clearTimeout(id);
  }, [step, timer]);

  const routeAfterAuthentication = (tenants: MfaAuthenticationResponse["tenants"], firstLogin: boolean) => {
    router.replace(tenants.length > 1 ? "/(auth)/select-tenant" : firstLogin ? "/(tenant)/registration-summary" : "/(tenant)/home");
  };

  const reset = (message?: string) => {
    setStep("phone");
    setOtp("");
    setChallengePublicId(null);
    setDestination(null);
    setLocalDebugCode(null);
    setMfaTicket(null);
    setMfaEnrollment(null);
    setMfaCode("");
    setRecoveryCodes([]);
    setSelectTenantAfterRecovery(false);
    setTimer(0);
    setError(message ?? null);
  };

  const sendOtp = async () => {
    if (submitLock.current) return;
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) return setError(parsed.error.issues[0]!.message);
    submitLock.current = true;
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
      submitLock.current = false;
      setBusy(false);
    }
  };

  const verifyOtp = async (code = otp) => {
    if (code.length !== 6 || submitLock.current) return;
    submitLock.current = true;
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
      if (response.status === "authenticated") {
        if (!response.tenants.length) throw new PlatformApiError("tenant_access_required", "This account has no active business access in the mobile app.", 403);
        await loginTenant(response.accessToken, response.user, response.tenants, response.firstLogin);
        routeAfterAuthentication(response.tenants, response.firstLogin);
        return;
      }

      setMfaTicket(response.mfaTicket);
      setOtp("");
      setLocalDebugCode(null);
      setTimer(0);
      if (response.status === "mfa_enrollment_required") {
        const enrollment = await beginMfaEnrollment(response.mfaTicket);
        setMfaEnrollment(enrollment);
        setStep("mfa-enroll");
      } else {
        setStep("mfa-verify");
      }
    } catch (caught) {
      if (caught instanceof PlatformApiError && caught.code === "invalid_otp") {
        setError("This code has expired or was already used. Enter the current SMS code, or resend once and wait for that code.");
      } else {
        setError(caught instanceof PlatformApiError || caught instanceof ApiError ? caught.message : "Could not verify the OTP. Try again.");
      }
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  const verifyAuthenticator = async () => {
    if (!mfaTicket || mfaCode.length < 6 || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = step === "mfa-enroll" && mfaEnrollment
        ? await confirmMfaEnrollment(mfaTicket, mfaEnrollment.factorPublicId, mfaCode)
        : await verifyMfa(mfaTicket, mfaCode);
      if (!response.tenants.length) throw new PlatformApiError("tenant_access_required", "This account has no active business access in the mobile app.", 403);
      await loginTenant(response.accessToken, response.user, response.tenants, false);
      if (response.recoveryCodes?.length) {
        setRecoveryCodes(response.recoveryCodes);
        setSelectTenantAfterRecovery(response.tenants.length > 1);
        setMfaTicket(null);
        setMfaEnrollment(null);
        setMfaCode("");
        setStep("recovery");
      } else {
        routeAfterAuthentication(response.tenants, false);
      }
    } catch (caught) {
      if (caught instanceof PlatformApiError && caught.code === "invalid_mfa_ticket") {
        reset("Your secure sign-in window expired. Request a new OTP to continue; an unfinished authenticator setup can be resumed safely.");
      } else if (caught instanceof PlatformApiError && caught.code === "invalid_mfa_code") {
        setError("That authenticator code is invalid or was already used. Wait for the next code and try again.");
      } else {
        setError(caught instanceof PlatformApiError ? caught.message : "Could not verify the authenticator. Try again.");
      }
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (step === "otp" && otp.length === 6) void verifyOtp(otp);
    // Verification intentionally starts as soon as the sixth digit is entered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otp, step]);

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
          <Button title="Send OTP" onPress={sendOtp} loading={busy} disabled={phone.length !== 10} style={{ marginTop: 20 }} size="lg" />

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
      ) : step === "otp" ? (
        <>
          <Text variant="title" style={{ marginTop: 12 }}>Enter the OTP</Text>
          <Text variant="body" tone="muted" style={{ marginTop: 6, marginBottom: 24 }}>
            Sent to {destination ?? `+91 ${phone}`}.{" "}
            <Text variant="body" tone="primary" onPress={() => reset()}>Change</Text>
          </Text>
          <OtpInput value={otp} onChange={setOtp} error={error} />
          <Button title="Verify & continue" onPress={() => verifyOtp()} loading={busy} disabled={otp.length !== 6} style={{ marginTop: 24 }} size="lg" />
          <View style={{ alignItems: "center", marginTop: 16 }}>
            {timer > 0 ? (
              <Text variant="small" tone="muted">Resend OTP in {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, "0")}</Text>
            ) : (
              <Pressable disabled={busy} onPress={sendOtp} accessibilityRole="button">
                <Text variant="small" tone="primary" style={{ fontWeight: "600" }}>Resend OTP</Text>
              </Pressable>
            )}
            <Text variant="caption" tone="faint" center style={{ marginTop: 8 }}>Resending sends the same valid code again. Either SMS will work until it expires.</Text>
          </View>
          {localDebugCode ? <Text variant="caption" tone="faint" center style={{ marginTop: 24 }}>Demo OTP: {localDebugCode}</Text> : null}
        </>
      ) : step === "mfa-enroll" ? (
        <>
          <Text variant="title" style={{ marginTop: 12 }}>Secure your account</Text>
          <Text variant="body" tone="muted" style={{ marginTop: 6, marginBottom: 18 }}>Add Munna Gas Connect to Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app.</Text>
          <Card tone="alt">
            <Text variant="label" tone="faint">Manual setup key</Text>
            <Text variant="bodyStrong" style={styles.manualKey}>{mfaEnrollment?.manualKey}</Text>
            {mfaEnrollment?.otpauthUri ? <Button title="Open authenticator app" variant="ghost" size="sm" onPress={() => { void Linking.openURL(mfaEnrollment.otpauthUri); }} style={{ marginTop: 12 }} /> : null}
          </Card>
          <Input label="Current authenticator code" value={mfaCode} onChangeText={(value) => setMfaCode(value.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" autoComplete="one-time-code" placeholder="6-digit code" error={error} style={{ marginTop: 18 }} />
          <Button title="Enable authenticator" onPress={verifyAuthenticator} loading={busy} disabled={mfaCode.length !== 6} style={{ marginTop: 20 }} size="lg" />
          <Button title="Verify phone again" variant="ghost" onPress={() => reset()} disabled={busy} style={{ marginTop: 10 }} />
        </>
      ) : step === "mfa-verify" ? (
        <>
          <Text variant="title" style={{ marginTop: 12 }}>Second factor required</Text>
          <Text variant="body" tone="muted" style={{ marginTop: 6, marginBottom: 24 }}>Enter the current 6-digit authenticator code or one unused recovery code.</Text>
          <Input label="Authenticator or recovery code" value={mfaCode} onChangeText={(value) => setMfaCode(value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20))} autoComplete="one-time-code" placeholder="6-digit or XXXX-XXXX" error={error} />
          <Button title="Verify & continue" onPress={verifyAuthenticator} loading={busy} disabled={mfaCode.length < 6} style={{ marginTop: 20 }} size="lg" />
          <Button title="Verify phone again" variant="ghost" onPress={() => reset()} disabled={busy} style={{ marginTop: 10 }} />
        </>
      ) : (
        <>
          <Text variant="title" style={{ marginTop: 12 }}>Authenticator enabled</Text>
          <Text variant="body" tone="muted" style={{ marginTop: 6, marginBottom: 18 }}>Save these one-time recovery codes securely. They will not be shown again.</Text>
          <Card tone="alt"><View style={styles.recoveryGrid}>{recoveryCodes.map((value) => <Text key={value} variant="small" style={styles.recoveryCode}>{value}</Text>)}</View></Card>
          <Button title="I saved the codes — continue" onPress={() => router.replace(selectTenantAfterRecovery ? "/(auth)/select-tenant" : "/(tenant)/home")} style={{ marginTop: 20 }} size="lg" />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  demoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  manualKey: { marginTop: 8, fontFamily: "monospace", letterSpacing: 1.2 },
  recoveryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  recoveryCode: { width: "46%", fontFamily: "monospace", fontWeight: "600" },
});
