"use client";
import { BUSINESS_TYPE_LABELS, STATUS_LABELS, TIMELINE_STEPS, canCancel, type BookingStatus } from "@gassetu/shared";
import { Ban, Check, ChevronRight, FileText, Phone, RotateCcw, UserPlus, Wand2, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Map } from "@/components/map/Map";
import { Avatar, Badge, Button, Dialog, DialogContent, ErrorState, Field, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Skeleton, StatusBadge } from "@/components/ui";
import { useBooking, useOrderActions, useStaff } from "@/features/hooks";
import { formatDateShort, formatDateTime, formatINR } from "@/lib/format";

/** A4 — Order detail drawer */
export function OrderDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useBooking(id ?? "");
  const staff = useStaff();
  const actions = useOrderActions();
  const [staffId, setStaffId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [mode, setMode] = useState<"none" | "reject" | "cancel" | "invoice">("none");
  const b = q.data;
  const run = (p: Promise<unknown>, msg: string) => p.then(() => toast.success(msg)).catch((e) => toast.error(e.message));

  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent side="right" title={b ? b.code : "Order"} description={b ? `${b.businessName} · ${b.outlet.label} · ${formatDateTime(b.createdAt)}` : undefined} className="max-w-2xl">
        {q.isError ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : !b ? (
          <div className="space-y-3">
            <Skeleton className="h-40" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-1/3" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={b.status} />
              {b.slot === "express" ? (
                <Badge tone="primary">
                  <Zap className="size-3" /> Express
                </Badge>
              ) : (
                <Badge>{b.slot.replace(/_/g, " ")}</Badge>
              )}
              <Badge tone={b.payment.method === "credit" ? (b.payment.status === "CREDIT_OVERDUE" ? "danger" : b.payment.status === "CREDIT_PAID" ? "success" : "warning") : b.payment.method === "cod" ? "warning" : b.payment.status === "PAID" ? "success" : b.payment.status === "REFUNDED" ? "info" : "muted"}>
                {b.payment.method === "credit" ? (b.payment.status === "CREDIT_PAID" ? "Credit · paid" : b.payment.status === "CREDIT_OVERDUE" ? "Credit · overdue" : "On credit") : b.payment.method === "cod" ? (b.payment.status === "COD_COLLECTED" ? "Cash collected" : "COD pending") : `${b.payment.method.toUpperCase()} · ${b.payment.status.toLowerCase()}`}
              </Badge>
              <Badge>{b.cylinders} cyl · {b.emptiesToCollect} empties</Badge>
              <span className="ml-auto text-lg font-bold tabular-nums">{formatINR(b.charges.total)}</span>
            </div>

            <div className="flex flex-wrap gap-2 rounded-xl border bg-muted/40 p-3">
              {b.status === "PLACED" ? (
                <>
                  <Button size="sm" loading={actions.accept.isPending} onClick={() => run(actions.accept.mutateAsync(b.id), "Order accepted")}>
                    <Check /> Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setMode("reject")}>
                    <Ban /> Reject
                  </Button>
                </>
              ) : null}
              {["ACCEPTED", "ASSIGNED", "PLACED"].includes(b.status) ? (
                <>
                  <Select value={staffId} onValueChange={setStaffId}>
                    <SelectTrigger className="w-52">
                      <SelectValue placeholder={b.staff ? `Reassign from ${b.staff.name}` : "Choose delivery staff"} />
                    </SelectTrigger>
                    <SelectContent>
                      {(staff.data ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} · {s.currentDrops} drop{s.currentDrops === 1 ? "" : "s"} · {s.currentCylinders} cyl
                          {s.online ? "" : " · offline"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="secondary" disabled={!staffId} loading={actions.assign.isPending} onClick={() => run(actions.assign.mutateAsync({ id: b.id, staffId }), "Assigned")}>
                    <UserPlus /> Assign
                  </Button>
                  <Button size="sm" variant="navy" loading={actions.assign.isPending} onClick={() => run(actions.assign.mutateAsync({ id: b.id }), "Auto-assigned to the least-loaded partner")}>
                    <Wand2 /> Auto-assign
                  </Button>
                </>
              ) : null}
              {b.status === "DELIVERY_FAILED" ? (
                <Button size="sm" loading={actions.reschedule.isPending} onClick={() => run(actions.reschedule.mutateAsync(b.id), "Rescheduled — assign again")}>
                  <RotateCcw /> Reschedule
                </Button>
              ) : null}
              {canCancel(b.status) ? (
                <Button size="sm" variant="ghost" className="text-danger" onClick={() => setMode("cancel")}>
                  Cancel order
                </Button>
              ) : null}
              {!["DELIVERED", "REJECTED", "CANCELLED"].includes(b.status) ? (
                <Button size="sm" variant="ghost" className="ml-auto text-xs text-muted-foreground" loading={actions.advance.isPending} onClick={() => run(actions.advance.mutateAsync(b.id), "Advanced (demo)")} title="Demo: move to the next status">
                  Advance <ChevronRight />
                </Button>
              ) : null}
            </div>

            {mode === "reject" || mode === "cancel" ? (
              <div className="rounded-xl border border-danger/40 p-3">
                <Field label={mode === "reject" ? "Reason for rejecting (the business will see this)" : "Reason for cancelling"}>
                  <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "reject" ? "e.g. Out of stock for this slot" : "e.g. Outlet requested"} />
                </Field>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="danger" disabled={reason.length < 3} onClick={() => run(mode === "reject" ? actions.reject.mutateAsync({ id: b.id, reason }) : actions.cancel.mutateAsync({ id: b.id, reason }), mode === "reject" ? "Order rejected" : "Order cancelled").then(() => setMode("none"))}>
                    Confirm
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setMode("none")}>
                    Back
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <section className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Business account</h4>
                <div className="flex items-center gap-3">
                  <Avatar name={b.businessName} size={36} />
                  <div className="min-w-0">
                    <p className="font-semibold">{b.businessName}</p>
                    <p className="text-xs text-muted-foreground">{BUSINESS_TYPE_LABELS[b.businessType]} · {b.ownerName} · +91 {b.contactPhone}</p>
                  </div>
                  <a href={`tel:${b.contactPhone}`} className="ml-auto rounded-lg border p-2 hover:bg-muted" aria-label="Call outlet">
                    <Phone className="size-4" />
                  </a>
                </div>
                <p className="text-sm">
                  <span className="font-medium">{b.outlet.label}</span> · {b.outlet.line1}, {b.outlet.line2}
                  <br />
                  <span className="text-muted-foreground">
                    {b.outlet.city} — {b.outlet.pincode}
                    {b.outlet.contactName ? ` · ${b.outlet.contactName}` : ""}
                  </span>
                </p>
              </section>
              <section className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Items</h4>
                <ul className="text-sm">
                  {b.items.map((i) => (
                    <li key={i.cylinderTypeId} className="flex justify-between py-0.5">
                      <span>
                        {i.qty} × {i.name}
                      </span>
                      <span className="tabular-nums">{formatINR(i.qty * i.unitPrice)}</span>
                    </li>
                  ))}
                  {b.charges.slabDiscount ? (
                    <li className="flex justify-between py-0.5 text-success">
                      <span>Slab discount included</span>
                      <span className="tabular-nums">− {formatINR(b.charges.slabDiscount)}</span>
                    </li>
                  ) : null}
                  <li className="flex justify-between py-0.5 text-muted-foreground">
                    <span>Delivery + fees</span>
                    <span className="tabular-nums">{formatINR(b.charges.delivery + b.charges.convenience + b.charges.express)}</span>
                  </li>
                  <li className="flex justify-between py-0.5 text-muted-foreground">
                    <span>GST @ 18%</span>
                    <span className="tabular-nums">{formatINR(b.charges.gst)}</span>
                  </li>
                  <li className="mt-1 flex justify-between border-t pt-1 font-semibold">
                    <span>Total</span>
                    <span className="tabular-nums">{formatINR(b.charges.total)}</span>
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  Delivery OTP: <span className="font-mono font-bold text-foreground">{b.deliveryOtp}</span> · {b.status === "DELIVERED" ? `${b.emptiesCollected} empties collected` : `${b.emptiesToCollect} empties to collect`}
                  {b.payment.method === "credit" && b.payment.dueAt ? ` · ${b.invoiceNo} due ${formatDateShort(b.payment.dueAt)}` : ` · ${b.invoiceNo}`}
                </p>
              </section>
            </div>

            <Map
              height={220}
              pins={[
                { id: "ag", lat: b.agencyLocation.lat, lng: b.agencyLocation.lng, kind: "agency", label: b.agencyName },
                { id: "c", lat: b.outlet.lat, lng: b.outlet.lng, kind: "customer", label: `${b.businessName} · ${b.outlet.label}`, sub: b.outlet.line1 },
                ...(b.staff && ["ASSIGNED", "OUT_FOR_DELIVERY"].includes(b.status) ? [{ id: "s", lat: b.staff.location.lat, lng: b.staff.location.lng, kind: (b.status === "OUT_FOR_DELIVERY" ? "staff" : "staff-idle") as "staff" | "staff-idle", label: b.staff.name, sub: b.etaMinutes != null ? `ETA ${b.etaMinutes} min` : undefined }] : []),
              ]}
              routes={b.route && b.status === "OUT_FOR_DELIVERY" ? [{ id: "r", points: b.route }] : []}
            />

            {b.staff ? (
              <div className="flex items-center gap-3 rounded-xl border p-3">
                <Avatar name={b.staff.name} color="#C6953F" size={36} />
                <div className="flex-1">
                  <p className="text-sm font-semibold">{b.staff.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {b.staff.vehicle} · {b.staff.vehicleNo} · {b.staff.onTimePct}% on time
                  </p>
                </div>
                {b.status === "OUT_FOR_DELIVERY" ? <Badge tone="primary">ETA {b.etaMinutes ?? "—"} min</Badge> : null}
              </div>
            ) : null}

            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h4>
              <ol className="space-y-2 text-sm">
                {b.statusHistory.map((h, i) => (
                  <li key={i} className="flex gap-3">
                    <span className={`mt-1.5 size-2 shrink-0 rounded-full ${TIMELINE_STEPS.includes(h.status) ? "bg-success" : h.status.includes("FAIL") || h.status === "REJECTED" || h.status === "CANCELLED" ? "bg-danger" : "bg-muted-foreground"}`} />
                    <div className="flex-1">
                      <p className="font-medium">
                        {STATUS_LABELS[h.status as BookingStatus]} <span className="text-xs font-normal text-muted-foreground">by {h.by}</span>
                      </p>
                      {h.note ? <p className="text-xs text-muted-foreground">{h.note}</p> : null}
                    </div>
                    <span className="text-xs text-faint">{formatDateTime(h.at)}</span>
                  </li>
                ))}
              </ol>
            </section>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setMode(mode === "invoice" ? "none" : "invoice")}>
                <FileText /> {mode === "invoice" ? "Hide invoice" : "View invoice"}
              </Button>
            </div>
            {mode === "invoice" ? (
              <div className="rounded-xl border bg-card p-5 font-mono text-xs">
                <p className="text-base font-bold">TAX INVOICE · {b.invoiceNo}</p>
                <p className="text-muted-foreground">
                  {b.agencyName} · {b.agencyOmc} distributor · GSTIN 36XXXXX0000X1Z0 (mock)
                </p>
                <p className="mt-3">
                  Bill to: {b.businessName} ({b.outlet.label}), {b.outlet.line1}, {b.outlet.pincode}
                </p>
                <table className="mt-3 w-full">
                  <tbody>
                    {b.items.map((i) => (
                      <tr key={i.cylinderTypeId}>
                        <td>
                          {i.name} × {i.qty}
                        </td>
                        <td className="text-right">{formatINR(i.qty * i.unitPrice)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>Delivery</td>
                      <td className="text-right">{formatINR(b.charges.delivery)}</td>
                    </tr>
                    <tr>
                      <td>Convenience fee</td>
                      <td className="text-right">{formatINR(b.charges.convenience)}</td>
                    </tr>
                    {b.charges.express ? (
                      <tr>
                        <td>Express</td>
                        <td className="text-right">{formatINR(b.charges.express)}</td>
                      </tr>
                    ) : null}
                    <tr>
                      <td>CGST @ 9%</td>
                      <td className="text-right">{formatINR(b.charges.gst / 2)}</td>
                    </tr>
                    <tr>
                      <td>SGST @ 9%</td>
                      <td className="text-right">{formatINR(b.charges.gst / 2)}</td>
                    </tr>
                    <tr className="border-t font-bold">
                      <td>Total</td>
                      <td className="text-right">{formatINR(b.charges.total)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className="mt-3 text-faint">Illustrative prototype invoice — not a valid tax document.</p>
              </div>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
