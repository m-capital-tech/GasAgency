"use client";
import { BUSINESS_TYPE_LABELS } from "@gassetu/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, Flame, Megaphone, Search, Tag } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/Shell";
import { Avatar, Badge, Button, Checkbox, Dialog, DialogContent, EmptyState, ErrorState, Field, Input, OmcBadge, StatusBadge, TBody, THead, Table, TableSkeleton, Tabs, TabsList, TabsTrigger, Tr } from "@/components/ui";
import { q, useAccounts, useAgencyId, post, put, get } from "@/features/hooks";
import { formatDateShort, formatINR, formatDateTime, formatCompactINR } from "@/lib/format";

/** A7 — Business accounts */
export default function AccountsPage() {
  const agencyId = useAgencyId();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const prices = useQuery(q.accountPrices(agencyId));
  const [tab, setTab] = useState<"all" | "low" | "credit" | "overdue">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [payAmt, setPayAmt] = useState("");
  const [price19, setPrice19] = useState("");
  const list = useMemo(
    () =>
      (accounts.data ?? []).filter((b) => {
        if (search && !(b.name.toLowerCase().includes(search.toLowerCase()) || b.ownerName.toLowerCase().includes(search.toLowerCase()) || b.phone.includes(search))) return false;
        if (tab === "low") return b.lowStockOutlets > 0;
        if (tab === "credit") return b.credit.status === "approved";
        if (tab === "overdue") return b.creditOverdue > 0;
        return true;
      }),
    [accounts.data, tab, search],
  );
  const low = (accounts.data ?? []).filter((b) => b.lowStockOutlets > 0);
  const overdue = (accounts.data ?? []).filter((b) => b.creditOverdue > 0);
  const history = useQuery({ queryKey: ["acct-history", open], queryFn: () => get(`/bookings?businessId=${open}`), enabled: !!open });
  const ledger = useQuery({ queryKey: ["acct-ledger", open], queryFn: () => get(`/businesses/${open}/ledger`), enabled: !!open });
  const acct = (accounts.data ?? []).find((b) => b.userId === open);
  const negotiated = (prices.data ?? []).find((p: any) => p.businessId === open && p.cylinderTypeId === "cyl_19");

  const campaign = async () => {
    const ids = selected.size ? [...selected] : low.map((b) => b.userId);
    setBusy(true);
    try {
      const r = await post(`/agency/${agencyId}/campaign`, { businessIds: ids });
      toast.success(`Low-stock nudge sent to ${r.sent} account(s)`, { description: "Each outlet manager gets a 'Running low?' alert with one-tap reorder." });
      setSelected(new Set());
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["acct-ledger", open] });
    qc.invalidateQueries({ queryKey: ["acct-history", open] });
    qc.invalidateQueries({ queryKey: ["settlements"] });
  };
  const recordPayment = async () => {
    if (!acct || !Number(payAmt)) return;
    setBusy(true);
    try {
      const r = await post(`/agency/${agencyId}/accounts/${acct.userId}/payment`, { amount: Number(payAmt), note: "Collected by agency (NEFT/cheque)" });
      toast.success(`Payment recorded · ${r.paidInvoices.length} invoice(s) cleared`);
      setPayAmt("");
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const savePrice = async (price: number | null) => {
    if (!acct) return;
    setBusy(true);
    try {
      await put(`/agency/${agencyId}/accounts/${acct.userId}/price`, { cylinderTypeId: "cyl_19", price });
      qc.invalidateQueries({ queryKey: ["account-prices"] });
      toast.success(price ? `Negotiated 19 kg rate set to ${formatINR(price, { decimals: false })}` : "Negotiated rate removed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Business accounts" subtitle={`${(accounts.data ?? []).length} accounts · ${low.length} running low · ${formatCompactINR((accounts.data ?? []).reduce((s, b) => s + b.creditOutstanding, 0))} receivable`}>
        <Button variant="secondary" onClick={campaign} loading={busy} disabled={!low.length && !selected.size}>
          <Megaphone /> {selected.size ? `Nudge ${selected.size} selected` : `Nudge all running low (${low.length})`}
        </Button>
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-9">
            <TabsTrigger value="all" className="h-7">All</TabsTrigger>
            <TabsTrigger value="low" className="h-7"><Flame className="size-3.5" /> Running low ({low.length})</TabsTrigger>
            <TabsTrigger value="credit" className="h-7">Credit accounts</TabsTrigger>
            <TabsTrigger value="overdue" className="h-7">Overdue ({overdue.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search business, owner, phone" className="h-9 w-64 pl-9" />
        </div>
      </div>
      <div className="rounded-2xl border bg-card">
        {accounts.isLoading ? (
          <TableSkeleton />
        ) : accounts.isError ? (
          <ErrorState onRetry={() => accounts.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState title={tab === "low" ? "Nobody is running low" : tab === "overdue" ? "No overdue invoices" : "No accounts found"} body={tab === "low" ? "Accounts appear here when an outlet has ≤ 2 days of LPG left." : "Businesses get linked when they onboard with your distributor code or are auto-assigned by pincode."} />
        ) : (
          <Table>
            <THead>
              <tr>
                <th className="w-8"></th>
                <th>Business</th>
                <th>Type</th>
                <th>Outlets</th>
                <th>Stock</th>
                <th className="text-right">Cyl / 30d</th>
                <th className="text-right">Spend / 30d</th>
                <th>Credit</th>
                <th className="text-right">Outstanding</th>
                <th>Last delivery</th>
              </tr>
            </THead>
            <TBody>
              {list.map((b) => (
                <Tr key={b.userId} className="cursor-pointer" onClick={() => setOpen(b.userId)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(b.userId)} onCheckedChange={() => setSelected((s) => { const n = new Set(s); n.has(b.userId) ? n.delete(b.userId) : n.add(b.userId); return n; })} aria-label={`Select ${b.name}`} />
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <Avatar name={b.name} color={b.avatarColor} size={30} />
                      <div>
                        <p className="font-medium">{b.name}</p>
                        <p className="text-xs text-muted-foreground">{b.ownerName} · +91 {b.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="text-xs">{BUSINESS_TYPE_LABELS[b.type]}</td>
                  <td className="text-xs">{b.outlets.length}</td>
                  <td>{b.lowStockOutlets ? <Badge tone="danger" dot>{Math.min(...b.outlets.map((o) => o.daysLeft))}d left</Badge> : <Badge tone="success" dot>{Math.min(...b.outlets.map((o) => o.daysLeft))}d</Badge>}</td>
                  <td className="text-right tabular-nums">{b.cylinders30}</td>
                  <td className="text-right tabular-nums">{formatINR(b.spend30, { decimals: false })}</td>
                  <td>{b.credit.status === "approved" ? <Badge tone="info">net-{b.credit.termDays} · {formatCompactINR(b.credit.limit)}</Badge> : b.credit.status === "requested" ? <Badge tone="warning">requested</Badge> : <Badge>prepaid</Badge>}</td>
                  <td className={`text-right tabular-nums ${b.creditOverdue ? "font-semibold text-danger" : ""}`}>{b.creditOutstanding ? formatINR(b.creditOutstanding, { decimals: false }) : "—"}</td>
                  <td className="text-xs">{b.lastDeliveryAt ? formatDateShort(b.lastDeliveryAt) : "—"}</td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent side="right" title={acct?.name ?? "Account"} description={acct ? `${BUSINESS_TYPE_LABELS[acct.type]} · ${acct.ownerName} · +91 ${acct.phone}${acct.gstin ? ` · GSTIN ${acct.gstin}` : ""}` : undefined} className="max-w-2xl">
          {acct ? (
            <div className="space-y-5">
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="rounded-xl bg-muted p-3"><p className="text-xl font-bold">{acct.cylinders30}</p><p className="text-xs text-muted-foreground">cyl / 30d</p></div>
                <div className="rounded-xl bg-muted p-3"><p className="text-xl font-bold">{formatCompactINR(acct.spend30)}</p><p className="text-xs text-muted-foreground">spend / 30d</p></div>
                <div className="rounded-xl bg-muted p-3"><p className={`text-xl font-bold ${acct.creditOverdue ? "text-danger" : ""}`}>{formatCompactINR(acct.creditOutstanding)}</p><p className="text-xs text-muted-foreground">outstanding</p></div>
                <div className="rounded-xl bg-muted p-3"><p className="text-xl font-bold">{acct.outlets.reduce((s, o) => s + o.inUse + o.spareFull + o.emptiesHeld, 0)}</p><p className="text-xs text-muted-foreground">cyl with account</p></div>
              </div>

              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Outlets</h4>
                <ul className="divide-y rounded-xl border text-sm">
                  {acct.outlets.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 px-3 py-2">
                      <div className="flex-1">
                        <p className="font-medium">{o.label}</p>
                        <p className="text-xs text-muted-foreground">{o.line1}, {o.line2} · {o.pincode}{o.contactName ? ` · ${o.contactName}` : ""}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">{o.inUse} in use · {o.spareFull} spare · {o.emptiesHeld} empties</span>
                      <Badge tone={o.lowStock ? "danger" : "success"} dot>{o.daysLeft}d</Badge>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border p-3">
                  <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Banknote className="size-3.5" /> Credit</h4>
                  {acct.credit.status === "approved" ? (
                    <>
                      <p className="text-sm">Limit <b>{formatINR(acct.credit.limit, { decimals: false })}</b> · net-{acct.credit.termDays} · available <b>{formatINR(acct.creditAvailable, { decimals: false })}</b></p>
                      {acct.creditOverdue ? <p className="text-xs text-danger">{formatINR(acct.creditOverdue, { decimals: false })} overdue — credit ordering paused</p> : null}
                      <div className="mt-2 flex gap-2">
                        <Input value={payAmt} onChange={(e) => setPayAmt(e.target.value.replace(/\D/g, ""))} placeholder="Amount received" className="h-8" />
                        <Button size="sm" loading={busy} onClick={recordPayment} disabled={!payAmt}>Record payment</Button>
                      </div>
                      <p className="mt-1 text-[11px] text-faint">Oldest invoices are cleared first. Terms are set by GasSetu admin.</p>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">{acct.credit.status === "requested" ? "Credit requested — awaiting GasSetu approval." : "Prepaid account (no credit)."}</p>
                  )}
                </div>
                <div className="rounded-xl border p-3">
                  <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"><Tag className="size-3.5" /> Negotiated 19 kg rate</h4>
                  <p className="text-sm text-muted-foreground">{negotiated ? <>Currently <b className="text-foreground">{formatINR(negotiated.price, { decimals: false })}</b> per cylinder (overrides slab pricing when lower).</> : "None — slab pricing applies."}</p>
                  <div className="mt-2 flex gap-2">
                    <Input value={price19} onChange={(e) => setPrice19(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 1690" className="h-8" />
                    <Button size="sm" variant="secondary" loading={busy} onClick={() => savePrice(Number(price19))} disabled={!price19}>Set</Button>
                    {negotiated ? <Button size="sm" variant="ghost" onClick={() => savePrice(null)}>Remove</Button> : null}
                  </div>
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Ledger</h4>
                <ul className="divide-y rounded-xl border text-sm">
                  {(ledger.data ?? []).slice(0, 8).map((l: any) => (
                    <li key={l.id} className="flex items-center gap-3 px-3 py-2">
                      <span className={`w-16 text-xs font-semibold ${l.kind === "invoice" ? "text-primary" : "text-success"}`}>{l.kind}</span>
                      <span className="flex-1 text-xs text-muted-foreground">{l.note} · {formatDateShort(l.at)}{l.dueAt ? ` · due ${formatDateShort(l.dueAt)}` : ""}</span>
                      <span className="tabular-nums">{l.amount > 0 ? "+" : "−"}{formatINR(Math.abs(l.amount), { decimals: false })}</span>
                      <span className="w-20 text-right text-xs text-faint">bal {formatCompactINR(l.balance)}</span>
                    </li>
                  ))}
                  {(ledger.data ?? []).length === 0 ? <li className="px-3 py-3 text-xs text-muted-foreground">No credit activity yet.</li> : null}
                </ul>
              </section>

              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent orders</h4>
                <ul className="divide-y text-sm">
                  {(history.data ?? []).slice(0, 10).map((b: any) => (
                    <li key={b.id} className="flex items-center gap-3 py-2">
                      <span className="w-24 font-semibold">{b.code}</span>
                      <span className="flex-1 text-xs text-muted-foreground">{b.items.map((i: any) => `${i.qty} × ${i.name.split(" ")[0]}`).join(" + ")} · {b.outlet.label} · {formatDateTime(b.createdAt)}</span>
                      <span className="tabular-nums">{formatINR(b.charges.total, { decimals: false })}</span>
                      <StatusBadge status={b.status} />
                    </li>
                  ))}
                </ul>
              </section>
              {acct.connection ? <p className="text-xs text-muted-foreground">Commercial connection <OmcBadge omc={acct.connection.omc} /> {acct.connection.consumerNo}</p> : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
