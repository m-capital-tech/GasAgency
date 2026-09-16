"use client";
import { Flame } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, Card, CardContent, Field, Input } from "@/components/ui";
import { ApiError, post } from "@/lib/api";
import { useSession } from "@/lib/session";

function LoginForm() {
  const params = useSearchParams();
  const as = params.get("as") === "admin" ? "admin" : "agency";
  const router = useRouter();
  const login = useSession((s) => s.login);
  const [email, setEmail] = useState(as === "admin" ? "admin@demo" : "suresh@demo");
  const [password, setPassword] = useState("123456");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await post("/auth/login", { email, password });
      login(r.user, r.user.role === "agency_owner" ? r.profile : null);
      router.replace(r.user.role === "admin" ? "/admin" : "/agency");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not sign in. Is the mock API running?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex flex-1 items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-white">
              <Flame className="size-4" />
            </span>
            <div>
              <p className="font-bold leading-tight">GasSetu {as === "admin" ? "Admin" : "Agency LMS"}</p>
              <p className="text-xs text-muted-foreground">Sign in to continue</p>
            </div>
          </div>
          <form onSubmit={submit} className="mt-6 grid gap-4">
            <Field label="Email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
            </Field>
            <Field label="Password" error={error ?? undefined}>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
            </Field>
            <Button type="submit" loading={busy} size="lg">
              Sign in
            </Button>
          </form>
          <div className="mt-5 rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Demo accounts</p>
            <p className="mt-1">
              Agency: <button className="text-primary underline" onClick={() => setEmail("suresh@demo")}>suresh@demo</button> · Admin: <button className="text-primary underline" onClick={() => setEmail("admin@demo")}>admin@demo</button> · password <code>123456</code>
            </p>
            <p className="mt-1">Other agencies: kukatpally@demo, gachibowli@demo, secunderabad@demo, lbnagar@demo, mehdipatnam@demo</p>
          </div>
          {as === "agency" ? (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              New distributor?{" "}
              <a href="/agency/register" className="font-semibold text-primary">
                Register your agency
              </a>
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
