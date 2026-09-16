"use client";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/Shell";
import { Avatar, Badge, Button, Dialog, DialogContent, EmptyState, ErrorState, Field, Input, NativeSelect, TBody, THead, Table, TableSkeleton, Tr } from "@/components/ui";
import { useAgencyId, useStaff, post, type ExpandedStaff } from "@/features/hooks";
import { formatINR } from "@/lib/format";

/** A6 — Delivery staff */
export default function StaffPage() {
  const agencyId = useAgencyId();
  const staff = useStaff();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<ExpandedStaff> | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!edit?.name || !edit.phone) return toast.error("Name and phone are required");
    setBusy(true);
    try {
      await post(`/agency/${agencyId}/staff`, { id: edit.id, name: edit.name, phone: edit.phone, vehicle: edit.vehicle ?? "Three-wheeler", vehicleNo: edit.vehicleNo ?? "TS 09 XX 0000" });
      qc.invalidateQueries({ queryKey: ["staff"] });
      toast.success(edit.id ? "Staff updated" : "Staff added");
      setEdit(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader title="Delivery staff" subtitle={`${(staff.data ?? []).length} partners · ${(staff.data ?? []).filter((s) => s.online).length} online`}>
        <Button onClick={() => setEdit({})}>
          <Plus /> Add staff
        </Button>
      </PageHeader>
      <div className="rounded-2xl border bg-card">
        {staff.isLoading ? (
          <TableSkeleton />
        ) : staff.isError ? (
          <ErrorState onRetry={() => staff.refetch()} />
        ) : (staff.data ?? []).length === 0 ? (
          <EmptyState title="No delivery staff yet" body="Add your first delivery partner to start assigning orders." action="Add staff" onAction={() => setEdit({})} />
        ) : (
          <Table>
            <THead>
              <tr>
                <th>Name</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th className="text-right">Today's load</th>
                <th className="text-right">Delivered</th>
                <th className="text-right">On-time</th>
                <th className="text-right">Failed</th>
                <th className="text-right">Cash in hand</th>
                <th></th>
              </tr>
            </THead>
            <TBody>
              {(staff.data ?? []).map((s) => (
                <Tr key={s.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={s.name} color={s.avatarColor} size={30} />
                      <div>
                        <p className="font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">+91 {s.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-xs">
                    {s.vehicle}
                    <br />
                    <span className="text-muted-foreground">{s.vehicleNo}</span>
                  </td>
                  <td>{s.activeBookingId ? <Badge tone="primary" dot>On trip</Badge> : s.online ? <Badge tone="success" dot>Online</Badge> : <Badge dot>Offline</Badge>}</td>
                  <td className="text-right tabular-nums">{s.currentDrops} pending</td>
                  <td className="text-right tabular-nums">{s.todayDelivered}</td>
                  <td className="text-right">
                    <div className="inline-flex items-center gap-2">
                      <div className="h-1.5 w-16 rounded-full bg-muted">
                        <div className="h-1.5 rounded-full bg-success" style={{ width: `${s.onTimePct}%` }} />
                      </div>
                      <span className="tabular-nums">{s.onTimePct}%</span>
                    </div>
                  </td>
                  <td className="text-right tabular-nums text-danger">{s.failedPct}%</td>
                  <td className="text-right tabular-nums">{formatINR(s.cashInHand, { decimals: false })}</td>
                  <td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEdit(s)}>
                      Edit
                    </Button>
                  </td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent title={edit?.id ? "Edit delivery partner" : "Add delivery partner"}>
          <div className="grid gap-3">
            <Field label="Full name">
              <Input value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Ramesh Yadav" />
            </Field>
            <Field label="Mobile">
              <Input value={edit?.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} placeholder="10-digit mobile" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Vehicle">
                <NativeSelect value={edit?.vehicle ?? "Three-wheeler"} onChange={(e) => setEdit({ ...edit, vehicle: e.target.value })}>
                  {["Three-wheeler", "Mini truck", "Cycle cart", "Two-wheeler"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Vehicle no.">
                <Input value={edit?.vehicleNo ?? ""} onChange={(e) => setEdit({ ...edit, vehicleNo: e.target.value.toUpperCase() })} placeholder="TS 09 AB 1234" />
              </Field>
            </div>
            <div className="mt-2 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEdit(null)}>
                Cancel
              </Button>
              <Button onClick={save} loading={busy}>
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
