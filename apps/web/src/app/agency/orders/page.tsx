"use client";
import { BUSINESS_TYPE_LABELS, type BookingStatus } from "@gassetu/shared";
import { Check, Columns3, List, Search, Wand2, Zap } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { PageHeader } from "@/components/shell/Shell";
import { Badge, Button, Checkbox, EmptyState, ErrorState, Input, NativeSelect, StatusBadge, TBody, THead, Table, TableSkeleton, Tabs, TabsList, TabsTrigger, Tr } from "@/components/ui";
import { useOrderActions, useOrders, useStaff, type ExpandedBooking } from "@/features/hooks";
import { formatDateShort, formatINR, formatTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLUMNS: { key: string; label: string; statuses: BookingStatus[] }[] = [
  { key: "new", label: "New", statuses: ["PLACED"] },
  { key: "accepted", label: "Accepted", statuses: ["ACCEPTED"] },
  { key: "assigned", label: "Assigned", statuses: ["ASSIGNED"] },
  { key: "ofd", label: "Out for delivery", statuses: ["OUT_FOR_DELIVERY"] },
  { key: "done", label: "Delivered", statuses: ["DELIVERED"] },
  { key: "problem", label: "Failed / Cancelled", statuses: ["DELIVERY_FAILED", "REJECTED", "CANCELLED", "PAYMENT_FAILED"] },
];

function OrdersBoard() {
  const params = useSearchParams();
  const router = useRouter();
  const orders = useOrders();
  const staff = useStaff();
  const actions = useOrderActions();
  const [view, setView] = useState<"board" | "list">("board");
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [f, setF] = useState({ date: "today", type: "all", payment: "all", staff: "all", pincode: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(params.get("open"));
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const [seen, setSeen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!orders.data) return;
    const ids = new Set(orders.data.map((b) => b.id));
    if (seen.size) {
      const fresh = [...ids].filter((id) => !seen.has(id));
      if (fresh.length) {
        setFlash(new Set(fresh));
        setTimeout(() => setFlash(new Set()), 2500);
      }
    }
    setSeen(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders.data]);

  const filtered = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (orders.data ?? []).filter((b) => {
      const s = search.toLowerCase();
      if (s && !(b.code.toLowerCase().includes(s) || b.businessName.toLowerCase().includes(s) || b.contactPhone.includes(s) || b.invoiceNo.toLowerCase().includes(s))) return false;
      const created = new Date(b.createdAt);
      const openStatus = !["DELIVERED", "REJECTED", "CANCELLED", "PAYMENT_FAILED"].includes(b.status);
      if (f.date === "today" && created < today && !openStatus) return false;
      if (f.date === "7d" && created < new Date(today.getTime() - 7 * 86400000)) return false;
      if (f.type !== "all" && b.businessType !== f.type) return false;
      if (f.payment !== "all" && (f.payment === "cod" ? b.payment.method !== "cod" : f.payment === "credit" ? b.payment.method !== "credit" : b.payment.method === "cod" || b.payment.method === "credit")) return false;
      if (f.staff !== "all" && b.assignedStaffId !== f.staff) return false;
      if (f.pincode && !b.outlet.pincode.startsWith(f.pincode)) return false;
      if (tab !== "all") {
        const col = COLUMNS.find((c) => c.key === tab)!;
        if (!col.statuses.includes(b.status)) return false;
      }
      return true;
    });
  }, [orders.data, search, f, tab]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  const bulk = (action: "accept" | "auto_assign") =>
    actions.bulk
      .mutateAsync({ ids: [...selected], action })
      .then((r: any) => {
        toast.success(`${r.updated} order(s) ${action === "accept" ? "accepted" : "auto-assigned"}`);
        setSelected(new Set());
      })
      .catch((e) => toast.error(e.message));

  const openDrawer = (id: string) => {
    setOpen(id);
    router.replace(`/agency/orders?open=${id}`, { scroll: false });
  };
  const closeDrawer = () => {
    setOpen(null);
    router.replace("/agency/orders", { scroll: false });
  };

  const Card = ({ b }: { b: ExpandedBooking }) => (
    <div role="button" tabIndex={0} onClick={() => openDrawer(b.id)} onKeyDown={(e) => e.key === "Enter" && openDrawer(b.id)} className={cn("w-full cursor-pointer rounded-xl border bg-card p-3 text-left text-sm shadow-sm transition hover:border-primary/60 hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", flash.has(b.id) && "flash-row", selected.has(b.id) && "ring-2 ring-primary/40")}>
      <div className="flex items-center gap-2">
        <span onClick={(e) => { e.stopPropagation(); toggle(b.id); }}>
          <Checkbox checked={selected.has(b.id)} aria-label={`Select ${b.code}`} />
        </span>
        <span className="font-semibold">{b.code}</span>
        {b.slot === "express" ? <Zap className="size-3.5 text-primary" /> : null}
        <span className="ml-auto text-xs text-faint">{relativeTime(b.createdAt)}</span>
      </div>
      <p className="mt-1.5 truncate font-medium">{b.businessName}</p>
      <p className="truncate text-xs text-muted-foreground">
        {b.outlet.label} · {b.outlet.line2} · {b.outlet.pincode}
      </p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        <span className="font-semibold">{b.items.map((i) => `${i.qty} × ${i.name.split(" ")[0]}`).join(" + ")}</span>
        <span className="text-muted-foreground">· {b.emptiesToCollect} empties</span>
        <span className="ml-auto font-semibold tabular-nums">{formatINR(b.charges.total, { decimals: false })}</span>
        <Badge tone={b.payment.method === "credit" ? "info" : b.payment.method === "cod" ? "warning" : "success"}>{b.payment.method === "credit" ? "Credit" : b.payment.method === "cod" ? "COD" : "Paid"}</Badge>
      </div>
      {b.staff ? <p className="mt-1.5 text-xs text-info">🛵 {b.staff.name}{b.status === "OUT_FOR_DELIVERY" && b.etaMinutes != null ? ` · ETA ${b.etaMinutes} min` : ""}</p> : null}
      {b.status === "PLACED" ? (
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" className="h-7 flex-1" onClick={(e) => { e.stopPropagation(); actions.accept.mutateAsync(b.id).then(() => toast.success("Accepted")).catch((err) => toast.error(err.message)); }}>
            <Check /> Accept
          </Button>
          <Button size="sm" variant="navy" className="h-7 flex-1" onClick={(e) => { e.stopPropagation(); actions.assign.mutateAsync({ id: b.id }).then(() => toast.success("Auto-assigned")).catch((err) => toast.error(err.message)); }}>
            <Wand2 /> Auto-assign
          </Button>
        </div>
      ) : null}
      {b.status === "ACCEPTED" ? (
        <Button size="sm" variant="navy" className="mt-2 h-7 w-full" onClick={(e) => { e.stopPropagation(); actions.assign.mutateAsync({ id: b.id }).then(() => toast.success("Auto-assigned")).catch((err) => toast.error(err.message)); }}>
          <Wand2 /> Auto-assign
        </Button>
      ) : null}
    </div>
  );

  return (
    <>
      <PageHeader title="Orders" subtitle={`${(orders.data ?? []).filter((b) => b.status === "PLACED").length} new · ${filtered.length} shown`}>
        {selected.size ? (
          <>
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <Button size="sm" onClick={() => bulk("accept")} loading={actions.bulk.isPending}>
              <Check /> Bulk accept
            </Button>
            <Button size="sm" variant="navy" onClick={() => bulk("auto_assign")} loading={actions.bulk.isPending}>
              <Wand2 /> Bulk auto-assign
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </>
        ) : null}
        <Tabs value={view} onValueChange={(v) => setView(v as any)}>
          <TabsList className="h-9">
            <TabsTrigger value="board" className="h-7"><Columns3 className="size-3.5" /> Board</TabsTrigger>
            <TabsTrigger value="list" className="h-7"><List className="size-3.5" /> List</TabsTrigger>
          </TabsList>
        </Tabs>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search order, business, invoice, phone" className="h-9 w-64 pl-9" />
        </div>
        <NativeSelect className="h-9 w-auto" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date">
          <option value="today">Today + open</option>
          <option value="7d">Last 7 days</option>
          <option value="all">All time</option>
        </NativeSelect>
        <NativeSelect className="h-9 w-auto" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} aria-label="Business type">
          <option value="all">All business types</option>
          {Object.entries(BUSINESS_TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect className="h-9 w-auto" value={f.payment} onChange={(e) => setF({ ...f, payment: e.target.value })} aria-label="Payment">
          <option value="all">All payments</option>
          <option value="credit">Credit</option>
          <option value="online">Prepaid</option>
          <option value="cod">COD</option>
        </NativeSelect>
        <NativeSelect className="h-9 w-auto" value={f.staff} onChange={(e) => setF({ ...f, staff: e.target.value })} aria-label="Staff">
          <option value="all">All staff</option>
          {(staff.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
        <Input value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value.replace(/\D/g, "") })} placeholder="Pincode" className="h-9 w-28" />
        {view === "list" ? (
          <NativeSelect className="h-9 w-auto" value={tab} onChange={(e) => setTab(e.target.value)} aria-label="Status">
            <option value="all">All statuses</option>
            {COLUMNS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        ) : null}
      </div>

      {orders.isLoading ? (
        <TableSkeleton rows={8} />
      ) : orders.isError ? (
        <ErrorState message={(orders.error as Error).message} onRetry={() => orders.refetch()} />
      ) : view === "board" ? (
        <div className="flex gap-3 overflow-x-auto pb-3">
          {COLUMNS.map((col) => {
            const items = filtered.filter((b) => col.statuses.includes(b.status));
            return (
              <div key={col.key} className="flex min-h-[60vh] w-[272px] shrink-0 flex-col rounded-2xl bg-muted/60 p-2">
                <div className="flex items-center justify-between px-1 pb-2 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.label}</p>
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", col.key === "new" && items.length ? "bg-primary text-white" : "bg-card text-muted-foreground")}>{items.length}</span>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {items.length === 0 ? <p className="px-2 py-6 text-center text-xs text-faint">Nothing here</p> : items.map((b) => <Card key={b.id} b={b} />)}
                </div>
              </div>
            );
          })}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No orders match" body="Try widening the date range or clearing filters." />
      ) : (
        <div className="rounded-2xl border bg-card">
          <Table>
            <THead>
              <tr>
                <th className="w-8"></th>
                <th>Order</th>
                <th>Business</th>
                <th>Cylinders</th>
                <th>Slot</th>
                <th>Payment</th>
                <th>Staff</th>
                <th className="text-right">Total</th>
                <th>Status</th>
                <th>Placed</th>
              </tr>
            </THead>
            <TBody>
              {filtered.map((b) => (
                <Tr key={b.id} className={cn("cursor-pointer", flash.has(b.id) && "flash-row")} onClick={() => openDrawer(b.id)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(b.id)} onCheckedChange={() => toggle(b.id)} aria-label={`Select ${b.code}`} />
                  </td>
                  <td className="font-semibold">{b.code}</td>
                  <td>
                    <p className="font-medium">{b.businessName}</p>
                    <p className="text-xs text-muted-foreground">{b.outlet.label} · {b.outlet.pincode}</p>
                  </td>
                  <td className="text-xs">
                    {b.items.map((i) => `${i.qty} × ${i.name.split(" ")[0]}`).join(" + ")} <span className="text-muted-foreground">· {b.emptiesToCollect} empties</span>
                  </td>
                  <td className="text-xs">{b.slot === "express" ? "⚡ Express" : b.slot === "tomorrow_morning" ? "Before opening" : b.slot.replace(/_/g, " ")}</td>
                  <td>
                    <Badge tone={b.payment.method === "credit" ? "info" : b.payment.method === "cod" ? "warning" : "success"}>{b.payment.method === "credit" ? "Credit" : b.payment.method === "cod" ? "COD" : b.payment.method.toUpperCase()}</Badge>
                  </td>
                  <td className="text-xs">{b.staff?.name ?? "—"}</td>
                  <td className="text-right tabular-nums">{formatINR(b.charges.total, { decimals: false })}</td>
                  <td>
                    <StatusBadge status={b.status} />
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {formatDateShort(b.createdAt)}, {formatTime(b.createdAt)}
                  </td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </div>
      )}
      <OrderDrawer id={open} onClose={closeDrawer} />
    </>
  );
}

export default function OrdersPage() {
  return (
    <Suspense>
      <OrdersBoard />
    </Suspense>
  );
}
