"use client";

import { Flame, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, CardContent, Field, Input } from "@/components/ui";
import { operationsApi } from "@/lib/operations-api";

export default function OperationsLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [code, setCode] = useState("");
  const [debugCode, setDebugCode] = useState<string | null>(null);
  const [mfaTicket, setMfaTicket] = useState<string | null>(null);
  const [mfaMode, setMfaMode] = useState<"enroll" | "verify" | null>(null);
  const [factorPublicId, setFactorPublicId] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setBusy(true); setError(null);
    try {
      const phoneE164 = `+91${phone.replace(/\D/g, "").slice(-10)}`;
      const result = await operationsApi.requestOtp(phoneE164);
      setChallenge(result.challengePublicId); setDestination(result.destination); setDebugCode(result.localDebugCode ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not request an OTP."); }
    finally { setBusy(false); }
  };
  const verify = async () => {
    if (!challenge) return;
    setBusy(true); setError(null);
    try {
      const result = await operationsApi.verifyOtp(challenge, code);
      if (result.status === "authenticated") {
        if (!result.agencies?.length) throw new Error("This account has no authorized agency operations scope.");
        router.replace("/operations/dashboard"); return;
      }
      setMfaTicket(result.mfaTicket); setCode(""); setDebugCode(null);
      if (result.status === "mfa_enrollment_required") {
        const enrollment = await operationsApi.beginMfaEnrollment(result.mfaTicket);
        setMfaMode("enroll"); setFactorPublicId(enrollment.factorPublicId); setManualKey(enrollment.manualKey);
      } else setMfaMode("verify");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "OTP verification failed."); }
    finally { setBusy(false); }
  };
  const verifyMfa = async () => {
    if (!mfaTicket) return; setBusy(true); setError(null);
    try {
      const result = mfaMode === "enroll" && factorPublicId
        ? await operationsApi.confirmMfaEnrollment(mfaTicket, factorPublicId, code)
        : await operationsApi.verifyMfa(mfaTicket, code);
      if (!result.agencies?.length) throw new Error("This account has no authorized agency operations scope.");
      if (result.recoveryCodes?.length) { setRecoveryCodes(result.recoveryCodes); setCode(""); return; }
      router.replace("/operations/dashboard");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Authenticator verification failed."); }
    finally { setBusy(false); }
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
                <div className="flex gap-2"><span className="flex items-center rounded-xl border bg-muted px-3 text-sm">+91</span><Input inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" /></div>
              </Field>
            ) : mfaTicket ? (
              <Field label={mfaMode === "enroll" ? "Authenticator setup code" : "Authenticator or recovery code"} error={error ?? undefined}>
                {manualKey ? <p className="mb-3 rounded-lg bg-muted px-3 py-2 font-mono text-xs">Manual key: {manualKey}</p> : null}
                <Input value={code} onChange={(event) => setCode(event.target.value.trim().slice(0, 24))} placeholder={mfaMode === "enroll" ? "6-digit authenticator code" : "Authenticator or recovery code"} />
              </Field>
            ) : (
              <Field label={`OTP sent to ${destination}`} error={error ?? undefined}>
                <Input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" />
              </Field>
            )}
            {debugCode ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">Local test OTP: <strong>{debugCode}</strong></p> : null}
            <Button size="lg" loading={busy} disabled={recoveryCodes.length ? false : !challenge ? phone.length !== 10 : mfaTicket ? code.length < 6 : code.length !== 6} onClick={() => { if (recoveryCodes.length) router.replace("/operations/dashboard"); else void (!challenge ? send() : mfaTicket ? verifyMfa() : verify()); }}>{recoveryCodes.length ? "I saved the codes—continue" : mfaTicket ? "Verify authenticator" : challenge ? "Verify phone" : "Send OTP"}</Button>
            {challenge && !recoveryCodes.length ? <Button variant="ghost" onClick={() => { setChallenge(null); setMfaTicket(null); setMfaMode(null); setFactorPublicId(null); setManualKey(null); setCode(""); setError(null); }}>Use another number</Button> : null}
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Access is limited by assigned agency and permission scope.</p>
        </CardContent>
      </Card>
    </main>
  );
}
