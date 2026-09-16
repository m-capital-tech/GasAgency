"use client";
import { useQueryClient } from "@tanstack/react-query";
import { FlaskConical, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button, Dialog, DialogContent } from "@/components/ui";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

const MOBILE_HINT = "Mobile personas (Riya / Imran / Ramesh) are switched from the phone app's Demo tab.";

/** PRD §6.5 — demo controls for the web panels. */
export function DemoControls() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [speed, setSpeed] = useState(1);
  const qc = useQueryClient();
  const router = useRouter();
  const { user, agency, login } = useSession();

  const run = async (key: string, fn: () => Promise<any>, label?: string) => {
    setBusy(key);
    try {
      const r = await fn();
      toast.success(label ?? r?.message ?? "Done");
      qc.invalidateQueries();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const switchTo = async (email: string) => {
    await run("persona", async () => {
      const r = await post("/auth/login", { email, password: "123456" });
      login(r.user, r.user.role === "agency_owner" ? r.profile : null);
      setOpen(false);
      router.push(r.user.role === "admin" ? "/admin" : "/agency");
      return { message: `Now viewing as ${r.user.name}` };
    });
  };

  const Chip = ({ label, onClick, active, k }: { label: string; onClick: () => void; active?: boolean; k: string }) => (
    <button onClick={onClick} disabled={!!busy} className={cn("rounded-full border px-3 py-1.5 text-xs font-medium transition", active ? "border-navy bg-navy text-background" : "bg-card hover:bg-muted", busy === k && "opacity-60")}>
      {label}
    </button>
  );

  return (
    <>
      <Button variant="navy" size="sm" onClick={() => setOpen(true)} aria-label="Open demo controls">
        <FlaskConical /> Demo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Demo controls" description="Drive the investor demo from here. Every action broadcasts live to the phone and the panel.">
          <div className="grid gap-5">
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Switch persona</p>
              <div className="flex flex-wrap gap-2">
                <Chip k="p1" label="Suresh · Amberpet (HP)" active={user?.email === "suresh@demo"} onClick={() => switchTo("suresh@demo")} />
                <Chip k="p2" label="Kukatpally (IOCL)" active={user?.email === "kukatpally@demo"} onClick={() => switchTo("kukatpally@demo")} />
                <Chip k="p3" label="Gachibowli (BPCL)" active={user?.email === "gachibowli@demo"} onClick={() => switchTo("gachibowli@demo")} />
                <Chip k="p4" label="Ops admin" active={user?.role === "admin"} onClick={() => switchTo("admin@demo")} />
              </div>
              <p className="mt-2 text-xs text-faint">{MOBILE_HINT}</p>
            </section>
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Simulate</p>
              <div className="flex flex-wrap gap-2">
                <Chip k="s1" label="New order burst (5)" onClick={() => run("s1", () => post("/demo/simulate", { kind: "order_burst", agencyId: agency?.id }))} />
                <Chip k="s2" label="Delivery failure" onClick={() => run("s2", () => post("/demo/simulate", { kind: "delivery_failure", agencyId: agency?.id }))} />
                <Chip k="s3" label="Low stock" onClick={() => run("s3", () => post("/demo/simulate", { kind: "low_stock", agencyId: agency?.id }))} />
                <Chip k="s4" label="Payment failure" onClick={() => run("s4", () => post("/demo/simulate", { kind: "payment_failure" }))} />
              </div>
            </section>
            <section>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tracking speed</p>
              <div className="flex gap-2">
                {[1, 3, 6].map((s) => (
                  <Chip key={s} k={`sp${s}`} label={`${s}×`} active={speed === s} onClick={() => run(`sp${s}`, () => post("/demo/speed", { speed: s }).then(() => setSpeed(s)), `Tracking at ${s}×`)} />
                ))}
              </div>
            </section>
            <section className="rounded-xl border border-danger/30 bg-danger-soft/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Reset demo data</p>
                  <p className="text-xs text-muted-foreground">Restores the seeded state for every app.</p>
                </div>
                <Button variant="danger" size="sm" loading={busy === "reset"} onClick={() => run("reset", () => post("/demo/reset"), "Demo data reset")}>
                  <RefreshCw /> Reset
                </Button>
              </div>
            </section>
            <p className="text-xs text-faint">Tip: the "Advance" button in each order's drawer moves it to the next status without the phone.</p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
