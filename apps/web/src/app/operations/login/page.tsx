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
      if (result.status !== "authenticated") throw new Error("This privileged account requires MFA verification in Platform Control before operations access.");
      if (!result.agencies?.length) throw new Error("This account has no authorized agency operations scope.");
      router.replace("/operations/dashboard");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "OTP verification failed."); }
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
            {!challenge ? (
              <Field label="Registered mobile number" error={error ?? undefined}>
                <div className="flex gap-2"><span className="flex items-center rounded-xl border bg-muted px-3 text-sm">+91</span><Input inputMode="numeric" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" /></div>
              </Field>
            ) : (
              <Field label={`OTP sent to ${destination}`} error={error ?? undefined}>
                <Input inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" />
              </Field>
            )}
            {debugCode ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">Local test OTP: <strong>{debugCode}</strong></p> : null}
            <Button size="lg" loading={busy} disabled={!challenge ? phone.length !== 10 : code.length !== 6} onClick={() => { void (challenge ? verify() : send()); }}>{challenge ? "Verify and continue" : "Send OTP"}</Button>
            {challenge ? <Button variant="ghost" onClick={() => { setChallenge(null); setCode(""); setError(null); }}>Use another number</Button> : null}
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Access is limited by assigned agency and permission scope.</p>
        </CardContent>
      </Card>
    </main>
  );
}
