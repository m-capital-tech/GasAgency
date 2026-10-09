"use client";

import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Flame,
  LogOut,
  PackageCheck,
  RefreshCw,
  Route,
  Truck,
  Warehouse,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, NativeSelect, Textarea } from "@/components/ui";
import {
  OperationsApiError,
  operationsApi,
  type OperationsAgency,
  type OperationsInventory,
  type OperationsOrder,
  type OperationsSession,
  type OperationsStaff,
} from "@/lib/operations-api";

const statusMeta: Record<OperationsOrder["status"], { label: string; tone: "muted" | "primary" | "success" | "warning" | "danger" | "info" }> = {
  placed: { label: "New", tone: "info" },
  accepted: { label: "Accepted", tone: "primary" },
  assigned: { label: "Assigned", tone: "warning" },
  out_for_delivery: { label: "Out for delivery", tone: "primary" },
  delivery_failed: { label: "Delivery failed", tone: "danger" },
  delivered: { label: "Delivered", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

const activeStatuses = new Set<OperationsOrder["status"]>(["accepted", "assigned", "out_for_delivery", "delivery_failed"]);
const terminalStatuses = new Set<OperationsOrder["status"]>(["delivered", "rejected", "cancelled"]);

function money(value: string | number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));
}

function shortDate(value: string | null) {
  if (!value) return "Not specified";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined }).format(new Date(value));
}

function actionError(cause: unknown) {
  return cause instanceof Error ? cause.message : "The operation could not be completed.";
}

function SummaryCard({ label, value, icon: Icon, note }: { label: string; value: string | number; icon: typeof Clock3; note: string }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between p-5">
        <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-[11px] text-faint">{note}</p></div>
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon className="size-5" /></span>
      </CardContent>
    </Card>
  );
}

