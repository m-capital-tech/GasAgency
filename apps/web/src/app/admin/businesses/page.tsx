"use client";
import { BUSINESS_TYPE_LABELS } from "@gassetu/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Search, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/Shell";
import { Avatar, Badge, Button, Card, CardContent, Dialog, DialogContent, EmptyState, ErrorState, Field, Input, NativeSelect, StatusBadge, TBody, THead, Table, TableSkeleton, Tabs, TabsList, TabsTrigger, Tr } from "@/components/ui";
import { q, get, post } from "@/features/hooks";
import { formatCompactINR, formatDateShort, formatDateTime, formatINR } from "@/lib/format";

/** P4 — Businesses: verification + credit decisions (admin decides during onboarding) */
export default function AdminBusinessesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"queue" | "all">("queue");
  const [open, setOpen] = useState<any>(null);
  const [credit, setCredit] = useState({ status: "approved", limit: "50000", termDays: "15" });
  const [busy, setBusy] = useState(false);
  const businesses = useQuery(q.adminBusinesses(search));
  const history = useQuery({ queryKey: ["admin-biz-history", open?.userId], queryFn: () => get(`/bookings?businessId=${open.userId}`), enabled: !!open });
  const list = (businesses.data ?? []).filter((b) => tab === "all" || b.status === "pending" || b.credit.status === "requested");
  const queue = (businesses.data ?? []).filter((b) => b.status === "pending" || b.credit.status === "requested").length;

  const decide = async (b: any, input: { status?: string; credit?: { status: string; limit?: number; termDays?: number } }, msg: string) => {
    setBusy(true);
    try {
      await post(`/admin/businesses/${b.userId}/status`, input);
      qc.invalidateQueries({ queryKey: ["admin"] });
      toast.success(msg);
      setOpen(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const openFor = (b: any) => {
    setCredit({ status: b.credit.status === "approved" ? "approved" : "approved", limit: String(b.credit.limit || (b.type === "hotel" || b.type === "canteen" || b.type === "hospital" ? 150000 : 50000)), termDays: String(b.credit.termDays || 15) });
    setOpen(b);
  };

  return (
    <>
      <PageHeader title="Businesses" subtitle={`${(businesses.data ?? []).length} registered · ${queue} awaiting a decision`}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
          <TabsList className="h-9">
            <TabsTrigger value="queue" className="h-7">Onboarding queue ({queue})</TabsTrigger>
            <TabsTrigger value="all" className="h-7">All businesses</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Business, owner, phone, agency, type" className="h-9 w-72 pl-9" />
        </div>
      </PageHeader>
      <Card>
        <CardContent className="px-0 pt-2">
          {businesses.isLoading ? (
            <TableSkeleton />
          ) : businesses.isError ? (
            <ErrorState onRetry={() => businesses.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState icon={BadgeCheck} title={tab === "queue" ? "Queue is empty" : "No businesses match"} body={tab === "queue" ? "New registrations and credit requests land here for a decision." : undefined} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <th>Business</th>
                  <th>Type</th>
                  <th>Agency</th>
                  <th>GSTIN</th>
                  <th className="text-right">Outlets</th>
                  <th className="text-right">Spend / 30d</th>
                  <th>Status</th>
                  <th>Credit</th>
                  <th className="text-right">Outstanding</th>
                  <th></th>
                </tr>
              </THead>
              <TBody>
                {list.map((b) => (
                  <Tr key={b.userId} className="cursor-pointer" onClick={() => openFor(b)}>
                    <td>
                      <div className="flex items-center gap-2">
                        <Avatar name={b.name} color={b.avatarColor} size={30} />
                        <div>
                          <p className="font-medium">{b.name}</p>
                          <p className="text-xs text-muted-foreground">{b.ownerName} · +91 {b.phone} · joined {formatDateShort(b.createdAt)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-xs">{BUSINESS_TYPE_LABELS[b.type]}</td>
                    <td className="text-xs">{b.agencyName ?? "—"}</td>
                    <td className="font-mono text-[11px]">{b.gstin ?? <span className="text-faint">none</span>}</td>
                    <td className="text-right tabular-nums">{b.outlets.length}</td>
                    <td className="text-right tabular-nums">{formatINR(b.spend30, { decimals: false })}</td>
                    <td>
                      <Badge tone={b.status === "verified" ? "success" : b.status === "pending" ? "warning" : "danger"} dot>
                        {b.status}
                      </Badge>
                    </td>
                    <td>{b.credit.status === "approved" ? <Badge tone="info">net-{b.credit.termDays} · {formatCompactINR(b.credit.limit)}</Badge> : b.credit.status === "requested" ? <Badge tone="warning" dot>requested</Badge> : b.credit.status === "suspended" ? <Badge tone="danger">suspended</Badge> : <Badge>prepaid</Badge>}</td>
                    <td className={`text-right tabular-nums ${b.creditOverdue ? "font-semibold text-danger" : ""}`}>{b.creditOutstanding ? formatINR(b.creditOutstanding, { decimals: false }) : "—"}</td>
                    <td className="text-right">
                      <Button size="sm" variant={b.status === "pending" || b.credit.status === "requested" ? "default" : "ghost"} onClick={(e) => { e.stopPropagation(); openFor(b); }}>
                        {b.status === "pending" ? "Review" : b.credit.status === "requested" ? "Decide credit" : "Manage"}
                      </Button>
                    </td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent side="right" title={open?.name} description={open ? `${BUSINESS_TYPE_LABELS[open.type as keyof typeof BUSINESS_TYPE_LABELS]} · ${open.ownerName} · +91 ${open.phone} · ${open.agencyName ?? "no agency"}` : undefined} className="max-w-2xl">
          {open ? (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                {[["GSTIN", open.gstin ?? "not provided"], ["FSSAI", open.fssai ?? "not provided"], ["Outlets", String(open.outlets.length)], ["Connection", open.connection ? `${open.connection.omc} ${open.connection.consumerNo}` : "auto-assigned"]].map(([k, v]) => (
                  <div key={k} className="rounded-lg border p-2">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
                    <p className="font-medium">{v}</p>
                  </div>
                ))}
              </div>
              <ul className="divide-y rounded-xl border text-sm">
                {open.outlets.map((o: any) => (
                  <li key={o.id} className="px-3 py-2">
                    <p className="font-medium">{o.label}</p>
                    <p className="text-xs text-muted-foreground">{o.line1}, {o.line2} · {o.pincode} · ~{o.cylindersPerWeek} cyl/week</p>
                  </li>
                ))}
              </ul>

              <section className="rounded-xl border border-gold/40 bg-gold-soft/50 p-4">
                <h4 className="text-sm font-semibold">Onboarding decision</h4>
                <p className="mb-3 text-xs text-muted-foreground">Verify the business and set its credit terms in one go. Credit is what lets the account order on invoice; the agency collects, GasSetu earns the {"1%"} facilitation fee.</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Credit">
                    <NativeSelect value={credit.status} onChange={(e) => setCredit({ ...credit, status: e.target.value })}>
                      <option value="approved">Approve credit</option>
                      <option value="none">Prepaid only</option>
                      <option value="suspended">Suspend credit</option>
                    </NativeSelect>
                  </Field>
                  <Field label="Limit (₹)">
                    <Input type="number" value={credit.limit} onChange={(e) => setCredit({ ...credit, limit: e.target.value })} disabled={credit.status !== "approved"} />
                  </Field>
                  <Field label="Terms (days)">
                    <NativeSelect value={credit.termDays} onChange={(e) => setCredit({ ...credit, termDays: e.target.value })} disabled={credit.status !== "approved"}>
                      <option value="7">Net-7</option>
                      <option value="15">Net-15</option>
                      <option value="30">Net-30</option>
                    </NativeSelect>
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="success" loading={busy} onClick={() => decide(open, { status: "verified", credit: { status: credit.status, limit: Number(credit.limit), termDays: Number(credit.termDays) } }, credit.status === "approved" ? `${open.name} verified · credit ${formatINR(Number(credit.limit), { decimals: false })} net-${credit.termDays}` : `${open.name} verified · prepaid only`)}>
                    <BadgeCheck /> {open.status === "pending" ? "Verify & apply terms" : "Apply credit terms"}
                  </Button>
                  {open.status !== "suspended" ? (
                    <Button variant="outline" loading={busy} onClick={() => decide(open, { status: "suspended", credit: { status: "suspended" } }, `${open.name} suspended`)}>
                      <ShieldOff /> Suspend account
                    </Button>
                  ) : (
                    <Button variant="outline" loading={busy} onClick={() => decide(open, { status: "verified" }, `${open.name} reinstated`)}>
                      Reinstate
                    </Button>
                  )}
                </div>
                {open.credit.status === "approved" ? <p className="mt-2 text-xs text-muted-foreground">Current: {formatINR(open.credit.limit, { decimals: false })} net-{open.credit.termDays} · outstanding {formatINR(open.creditOutstanding, { decimals: false })}{open.creditOverdue ? ` · overdue ${formatINR(open.creditOverdue, { decimals: false })}` : ""}</p> : null}
              </section>

              <section>
                <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Recent orders</h4>
                <ul className="divide-y text-sm">
                  {(history.data ?? []).slice(0, 8).map((b: any) => (
                    <li key={b.id} className="flex items-center gap-3 py-2">
                      <span className="w-24 font-semibold">{b.code}</span>
                      <span className="flex-1 text-xs text-muted-foreground">{b.items.map((i: any) => `${i.qty} × ${i.name.split(" ")[0]}`).join(" + ")} · {b.payment.method} · {formatDateTime(b.createdAt)}</span>
                      <span className="tabular-nums">{formatINR(b.charges.total, { decimals: false })}</span>
                      <StatusBadge status={b.status} />
                    </li>
                  ))}
                  {(history.data ?? []).length === 0 ? <li className="py-2 text-xs text-muted-foreground">No orders yet.</li> : null}
                </ul>
              </section>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
