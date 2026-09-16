"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/Shell";
import { Button, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, ErrorState, Field, Input, NativeSelect } from "@/components/ui";
import { q, patch } from "@/features/hooks";

/** P6 — Platform config */
export default function ConfigPage() {
  const qc = useQueryClient();
  const config = useQuery(q.config());
  const [c, setC] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (config.data && !c) setC(config.data);
  }, [config.data, c]);
  const save = async () => {
    setBusy(true);
    try {
      await patch("/admin/config", { ...c, commissionPct: Number(c.commissionPct), commissionFlat: Number(c.commissionFlat), convenienceFee: Number(c.convenienceFee), expressFee: Number(c.expressFee), expressAgencySharePct: Number(c.expressAgencySharePct), gstPct: Number(c.gstPct), minRefillGapDays: Number(c.minRefillGapDays), yearlyDomesticQuota: Number(c.yearlyDomesticQuota), defaultCycleDays: Number(c.defaultCycleDays), reminderLeadDays: Number(c.reminderLeadDays), plans: { free: { ...c.plans.free, monthlyFee: Number(c.plans.free.monthlyFee), orderLimit: Number(c.plans.free.orderLimit) }, growth: { ...c.plans.growth, monthlyFee: Number(c.plans.growth.monthlyFee) }, pro: { ...c.plans.pro, monthlyFee: Number(c.plans.pro.monthlyFee) } } });
      qc.invalidateQueries();
      toast.success("Config saved", { description: "New bookings use the updated fees and rules immediately." });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (config.isLoading || !c) return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>;
  if (config.isError) return <ErrorState onRetry={() => config.refetch()} />;
  const num = (k: string) => ({ type: "number" as const, value: c[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setC({ ...c, [k]: e.target.value }) });
  return (
    <>
      <PageHeader title="Platform config" subtitle="Every value here feeds the pricing engine, refill rules and admin revenue numbers.">
        <Button onClick={save} loading={busy}>
          Save config
        </Button>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Commission & fees</CardTitle>
              <CardDescription>Business model levers (PRD §11)</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Field label="Commission mode">
              <NativeSelect value={c.commissionMode} onChange={(e) => setC({ ...c, commissionMode: e.target.value })}>
                <option value="pct">Percentage of cylinder value</option>
                <option value="flat">Flat per online booking</option>
              </NativeSelect>
            </Field>
            {c.commissionMode === "pct" ? (
              <Field label="Commission %">
                <Input {...num("commissionPct")} step="0.5" />
              </Field>
            ) : (
              <Field label="Flat commission (₹)">
                <Input {...num("commissionFlat")} />
              </Field>
            )}
            <Field label="Convenience fee (₹ per booking)">
              <Input {...num("convenienceFee")} />
            </Field>
            <Field label="Express fee (₹)">
              <Input {...num("expressFee")} />
            </Field>
            <Field label="Express fee — agency share (%)">
              <Input {...num("expressAgencySharePct")} />
            </Field>
            <Field label="GST on services (%)">
              <Input {...num("gstPct")} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Refill rules & reminders</CardTitle>
              <CardDescription>Shown as friendly errors in the customer app</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <Field label="Minimum gap between domestic refills (days)">
              <Input {...num("minRefillGapDays")} />
            </Field>
            <Field label="Yearly domestic quota (cylinders)">
              <Input {...num("yearlyDomesticQuota")} />
            </Field>
            <Field label="Default usage cycle (days)">
              <Input {...num("defaultCycleDays")} />
            </Field>
            <Field label="Reminder lead time (days before run-out)">
              <Input {...num("reminderLeadDays")} />
            </Field>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Agency SaaS plans</CardTitle>
              <CardDescription>Monthly fees shown on the agency Subscription page</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            {(["free", "growth", "pro"] as const).map((p) => (
              <div key={p} className="rounded-xl border p-3">
                <p className="mb-2 font-semibold capitalize">{p}</p>
                <Field label="Monthly fee (₹)">
                  <Input type="number" value={c.plans[p].monthlyFee} onChange={(e) => setC({ ...c, plans: { ...c.plans, [p]: { ...c.plans[p], monthlyFee: e.target.value } } })} />
                </Field>
                {p === "free" ? (
                  <div className="mt-2">
                    <Field label="Order limit / month">
                      <Input type="number" value={c.plans.free.orderLimit ?? 0} onChange={(e) => setC({ ...c, plans: { ...c.plans, free: { ...c.plans.free, orderLimit: e.target.value } } })} />
                    </Field>
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