function OrderRow({ order, selected, onClick }: { order: OperationsOrder; selected: boolean; onClick: () => void }) {
  const quantity = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <button onClick={onClick} className={`w-full border-b p-4 text-left transition-colors last:border-b-0 ${selected ? "bg-primary-soft/70" : "hover:bg-muted/60"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="truncate text-sm font-semibold">{order.tenant.displayName}</p><p className="mt-0.5 text-xs text-muted-foreground">{order.orderNumber} · {quantity} cylinder{quantity === 1 ? "" : "s"}</p></div>
        <Badge tone={statusMeta[order.status].tone} dot>{statusMeta[order.status].label}</Badge>
      </div>
      <div className="mt-3 flex items-center justify-between text-xs"><span className="truncate text-muted-foreground">{order.outlet.label}</span><strong>{money(order.amounts.totalAmount)}</strong></div>
    </button>
  );
}

function OrderActions({ order, staff, busy, onTransition }: { order: OperationsOrder; staff: OperationsStaff[]; busy: boolean; onTransition: (body: Record<string, unknown>) => Promise<void> }) {
  const [reason, setReason] = useState("");
  const [staffId, setStaffId] = useState(order.deliveryStaff?.publicId ?? staff.find((member) => member.status === "active")?.publicId ?? "");
  const [cashCollected, setCashCollected] = useState(false);
  const [empties, setEmpties] = useState<Record<string, number>>(() => Object.fromEntries(order.items.map((item) => [item.cylinderTypeCode, 0])));

  if (terminalStatuses.has(order.status)) return <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">This order is complete and no further fulfillment action is available.</p>;

  if (order.status === "placed") return (
    <div className="grid gap-3">
      <Button loading={busy} onClick={() => onTransition({ action: "accept" })}><PackageCheck />Accept and reserve stock</Button>
      <Field label="Reason to reject or cancel"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for rejection" /></Field>
      <div className="flex gap-2"><Button className="flex-1" variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => onTransition({ action: "reject", reason: reason.trim() })}>Reject order</Button><Button className="flex-1" variant="outline" loading={busy} disabled={reason.trim().length < 3} onClick={() => onTransition({ action: "cancel", reason: reason.trim() })}>Cancel</Button></div>
    </div>
  );

  if (order.status === "accepted" || order.status === "assigned") return (
    <div className="grid gap-3">
      <Field label="Delivery staff">
        <NativeSelect value={staffId} onChange={(event) => setStaffId(event.target.value)}>
          <option value="">Select an available staff member</option>
          {staff.filter((member) => member.status === "active").map((member) => <option key={member.publicId} value={member.publicId}>{member.fullName} · {member.vehicleNumber} · {member.activeDrops} active</option>)}
        </NativeSelect>
      </Field>
      <Button loading={busy} disabled={!staffId} onClick={() => onTransition({ action: "assign", deliveryStaffPublicId: staffId })}><Truck />{order.status === "assigned" ? "Reassign delivery" : "Assign delivery"}</Button>
      {order.status === "assigned" ? <Button variant="success" loading={busy} onClick={() => onTransition({ action: "dispatch" })}><Route />Dispatch cylinders</Button> : null}
      <Field label="Cancellation reason"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="At least 3 characters" /></Field>
      <Button variant="outline" loading={busy} disabled={reason.trim().length < 3} onClick={() => onTransition({ action: "cancel", reason: reason.trim() })}>Cancel and release stock</Button>
    </div>
  );

  if (order.status === "delivery_failed") return (
    <div className="grid gap-3">
      <p className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"><strong>Last failure:</strong> {order.failureReason ?? "No reason recorded"}</p>
      <Button loading={busy} onClick={() => onTransition({ action: "reschedule" })}><RefreshCw />Reschedule and reserve stock</Button>
      <Field label="Cancellation reason"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="At least 3 characters" /></Field>
      <Button variant="outline" loading={busy} disabled={reason.trim().length < 3} onClick={() => onTransition({ action: "cancel", reason: reason.trim() })}>Cancel order</Button>
    </div>
  );

  return (
    <div className="grid gap-4">
      <div className="rounded-xl bg-muted p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Complete delivery</p>
        <div className="mt-3 grid gap-3">
          {order.items.map((item) => (
            <Field key={item.cylinderTypeCode} label={`${item.displayName} empties collected`}>
              <Input type="number" min={0} max={item.quantity} value={empties[item.cylinderTypeCode] ?? 0} onChange={(event) => setEmpties((current) => ({ ...current, [item.cylinderTypeCode]: Math.max(0, Number(event.target.value) || 0) }))} />
            </Field>
          ))}
          {order.payment.method === "cod" ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={cashCollected} onChange={(event) => setCashCollected(event.target.checked)} className="size-4 accent-primary" />Cash of {money(order.amounts.totalAmount)} collected</label> : <p className="text-xs text-muted-foreground">This order will be invoiced against the tenant’s approved credit terms.</p>}
          <Button variant="success" loading={busy} disabled={order.payment.method === "cod" && !cashCollected} onClick={() => onTransition({ action: "deliver", cashCollected, emptiesCollected: Object.entries(empties).filter(([, quantity]) => quantity > 0).map(([cylinderTypeCode, quantity]) => ({ cylinderTypeCode, quantity })) })}><CheckCircle2 />Confirm delivery and issue invoice</Button>
        </div>
      </div>
      <Field label="Failed delivery reason"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. outlet closed" /></Field>
      <Button variant="danger" loading={busy} disabled={reason.trim().length < 3} onClick={() => onTransition({ action: "fail_delivery", reason: reason.trim() })}><AlertTriangle />Mark delivery failed</Button>
    </div>
  );
}

export default function OperationsOrdersPage() {
  const router = useRouter();
  const [session, setSession] = useState<OperationsSession | null>(null);
  const [agency, setAgency] = useState<OperationsAgency | null>(null);
  const [orders, setOrders] = useState<OperationsOrder[]>([]);
  const [staff, setStaff] = useState<OperationsStaff[]>([]);
  const [inventory, setInventory] = useState<OperationsInventory[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transitionKeys = useRef(new Map<string, string>());

  const loadAgency = useCallback(async (target: OperationsAgency, quiet = false) => {
    if (!quiet) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [ordersResult, staffResult, inventoryResult] = await Promise.all([operationsApi.orders(target.publicId), operationsApi.staff(target.publicId), operationsApi.inventory(target.publicId)]);
      setAgency(target); setOrders(ordersResult.orders); setStaff(staffResult.staff); setInventory(inventoryResult.inventory);
      setSelectedId((current) => ordersResult.orders.some((order) => order.publicId === current) ? current : ordersResult.orders[0]?.publicId ?? null);
    } catch (cause) {
      if (cause instanceof OperationsApiError && cause.status === 401) { router.replace("/operations/login"); return; }
      setError(actionError(cause));
    } finally { setLoading(false); setRefreshing(false); }
  }, [router]);

  useEffect(() => {
    let active = true;
    operationsApi.session().then((result) => {
      if (!active) return;
      if (!result.agencies.length) throw new Error("This account has no authorized agency operations scope.");
      setSession(result);
      return loadAgency(result.agencies[0]!);
    }).catch((cause) => {
      if (!active) return;
      if (cause instanceof OperationsApiError && cause.status === 401) router.replace("/operations/login");
      else { setError(actionError(cause)); setLoading(false); }
    });
    return () => { active = false; };
  }, [loadAgency, router]);

  const filteredOrders = useMemo(() => statusFilter === "all" ? orders : orders.filter((order) => order.status === statusFilter), [orders, statusFilter]);
  const selected = orders.find((order) => order.publicId === selectedId) ?? null;
  const availableStock = inventory.reduce((sum, item) => sum + item.availableFull, 0);
  const lowStock = inventory.filter((item) => item.availableFull <= item.lowStockThreshold).length;

  const transition = async (body: Record<string, unknown>) => {
    if (!agency || !selected) return;
    setTransitioning(true); setError(null);
    const requestIdentity = `${selected.publicId}:${JSON.stringify(body)}`;
    const idempotencyKey = transitionKeys.current.get(requestIdentity) ?? `web:${selected.publicId}:${String(body.action)}:${crypto.randomUUID()}`;
    transitionKeys.current.set(requestIdentity, idempotencyKey);
    try {
      const result = await operationsApi.transition(agency.publicId, selected.publicId, body, idempotencyKey);
      transitionKeys.current.delete(requestIdentity);
      setOrders((current) => current.map((order) => order.publicId === result.order.publicId ? result.order : order));
      const inventoryResult = await operationsApi.inventory(agency.publicId);
      setInventory(inventoryResult.inventory);
    } catch (cause) { setError(actionError(cause)); }
    finally { setTransitioning(false); }
  };

  const logout = async () => { try { await operationsApi.logout(); } finally { router.replace("/operations/login"); } };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-muted/40"><RefreshCw className="size-7 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">Loading agency operations…</span></main>;

  return (
    <main className="min-h-screen bg-muted/40">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white"><Flame className="size-5" /></span><div><h1 className="font-bold">Commercial LPG Operations</h1><p className="text-xs text-muted-foreground">Agency fulfillment control</p></div></div>
          <div className="flex flex-wrap items-center gap-2">
            {session && session.agencies.length > 1 ? <NativeSelect className="w-56" value={agency?.publicId ?? ""} onChange={(event) => { const next = session.agencies.find((item) => item.publicId === event.target.value); if (next) void loadAgency(next); }}>{session.agencies.map((item) => <option key={item.publicId} value={item.publicId}>{item.displayName}</option>)}</NativeSelect> : <Badge tone="primary">{agency?.displayName ?? "Agency"}</Badge>}
            <span className="hidden text-xs text-muted-foreground sm:inline">{session?.user.fullName}</span>
            <Button size="sm" variant="outline" onClick={() => agency && void loadAgency(agency, true)} loading={refreshing}><RefreshCw />Refresh</Button>
            <Button size="sm" variant="ghost" onClick={() => void logout()}><LogOut />Sign out</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:px-8">
        {error ? <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger"><span>{error}</span><button className="font-semibold" onClick={() => setError(null)}>Dismiss</button></div> : null}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="New orders" value={orders.filter((order) => order.status === "placed").length} icon={Clock3} note="Awaiting acceptance" />
          <SummaryCard label="Active fulfillment" value={orders.filter((order) => activeStatuses.has(order.status)).length} icon={Route} note="Accepted through delivery" />
          <SummaryCard label="Available cylinders" value={availableStock} icon={Warehouse} note={lowStock ? `${lowStock} item${lowStock === 1 ? "" : "s"} at low stock` : "All inventory above threshold"} />
          <SummaryCard label="Delivered value" value={money(orders.filter((order) => order.status === "delivered").reduce((sum, order) => sum + Number(order.amounts.totalAmount), 0))} icon={CircleDollarSign} note="Latest 100 orders" />
        </section>

        <section className="grid min-h-[660px] gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
          <Card className="overflow-hidden">
            <CardHeader className="items-center border-b pb-4"><div><CardTitle>Order queue</CardTitle><p className="mt-1 text-xs text-muted-foreground">{filteredOrders.length} order{filteredOrders.length === 1 ? "" : "s"}</p></div><NativeSelect className="w-40" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</NativeSelect></CardHeader>
            <div className="max-h-[590px] overflow-y-auto">{filteredOrders.length ? filteredOrders.map((order) => <OrderRow key={order.publicId} order={order} selected={selectedId === order.publicId} onClick={() => setSelectedId(order.publicId)} />) : <div className="p-8 text-center text-sm text-muted-foreground">No orders match this filter.</div>}</div>
          </Card>

          <Card>
            {selected ? <div className="grid h-full lg:grid-cols-[minmax(0,1fr)_340px]">
              <div className="border-b p-5 lg:border-b-0 lg:border-r lg:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="text-xl font-bold">{selected.orderNumber}</h2><Badge tone={statusMeta[selected.status].tone} dot>{statusMeta[selected.status].label}</Badge></div><p className="mt-1 text-sm text-muted-foreground">Placed {shortDate(selected.timestamps.placedAt)}</p></div><div className="text-right"><p className="text-xl font-bold">{money(selected.amounts.totalAmount)}</p><p className="text-xs uppercase text-muted-foreground">{selected.payment.method} · {selected.payment.status.replaceAll("_", " ")}</p></div></div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl bg-muted p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tenant</p><p className="mt-2 font-semibold">{selected.tenant.displayName}</p><p className="mt-1 text-xs text-muted-foreground">{selected.tenant.businessType} · GSTIN {selected.tenant.gstin}</p></div>
                  <div className="rounded-xl bg-muted p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery outlet</p><p className="mt-2 font-semibold">{selected.outlet.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{selected.outlet.address}<br />{selected.outlet.contactName ?? "No contact"}{selected.outlet.contactPhoneE164 ? ` · ${selected.outlet.contactPhoneE164}` : ""}</p></div>
                </div>

                <div className="mt-6"><h3 className="text-sm font-semibold">Order items</h3><div className="mt-2 overflow-hidden rounded-xl border">{selected.items.map((item) => <div key={item.cylinderTypeCode} className="flex items-center justify-between border-b px-4 py-3 text-sm last:border-b-0"><div><p className="font-medium">{item.displayName}</p><p className="text-xs text-muted-foreground">{item.quantity} × {money(item.unitPrice)} · {item.priceSource}</p></div><strong>{money(item.lineSubtotal)}</strong></div>)}</div></div>

                <div className="mt-6 grid gap-3 text-sm sm:grid-cols-3"><div><p className="text-xs text-muted-foreground">Delivery window</p><p className="mt-1 font-medium">{selected.delivery.slot.replaceAll("_", " ")} · {shortDate(selected.delivery.requestedDate)}</p></div><div><p className="text-xs text-muted-foreground">Expected empties</p><p className="mt-1 font-medium">{selected.delivery.emptiesExpected} expected · {selected.delivery.emptiesCollected} received</p></div><div><p className="text-xs text-muted-foreground">Assigned delivery</p><p className="mt-1 font-medium">{selected.deliveryStaff ? `${selected.deliveryStaff.fullName} · ${selected.deliveryStaff.vehicleNumber}` : "Not assigned"}</p></div></div>
                {selected.delivery.instructions ? <p className="mt-4 rounded-xl border border-warning/20 bg-warning-soft p-3 text-sm"><strong>Delivery instruction:</strong> {selected.delivery.instructions}</p> : null}
                {selected.invoice ? <div className="mt-4 flex items-center justify-between rounded-xl border border-success/20 bg-success-soft p-4 text-sm"><div><p className="font-semibold">Invoice {selected.invoice.invoiceNumber}</p><p className="text-xs text-muted-foreground">{selected.invoice.dueAt ? `Due ${shortDate(selected.invoice.dueAt)}` : "Paid on delivery"}</p></div><Badge tone={selected.invoice.status === "paid" ? "success" : "warning"}>{selected.invoice.status} · {money(selected.invoice.outstandingAmount)}</Badge></div> : null}

                <div className="mt-6"><h3 className="text-sm font-semibold">Activity</h3><div className="mt-3 grid gap-3">{selected.timeline.map((event, index) => <div key={`${event.occurredAt}-${index}`} className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /><div><p className="text-sm font-medium">{statusMeta[event.toStatus as OperationsOrder["status"]]?.label ?? event.toStatus}</p><p className="text-xs text-muted-foreground">{event.reason} · {event.actorName ?? "System"} · {shortDate(event.occurredAt)}</p></div></div>)}</div></div>
              </div>
              <aside className="p-5 lg:p-6"><div className="flex items-center gap-2"><ArrowRight className="size-4 text-primary" /><h3 className="font-semibold">Next action</h3></div><p className="mt-1 text-xs text-muted-foreground">Every change is permission-checked, audited, and safe to retry.</p><div className="mt-5"><OrderActions key={`${selected.publicId}:${selected.status}:${selected.deliveryStaff?.publicId ?? "unassigned"}`} order={selected} staff={staff} busy={transitioning} onTransition={transition} /></div>
                <div className="mt-6 border-t pt-5"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Inventory snapshot</p><div className="mt-3 grid gap-2">{inventory.map((item) => <div key={item.publicId} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs"><span>{item.displayName}</span><span className={item.availableFull <= item.lowStockThreshold ? "font-bold text-danger" : "font-semibold"}>{item.availableFull} available · {item.reservedFull} reserved</span></div>)}</div></div>
              </aside>
            </div> : <div className="flex h-full min-h-[500px] items-center justify-center text-sm text-muted-foreground">Select an order from the queue.</div>}
          </Card>
        </section>
      </div>
    </main>
  );
}
