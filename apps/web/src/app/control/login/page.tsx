"use client";

import { Building2, Check, Copy, KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, CardContent, Field, Input } from "@/components/ui";
import { OperationsApiError, operationsApi, type MfaEnrollment } from "@/lib/operations-api";

type Stage = "phone" | "otp" | "enroll" | "mfa" | "recovery";

export default function ControlLoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("phone");
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);

  useEffect(() => {
    if (stage !== "otp" || resendIn <= 0) return;
    const timeout = window.setTimeout(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1_000);
    return () => window.clearTimeout(timeout);
  }, [resendIn, stage]);

  const send = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true); setError(null);
    try {
      const result = await operationsApi.requestOtp(`+91${phone.replace(/\D/g, "").slice(-10)}`);
      setChallenge(result.challengePublicId); setDestination(result.destination); setDebugCode(result.localDebugCode ?? null); setResendIn(result.resendAfterSeconds); setOtpCode(""); setStage("otp");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request an OTP."); }
    finally { submitLock.current = false; setBusy(false); }
  };

  const verifyOtp = async () => {
    if (!challenge || submitLock.current) return;
    submitLock.current = true;
    setBusy(true); setError(null);
    try {
      const result = await operationsApi.verifyOtp(challenge, otpCode);
      if (result.status === "authenticated") {
        if (!result.platformAccess) throw new Error("This account has no Platform Admin access.");
        router.replace("/control");
        return;
      }
      setMfaTicket(result.mfaTicket);
      setDebugCode(null);
      if (result.status === "mfa_enrollment_required") {
        const setup = await operationsApi.beginMfaEnrollment(result.mfaTicket);
        setEnrollment(setup); setStage("enroll");
      } else {
        setStage("mfa");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Verification failed."); }
    finally { submitLock.current = false; setBusy(false); }
  };

  const completeMfa = async () => {
    if (!mfaTicket || submitLock.current) return;
    submitLock.current = true;
    setBusy(true); setError(null);
    try {
      if (stage === "enroll") {
        if (!enrollment) return;
        const result = await operationsApi.confirmMfaEnrollment(mfaTicket, enrollment.factorPublicId, mfaCode);
        if (!result.platformAccess) throw new Error("This account has no Platform Admin access.");
        setRecoveryCodes(result.recoveryCodes ?? []); setStage("recovery"); setMfaCode(""); setMfaTicket(null);
      } else {
        const result = await operationsApi.verifyMfa(mfaTicket, mfaCode);
        if (!result.platformAccess) throw new Error("This account has no Platform Admin access.");
        router.replace("/control");
      }
    } catch (cause) {
      if (cause instanceof OperationsApiError && cause.code === "invalid_mfa_ticket") {
        try {
          const session = await operationsApi.session();
          if (session.platformAccess) {
            router.replace("/control");
            return;
          }
        } catch {
          // No completed sibling request established a session; restart phone verification below.
        }
        setStage("phone"); setChallenge(null); setOtpCode(""); setMfaCode(""); setMfaTicket(null); setEnrollment(null); setRecoveryCodes([]); setDebugCode(null); setResendIn(0);
        setError("Your secure sign-in window expired. Request a new OTP to continue; an unfinished authenticator setup can be resumed safely.");
      } else setError(cause instanceof Error ? cause.message : "MFA verification failed.");
    }
    finally { submitLock.current = false; setBusy(false); }
  };

  const reset = () => {
    setStage("phone"); setChallenge(null); setOtpCode(""); setMfaCode(""); setMfaTicket(null); setEnrollment(null); setRecoveryCodes([]); setDebugCode(null); setResendIn(0); setError(null);
  };

  const copyRecoveryCodes = async () => {
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
  };

  return <main className="flex min-h-screen items-center justify-center bg-muted/40 px-5 py-10"><Card className="w-full max-w-md"><CardContent className="p-7">
    <div className="flex items-center gap-3"><span className="flex size-11 items-center justify-center rounded-xl bg-navy text-background"><Building2 className="size-5" /></span><div><h1 className="font-bold">Platform Control</h1><p className="text-xs text-muted-foreground">Super Admin and Platform Admin access</p></div></div>

    <div className="mt-6 grid gap-4">
      {stage === "phone" ? <Field label="Registered mobile number" error={error ?? undefined}><div className="flex gap-2"><span className="flex items-center rounded-xl border bg-muted px-3 text-sm">+91</span><Input inputMode="numeric" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" /></div></Field> : null}

      {stage === "otp" ? <Field label={`OTP sent to ${destination}`} error={error ?? undefined}><Input inputMode="numeric" autoComplete="one-time-code" value={otpCode} onChange={(event) => setOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" /></Field> : null}

      {stage === "enroll" && enrollment ? <>
        <div className="rounded-xl border bg-muted/60 p-4 text-sm"><div className="mb-2 flex items-center gap-2 font-semibold"><KeyRound className="size-4 text-primary" />Set up an authenticator</div><ol className="list-decimal space-y-1 pl-5 text-muted-foreground"><li>Open Google Authenticator, Microsoft Authenticator, Authy, or another TOTP app.</li><li>Add an account using the setup key below.</li><li>Enter the current 6-digit code.</li></ol></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Manual setup key</p><code className="mt-2 block break-all text-sm font-semibold tracking-wider">{enrollment.manualKey}</code><a className="mt-3 inline-block text-xs font-medium text-primary underline underline-offset-4" href={enrollment.otpauthUri}>Open in authenticator app</a></div>
        <Field label="Authenticator code" error={error ?? undefined}><Input inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" /></Field>
      </> : null}

      {stage === "mfa" ? <>
        <div className="rounded-xl border bg-muted/60 p-4 text-sm"><div className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-primary" />Second factor required</div><p className="mt-1 text-muted-foreground">Enter your current authenticator code. You can also enter one unused recovery code.</p></div>
        <Field label="Authenticator or recovery code" error={error ?? undefined}><Input autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20))} placeholder="6-digit or XXXX-XXXX" /></Field>
      </> : null}

      {stage === "recovery" ? <>
        <div className="rounded-xl bg-success-soft p-4 text-sm text-success"><div className="flex items-center gap-2 font-semibold"><Check className="size-4" />Authenticator enabled</div><p className="mt-1">Save these one-time recovery codes now. They will not be shown again.</p></div>
        <div className="grid grid-cols-2 gap-2 rounded-xl border bg-card p-4 font-mono text-sm">{recoveryCodes.map((recoveryCode) => <span key={recoveryCode}>{recoveryCode}</span>)}</div>
        <Button variant="outline" onClick={() => void copyRecoveryCodes()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy recovery codes"}</Button>
      </> : null}

      {debugCode ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">Local test OTP: <strong>{debugCode}</strong></p> : null}
      {stage === "phone" ? <Button size="lg" loading={busy} disabled={phone.length !== 10} onClick={() => void send()}>Send OTP</Button> : null}
      {stage === "otp" ? <><Button size="lg" loading={busy} disabled={otpCode.length !== 6} onClick={() => void verifyOtp()}>Verify phone</Button><Button variant="outline" disabled={busy || resendIn > 0} onClick={() => void send()}>{resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend the same OTP"}</Button><p className="text-center text-xs text-muted-foreground">A resend keeps the current code valid until its original expiry.</p></> : null}
      {stage === "enroll" || stage === "mfa" ? <Button size="lg" loading={busy} disabled={mfaCode.length < 6} onClick={() => void completeMfa()}>{stage === "enroll" ? "Enable authenticator" : "Verify and continue"}</Button> : null}
      {stage === "recovery" ? <Button size="lg" onClick={() => router.replace("/control")}>I saved these codes — continue</Button> : null}
      {stage !== "phone" && stage !== "recovery" ? <Button variant="ghost" onClick={reset}>Use another number</Button> : null}
    </div>
    <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Privileged sessions require verified phone ownership and a second factor.</p>
  </CardContent></Card></main>;
}
