"use client";

import { Building2, Flame } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Card, CardContent, Field, Input } from "@/components/ui";
import { operationsApi } from "@/lib/operations-api";

export function DashboardLogin({ dashboard }: { dashboard: "control" | "operations" }) {
  const router = useRouter();
  const control = dashboard === "control";
  const Icon = control ? Building2 : Flame;
  const submitting = useRef(false);
  const [phone, setPhone] = useState("");
  const [challenge, setChallenge] = useState<Awaited<ReturnType<typeof operationsApi.requestOtp>> | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  async function submit(action: "send" | "verify") {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      if (action === "send") {
        const result = await operationsApi.requestOtp(`+91${phone}`);
        setChallenge(result);
        setResendIn(result.resendAfterSeconds);
        setCode("");
      } else if (challenge) {
        const session = await operationsApi.verifyOtp(challenge.challengePublicId, code);
        if (control && !session.platformAccess) throw new Error("This account has no platform access.");
        if (!control && !session.agencies?.length) throw new Error("This account has no agency operations access.");
        router.replace(control ? "/control" : "/operations/dashboard");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed. Please try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 px-5">
      <Card className="w-full max-w-md"><CardContent className="p-7">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-white"><Icon className="size-5" /></span>
          <div><h1 className="font-bold">{control ? "Platform Control" : "Commercial LPG Operations"}</h1>
            <p className="text-xs text-muted-foreground">{control ? "Platform team access" : "Agency access"}</p></div>
        </div>
        <form className="mt-6 grid gap-4" onSubmit={(event) => { event.preventDefault(); void submit(challenge ? "verify" : "send"); }}>
          {challenge ? (
            <Field label={`OTP sent to ${challenge.destination}`} error={error || undefined}>
              <Input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" />
            </Field>
          ) : (
            <Field label="Registered mobile number" error={error || undefined}>
              <div className="flex gap-2"><span className="flex items-center rounded-xl border bg-muted px-3 text-sm">+91</span>
                <Input inputMode="numeric" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit mobile" /></div>
            </Field>
          )}
          {challenge?.localDebugCode && <p className="text-xs text-warning">Local test OTP: {challenge.localDebugCode}</p>}
          <Button type="submit" size="lg" loading={busy} disabled={challenge ? code.length !== 6 : phone.length !== 10}>{challenge ? "Verify and continue" : "Send OTP"}</Button>
          {challenge && <>
            <Button type="button" variant="outline" disabled={busy || resendIn > 0} onClick={() => void submit("send")}>{resendIn > 0 ? `Resend OTP in ${resendIn}s` : "Resend OTP"}</Button>
            <p className="text-center text-xs text-muted-foreground">A resend keeps the current code valid until its original expiry.</p>
            <Button type="button" variant="ghost" disabled={busy} onClick={() => { setChallenge(null); setCode(""); setResendIn(0); setError(""); }}>Use another number</Button>
          </>}
        </form>
      </CardContent></Card>
    </main>
  );
}
