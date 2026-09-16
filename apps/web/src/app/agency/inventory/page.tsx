"use client";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/Shell";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, ErrorState, Field, Input, NativeSelect, TBody, THead, Table, Tr } from "@/components/ui";
import { useAgencyId, useInventory, post } from "@/features/hooks";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A8 — Inventory */
export default function InventoryPage() {
  const agencyId = useAgencyId();
  const inv = useInventory();
  const qc = useQueryClient();
  const [form, setForm] = useState({ cylinderTypeId: "cyl_14", kind: "in", qty: "", note: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`/agency/${agencyId}/inventory`, { ...form, qty: Number(form.qty) });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success(`${form.qty} cylinders ${form.kind === "in" ? "received" : "issued"}`);
      setForm({ ...form, qty: "", note: "" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (inv.isLoading) return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>;
  if (inv.isError || !inv.data) return <ErrorState onRetry={() => inv.refetch()} />;
  const low = inv.data.stock.filter((s: any) => s.low);
  return (
    <>
      <PageHeader title="Inventory" subtitle="Filled and empty cylinders on hand">
        {low.length ? (
          <span className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs font-semibold text-[#9a6b00] dark:text-warning">
            <AlertTriangle className="size-4" /> {low.length} type{low.length > 1 ? "s" : ""} below reorder level
          </span>
        ) : null}
      </PageHeader>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {inv.data.stock.map((s: any) => (
          <Card key={s.cylinderTypeId} className={cn(s.low && "border-warning")}>
            <CardContent className="pt-5">
              <div className="flex items-center justify-between">
                <p className="font-semibold">{s.name}</p>
                {s.low ? <Badge tone="warning" dot>Low</Badge> : <Badge tone="success" dot>OK</Badge>}
              </div>
              <div className="mt-3 flex items-end gap-6">
                <div>
                  <p className="text-3xl font-bold tabular-nums">{s.filled}</p>
                  <p className="text-xs text-muted-foreground">filled</p>
                </div>
                <div>
                  <p className="text-xl font-semibold tabular-nums text-muted-foreground">{s.empty}</p>
                  <p className="text-xs text-muted-foreground">empty</p>
                </div>
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-muted">
                <div className={cn("h-1.5 rounded-full", s.low ? "bg-warning" : "bg-success")} style={{ width: `${Math.min(100, (s.filled / (s.lowStockThreshold * 4)) * 100)}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-faint">Reorder below {s.lowStockThreshold}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Daily stock entry</CardTitle>
              <CardDescription>Record OMC truck receipts and manual issues</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-3">
              <Field label="Cylinder type">
                <NativeSelect value={form.cylinderTypeId} onChange={(e) => setForm({ ...form, cylinderTypeId: e.target.value })}>
                  {inv.data.stock.map((s: any) => (
                    <option key={s.cylinderTypeId} value={s.cylinderTypeId}>
                      {s.name}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => setForm({ ...form, kind: "in" })} className={cn("flex items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium", form.kind === "in" ? "border-success bg-success-soft text-success" : "")}>
                  <ArrowDownToLine className="size-4" /> Stock in
                </button>
                <button type="button" onClick={() => setForm({ ...form, kind: "out" })} className={cn("flex items-center justify-center gap-2 rounded-xl border py-2 text-sm font-medium", form.kind === "out" ? "border-danger bg-danger-soft text-danger" : "")}>
                  <ArrowUpFromLine className="size-4" /> Stock out
                </button>
              </div>
              <Field label="Quantity">
                <Input type="number" min={1} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="e.g. 80" required />
              </Field>
              <Field label="Note">
                <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="OMC truck / manual issue" />
              </Field>
              <Button type="submit" loading={busy}>
                Record entry
              </Button>
            </form>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Recent movements</CardTitle>
              <CardDescription>Last 40 entries</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <THead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Movement</th>
                  <th className="text-right">Qty</th>
                  <th>Note</th>
                </tr>
              </THead>
              <TBody>
                {inv.data.entries.map((e: any) => (
                  <Tr key={e.id}>
                    <td className="text-xs text-muted-foreground">{formatDateTime(e.at)}</td>
                    <td>{e.name}</td>
                    <td>{e.kind === "in" ? <Badge tone="success">In</Badge> : <Badge tone="danger">Out</Badge>}</td>
                    <td className="text-right tabular-nums">{e.qty}</td>
                    <td className="text-xs text-muted-foreground">{e.note}</td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
