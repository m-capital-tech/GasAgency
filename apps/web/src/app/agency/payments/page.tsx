"use client";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, Banknote, FileText, IndianRupee, Landmark, Percent } from "lucide-react";
import { PageHeader } from "@/components/shell/Shell";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, EmptyState, ErrorState, Kpi, TBody, THead, Table, Tabs, TabsContent, TabsList, TabsTrigger, Tr } from "@/components/ui";
import { q, useAgencyId } from "@/features/hooks";
import { formatCompactINR, formatDateShort, formatDateTime, formatINR } from "@/lib/format";

/** A10 — Payments & settlements */
export default function PaymentsPage() {
  const agencyId = useAgencyId();
  const s = useQuery(q.settlements(agencyId));
  if (s.isLoading) return <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}</div>;
  if (s.isError || !s.data) return <ErrorState onRetry={() => s.refetch()} />;
  const d = s.data;
  return (
    <>
      <PageHeader title="Payments & receivables" subtitle="Online and credit orders settle via Razorpay Route (mock) after platform commission; credit invoices are collected from accounts on net terms. COD is reconciled with staff deposits." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi label="Gross billed" value={formatCompactINR(d.summary.gross)} icon={IndianRupee} tone="info" sub="online + credit" />
        <Kpi label="Platform fees" value={formatCompactINR(d.summary.commission + d.summary.convenience)} icon={Percent} tone="warning" sub="commission + credit fee + convenience" />
        <Kpi label="Net payout" value={formatCompactINR(d.summary.net)} icon={Landmark} tone="success" sub={`${formatCompactINR(d.summary.settledNet)} settled`} />
        <Kpi label="Receivables" value={formatCompactINR(d.summary.receivables)} icon={FileText} tone={d.summary.overdue ? "danger" : "primary"} sub={d.summary.overdue ? `${formatCompactINR(d.summary.overdue)} overdue` : `${formatCompactINR(d.summary.collected30)} collected / 30d`} />
        <Kpi label="COD with staff" value={formatCompactINR(d.codCollected)} icon={Banknote} tone="warning" sub={`${formatCompactINR(d.codPending)} yet to collect`} />
      </div>
      <Tabs defaultValue="receivables" className="mt-4">
        <TabsList>
          <TabsTrigger value="receivables">Credit receivables</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
          <TabsTrigger value="payouts">Payout history</TabsTrigger>
          <TabsTrigger value="cod">COD reconciliation</TabsTrigger>
        </TabsList>
        <TabsContent value="receivables" className="mt-3">
          <div className="grid gap-4 lg:grid-cols-4">
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Aging</CardTitle>
                  <CardDescription>Unpaid credit invoices</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {d.aging.map((a: any) => (
                    <li key={a.bucket} className="flex justify-between">
                      <span className={a.bucket === "Not due" ? "text-muted-foreground" : "text-danger"}>{a.bucket}</span>
                      <span className="font-semibold tabular-nums">{formatINR(a.amount, { decimals: false })}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="lg:col-span-3">
              <CardContent className="px-0 pt-2">
                {d.receivables.length === 0 ? (
                  <EmptyState title="No open credit invoices" />
                ) : (
                  <Table>
                    <THead>
                      <tr>
                        <th>Invoice</th>
                        <th>Business</th>
                        <th>Delivered</th>
                        <th>Due</th>
                        <th className="text-right">Amount</th>
                        <th>Status</th>
                      </tr>
                    </THead>
                    <TBody>
                      {d.receivables.map((b: any) => (
                        <Tr key={b.id}>
                          <td className="font-semibold">{b.invoiceNo}</td>
                          <td>
                            <p className="font-medium">{b.businessName}</p>
                            <p className="text-xs text-muted-foreground">{b.code} · {b.outlet.label}</p>
                          </td>
                          <td className="text-xs text-muted-foreground">{formatDateShort(b.deliveredAt)}</td>
                          <td className="text-xs">{b.payment.dueAt ? formatDateShort(b.payment.dueAt) : "—"}</td>
                          <td className="text-right tabular-nums">{formatINR(b.charges.total)}</td>
                          <td>{b.overdueDays > 0 ? <Badge tone="danger" dot>{b.overdueDays}d overdue</Badge> : <Badge tone="warning" dot>Due</Badge>}</td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                )}
                <p className="px-4 pt-3 text-xs text-muted-foreground">Record collections from Business accounts → account drawer → Record payment.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        <TabsContent value="settlements" className="mt-3">
          <Card>
            <CardContent className="px-0 pt-2">
              <Table>
                <THead>
                  <tr>
                    <th>Booking</th>
                    <th>Date</th>
                    <th className="text-right">Amount</th>
                    <th className="text-right">Commission</th>
                    <th className="text-right">Conv. fee</th>
                    <th className="text-right">Express share</th>
                    <th className="text-right">Net to you</th>
                    <th>Status</th>
                  </tr>
                </THead>
                <TBody>
                  {d.rows.map((r: any) => (
                    <Tr key={r.id}>
                      <td className="font-semibold">{r.bookingCode}</td>
                      <td className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</td>
                      <td className="text-right tabular-nums">{formatINR(r.amount)}</td>
                      <td className="text-right tabular-nums text-danger">−{formatINR(r.commission)}</td>
                      <td className="text-right tabular-nums text-danger">−{formatINR(r.convenienceFee)}</td>
                      <td className="text-right tabular-nums text-success">{r.expressShare ? `+${formatINR(r.expressShare)}` : "—"}</td>
                      <td className="text-right font-semibold tabular-nums">{formatINR(r.netToAgency)}</td>
                      <td>{r.status === "settled" ? <Badge tone="success" dot>Settled {formatDateShort(r.settledAt)}</Badge> : <Badge tone="warning" dot>Pending</Badge>}</td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="payouts" className="mt-3">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Razorpay Route payouts (mock)</CardTitle>
                <CardDescription>Daily batches to A/C ••••4321 · HDFC Bank</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {d.payouts.length === 0 ? (
                <EmptyState title="No payouts yet" body="Settled orders are batched into daily payouts." />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <th>Payout date</th>
                      <th className="text-right">Orders</th>
                      <th className="text-right">Gross</th>
                      <th className="text-right">Platform fees</th>
                      <th className="text-right">Net paid</th>
                      <th>UTR</th>
                    </tr>
                  </THead>
                  <TBody>
                    {d.payouts.map((p: any) => (
                      <Tr key={p.date}>
                        <td>{formatDateShort(p.date)}</td>
                        <td className="text-right tabular-nums">{p.count}</td>
                        <td className="text-right tabular-nums">{formatINR(p.gross)}</td>
                        <td className="text-right tabular-nums text-danger">−{formatINR(p.commission)}</td>
                        <td className="text-right font-semibold tabular-nums">{formatINR(p.net)}</td>
                        <td className="font-mono text-xs text-muted-foreground">UTR{p.date.slice(0, 10).replace(/-/g, "")}MOCK</td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="cod" className="mt-3">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Cash on delivery — last 7 days</CardTitle>
                <CardDescription>Collected cash sits with delivery staff until deposited at the counter (Day summary in the delivery app).</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="px-0">
              {d.cod.length === 0 ? (
                <EmptyState title="No COD orders this week" />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <th>Booking</th>
                      <th>Business</th>
                      <th>Staff</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                    </tr>
                  </THead>
                  <TBody>
                    {d.cod.map((b: any) => (
                      <Tr key={b.id}>
                        <td className="font-semibold">{b.code}</td>
                        <td>{b.businessName}</td>
                        <td className="text-xs">{b.staff?.name ?? "—"}</td>
                        <td className="text-right tabular-nums">{formatINR(b.charges.total)}</td>
                        <td>{b.payment.status === "COD_COLLECTED" ? <Badge tone="success" dot>Cash collected</Badge> : <Badge tone="warning" dot>Pending delivery</Badge>}</td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
