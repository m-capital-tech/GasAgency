"use client";

import { Flame, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, CardContent, Field, Input } from "@/components/ui";
import { OperationsApiError, operationsApi } from "@/lib/operations-api";

export default function OperationsLoginPage() {
  const router = useRouter();
  const submitLock = useRef(false);
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaMode, setMfaMode] = useState<"enroll" | "verify" | null>(null);
  const [factorPublicId, setFactorPublicId] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!challenge || mfaTicket || resendIn <= 0) return;
    const timeout = window.setTimeout(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearTimeout(timeout);
  }, [challenge, mfaTicket, resendIn]);

  const reset = (message?: string) => {
    setChallenge(null);
    setDestination("");
    setCode("");
    setDebugCode(null);
    setResendIn(0);
    setMfaTicket(null);
    setMfaMode(null);
    setFactorPublicId(null);
    setManualKey(null);
    setRecoveryCodes([]);
    setError(message ?? null);
  };

  const send = async () => {
    if (submitLock.current || phone.length !== 10) return;
    submitLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const phoneE164 = `+91${phone.replace(/\D/g, "").slice(-10)}`;
      const result = await operationsApi.requestOtp(phoneE164);
      setChallenge(result.challengePublicId);
      setDestination(result.destination);
      setDebugCode(result.localDebugCode ?? null);
      setResendIn(result.resendAfterSeconds);
      setCode("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request an OTP.");
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!challenge || code.length !== 6 || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await operationsApi.verifyOtp(challenge, code);
      if (result.status === "authenticated") {
        if (!result.agencies?.length) throw new Error("This account has no authorized agency operations scope.");
        router.replace("/operations/dashboard");
        return;
      }
      setMfaTicket(result.mfaTicket);
      setCode("");
      setDebugCode(null);
      setResendIn(0);
      if (result.status === "mfa_enrollment_required") {
        const enrollment = await operationsApi.beginMfaEnrollment(result.mfaTicket);
        setMfaMode("enroll");
        setFactorPublicId(enrollment.factorPublicId);
        setManualKey(enrollment.manualKey);
      } else {
        setMfaMode("verify");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "OTP verification failed.");
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  const verifyMfa = async () => {
    if (!mfaTicket || code.length < 6 || submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = mfaMode === "enroll" && factorPublicId
        ? await operationsApi.confirmMfaEnrollment(mfaTicket, factorPublicId, code)
        : await operationsApi.verifyMfa(mfaTicket, code);
      if (!result.agencies?.length) throw new Error("This account has no authorized agency operations scope.");
      if (result.recoveryCodes?.length) {
        setRecoveryCodes(result.recoveryCodes);
        setCode("");
        setMfaTicket(null);
        return;
      }
      router.replace("/operations/dashboard");
    } catch (cause) {
      if (cause instanceof OperationsApiError && cause.code === "invalid_mfa_ticket") {
        try {
          const session = await operationsApi.session();
          if (session.agencies?.length) {
            router.replace("/operations/dashboard");
            return;
          }
        } catch {
          // No completed sibling request established a session; restart phone verification below.
        }
        reset("Your secure sign-in window expired. Request a new OTP to continue; an unfinished authenticator setup can be resumed safely.");
      } else {
        setError(cause instanceof Error ? cause.message : "Authenticator verification failed.");
      }
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-5">
      <Card className="w-full max-w-md">
        <CardContent className="p-7">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-white"><Flame className="size-5" /></span>
            <div><h1 className="font-bold">Commercial LPG Operations</h1><p className="text-xs text-muted-foreground">Secure agency access</p></div>
          </div>
          <div className="mt-6 grid gap-4">
            {recoveryCodes.length ? <div className="rounded-xl border border-warning/30 bg-warning-soft p-4"><p className="text-sm font-semibold">Save your recovery codes</p><p className="mt-1 text-xs text-muted-foreground">Each code works once. Store them securely before continuing.</p><div className="mt-3 grid grid-cols-2 gap-2 font-mono text-xs">{recoveryCodes.map((value) => <span key={value} className="rounded bg-card px-2 py-1">{value}</span>)}</div></div> : !challenge ? (
              <Field label="Registered mobile number" error={error ?? undefined}>
                <div className="flex gap-2"><span className="flex items-center rounded-xl border bg-muted px-3 text-sm">+91</span><Input inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" /></div>
              </Field>
            ) : mfaTicket ? (
              <Field label={mfaMode === "enroll" ? "Authenticator setup code" : "Authenticator or recovery code"} error={error ?? undefined}>
                {manualKey ? <div className="mb-3 rounded-lg bg-muted px-3 py-2"><p className="mb-1 text-xs text-muted-foreground">Add this key in Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app.</p><p className="break-all font-mono text-xs font-semibold">{manualKey}</p></div> : null}
                <Input inputMode={mfaMode === "enroll" ? "numeric" : "text"} autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20))} placeholder={mfaMode === "enroll" ? "6-digit authenticator code" : "6-digit or XXXX-XXXX"} />
              </Field>
            ) : (
              <Field label={`OTP sent to ${destination}`} error={error ?? undefined}>
                <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" />
              </Field>
            )}
            {debugCode ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">Demo OTP: <strong>{debugCode}</strong></p> : null}
            <Button size="lg" loading={busy} disabled={recoveryCodes.length ? false : !challenge ? phone.length !== 10 : mfaTicket ? code.length < 6 : code.length !== 6} onClick={() => { if (recoveryCodes.length) router.replace("/operations/dashboard"); else void (!challenge ? send() : mfaTicket ? verifyMfa() : verify()); }}>{recoveryCodes.length ? "I saved the codes—continue" : mfaTicket ? "Verify authenticator" : challenge ? "Verify phone" : "Send OTP"}</Button>
            {challenge && !mfaTicket && !recoveryCodes.length ? <Button variant="outline" disabled={busy || resendIn > 0} onClick={() => void send()}>{resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend the same OTP"}</Button> : null}
            {challenge && !recoveryCodes.length ? <Button variant="ghost" onClick={() => reset()}>Use another number</Button> : null}
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Phone OTP and an authenticator are both required for privileged agency access.</p>
        </CardContent>
      </Card>
    </main>
  );
}
