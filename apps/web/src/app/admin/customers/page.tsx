"use client";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shell/Shell";
import { Avatar, Badge, Card, CardContent, Dialog, DialogContent, EmptyState, ErrorState, Input, OmcBadge, StatusBadge, TBody, THead, Table, TableSkeleton, Tr } from "@/components/ui";
import { q, get } from "@/features/hooks";
import { formatDateShort, formatDateTime, formatINR } from "@/lib/format";

/** P4 — Customers */
export default function AdminCustomersPage() {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<any>(null);
  const customers = useQuery(q.adminCustomers(search));
  const history = useQuery({ queryKey: ["admin-cust-history", open?.userId], queryFn: () => get(`/bookings?customerId=${open.userId}`), enabled: !!open });
  return (
    <>
      <PageHeader title="Customers" subtitle="Search across all agencies">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone or agency" className="h-9 w-72 pl-9" />
        </div>
      </PageHeader>
      <Card>
        <CardContent className="px-0 pt-2">
          {customers.isLoading ? (
            <TableSkeleton />
          ) : customers.isError ? (
            <ErrorState onRetry={() => customers.refetch()} />
          ) : (customers.data ?? []).length === 0 ? (
            <EmptyState title="No customers match" />
          ) : (
            <Table>
              <THead>
                <tr>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Agency</th>
                  <th>Connection</th>
                  <th>Pincode</th>
                  <th className="text-right">Bookings</th>
                  <th>Last refill</th>
                  <th>Joined</th>
                </tr>
              </THead>
              <TBody>
                {(customers.data ?? []).map((c: any) => (
                  <Tr key={c.userId} className="cursor-pointer" onClick={() => setOpen(c)}>
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
                    <td className="text-xs">{c.agencyName ?? "—"}</td>
                    <td className="text-xs">{c.connection ? <span className="flex items-center gap-1.5"><OmcBadge omc={c.connection.omc} /> {c.connection.consumerNo}</span> : <span className="text-faint">none</span>}</td>
                    <td className="text-xs">{c.addresses[0]?.pincode}</td>
                    <td className="text-right tabular-nums">{c.totalBookings}</td>
                    <td className="text-xs">{c.lastRefillAt ? formatDateShort(c.lastRefillAt) : "—"}</td>
                    <td className="text-xs text-muted-foreground">{formatDateShort(c.createdAt)}</td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent side="right" title={open?.name} description={open ? `+91 ${open.phone} · ${open.type} · ${open.agencyName ?? "no agency"}` : undefined}>
          {open ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {open.addresses[0]?.line1}, {open.addresses[0]?.line2}, {open.addresses[0]?.city} {open.addresses[0]?.pincode}
              </p>
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bookings</h4>
              <ul className="divide-y text-sm">
                {(history.data ?? []).map((b: any) => (
                  <li key={b.id} className="flex items-center gap-3 py-2">
                    <span className="w-24 font-semibold">{b.code}</span>
                    <span className="flex-1 text-xs text-muted-foreground">{formatDateTime(b.createdAt)}</span>
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
