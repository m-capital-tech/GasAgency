"use client";
import { Megaphone, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/Shell";
import { Avatar, Badge, Button, Checkbox, Dialog, DialogContent, EmptyState, ErrorState, Input, OmcBadge, StatusBadge, TBody, THead, Table, TableSkeleton, Tabs, TabsList, TabsTrigger, Tr } from "@/components/ui";
import { useAgencyId, useCustomers, post, get } from "@/features/hooks";
import { useQuery } from "@tanstack/react-query";
import { formatDateShort, formatINR, formatDateTime } from "@/lib/format";

/** A7 — Customers */
export default function CustomersPage() {
  const agencyId = useAgencyId();
  const customers = useCustomers();
  const [tab, setTab] = useState<"all" | "due">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => (customers.data ?? []).filter((c) => (tab === "all" || c.dueForRefill) && (!search || c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search))), [customers.data, tab, search]);
  const due = (customers.data ?? []).filter((c) => c.dueForRefill);
  const history = useQuery({ queryKey: ["cust-history", open], queryFn: () => get(`/bookings?customerId=${open}`), enabled: !!open });
  const cust = (customers.data ?? []).find((c) => c.userId === open);

  const campaign = async () => {
    const ids = selected.size ? [...selected] : due.map((c) => c.userId);
    setBusy(true);
    try {
      const r = await post(`/agency/${agencyId}/campaign`, { customerIds: ids });
      toast.success(`Reminder campaign sent to ${r.sent} customer(s)`, { description: "Each one gets an in-app 'Time for a refill?' nudge." });
      setSelected(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Customers" subtitle={`${(customers.data ?? []).length} linked · ${due.length} due for refill`}>
        <Button variant="secondary" onClick={campaign} loading={busy} disabled={!due.length && !selected.size}>
          <Megaphone /> {selected.size ? `Remind ${selected.size} selected` : `Remind all due (${due.length})`}
        </Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="h-7">All customers</TabsTrigger>
            <TabsTrigger value="due" className="h-7">Due for refill ({due.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or phone" className="h-9 w-64 pl-9" />
        </div>
      </div>
      <div className="rounded-2xl border bg-card">
        {customers.isLoading ? (
          <TableSkeleton />
        ) : customers.isError ? (
          <ErrorState onRetry={() => customers.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState title={tab === "due" ? "Nobody is due right now" : "No customers found"} body={tab === "due" ? "Customers appear here 3 days before their estimated run-out date." : "Customers get linked when they onboard with your distributor code or are auto-assigned by pincode."} />
        ) : (
          <Table>
            <THead>
              <tr>
                <th className="w-8"></th>
                <th>Customer</th>
                <th>Type</th>
                <th>Connection</th>
                <th>Pincode</th>
                <th className="text-right">Bookings</th>
                <th>Last refill</th>
                <th>Next due</th>
                <th></th>
              </tr>
            </THead>
            <TBody>
              {list.map((c) => (
                <Tr key={c.userId} className="cursor-pointer" onClick={() => setOpen(c.userId)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(c.userId)} onCheckedChange={() => setSelected((s) => { const n = new Set(s); n.has(c.userId) ? n.delete(c.userId) : n.add(c.userId); return n; })} aria-label={`Select ${c.name}`} />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={c.name} color={c.avatarColor} size={30} />
                      <div>
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">+91 {c.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone={c.type === "commercial" ? "info" : "muted"}>{c.type}</Badge>
                  </td>
                  <td className="text-xs">{c.connection ? <span className="flex items-center gap-1.5"><OmcBadge omc={c.connection.omc} /> {c.connection.consumerNo}</span> : <span className="text-faint">Auto-assigned</span>}</td>
                  <td className="text-xs">{c.addresses[0]?.pincode}</td>
                  <td className="text-right tabular-nums">{c.totalBookings}</td>
                  <td className="text-xs">{c.lastRefillAt ? formatDateShort(c.lastRefillAt) : "—"}</td>
                  <td className="text-xs">{c.reminder.nextDate ? <span className={c.dueForRefill ? "font-semibold text-primary" : ""}>{formatDateShort(c.reminder.nextDate)}</span> : "—"}</td>
                  <td>{c.dueForRefill ? <Badge tone="primary" dot>Due</Badge> : null}</td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent side="right" title={cust?.name ?? "Customer"} description={cust ? `+91 ${cust.phone} · ${cust.type} · ${cust.addresses[0]?.line1}, ${cust.addresses[0]?.pincode}` : undefined}>
          {cust ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-muted p-3"><p className="text-xl font-bold">{cust.totalBookings}</p><p className="text-xs text-muted-foreground">bookings</p></div>
                <div className="rounded-xl bg-muted p-3"><p className="text-xl font-bold">{cust.reminder.avgCycleDays}d</p><p className="text-xs text-muted-foreground">avg cycle</p></div>
                <div className="rounded-xl bg-muted p-3"><p className="text-xl font-bold">{cust.lastRefillAt ? formatDateShort(cust.lastRefillAt) : "—"}</p><p className="text-xs text-muted-foreground">last refill</p></div>
              </div>
              <Button variant="secondary" size="sm" onClick={() => post(`/agency/${agencyId}/campaign`, { customerIds: [cust.userId] }).then(() => toast.success("Reminder sent"))}>
                <Megaphone /> Send refill reminder
              </Button>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Booking history</h4>
              <ul className="divide-y text-sm">
                {(history.data ?? []).map((b: any) => (
                  <li key={b.id} className="flex items-center gap-3 py-2">
                    <span className="w-24 font-semibold">{b.code}</span>
                    <span className="flex-1 text-xs text-muted-foreground">{b.items.map((i: any) => `${i.qty} × ${i.name}`).join(", ")} · {formatDateTime(b.createdAt)}</span>
                    <span className="tabular-nums">{formatINR(b.charges.total, { decimals: false })}</span>
                    <StatusBadge status={b.status} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
