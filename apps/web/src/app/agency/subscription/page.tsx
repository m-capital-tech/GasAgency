"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/Shell";
import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardSkeleton, CardTitle, ErrorState, TBody, THead, Table, Tr } from "@/components/ui";
import { q, useAgencyId, patch } from "@/features/hooks";
import { useSession } from "@/lib/session";
import { formatINR, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

const PLANS = [
  { key: "free", name: "Free", price: 0, blurb: "Up to 150 orders / month", features: ["Order board & assignment", "Listed to business accounts", "Basic settlements"] },
  { key: "growth", name: "Growth", price: 2999, blurb: "Unlimited orders", features: ["Everything in Free", "Live staff tracking", "Low-stock nudge campaigns", "Credit receivables & aging"] },
  { key: "pro", name: "Pro", price: 7999, blurb: "For multi-godown distributors", features: ["Everything in Growth", "Negotiated account pricing", "Advanced analytics", "API access (coming soon)"] },
];

/** A12 — Subscription */
export default function SubscriptionPage() {
  const agencyId = useAgencyId();
  const qc = useQueryClient();
  const agency = useQuery(q.agency(agencyId));
  const invoices = useQuery(q.invoices(agencyId));
  const { user, login } = useSession();
  const config = useQuery(q.config());
  const change = (plan: string) =>
    patch(`/agency/${agencyId}`, { plan })
      .then((a) => {
        qc.invalidateQueries({ queryKey: ["agency"] });
        if (user) login(user, a);
        toast.success(`Switched to ${plan} plan`, { description: "Mock — no card charged." });
      })
      .catch((e) => toast.error(e.message));
  if (agency.isLoading) return <div className="grid gap-4 md:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <CardSkeleton key={i} />)}</div>;
  if (agency.isError || !agency.data) return <ErrorState onRetry={() => agency.refetch()} />;
  const current = agency.data.plan;
  const plans = PLANS.map((p) => ({ ...p, price: config.data?.plans?.[p.key]?.monthlyFee ?? p.price }));
  return (
    <>
      <PageHeader title="Subscription" subtitle="Agency SaaS plan — one of GasSetu's revenue streams alongside commission and fees." />
      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <Card key={p.key} className={cn(p.key === current && "border-primary ring-2 ring-primary/20")}>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {p.name} {p.key === current ? <Badge tone="primary">Current</Badge> : null}
                </CardTitle>
                <CardDescription>{p.blurb}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold tabular-nums">
                {p.price ? formatINR(p.price, { decimals: false }) : "₹0"}
                <span className="text-sm font-normal text-muted-foreground"> / month</span>
              </p>
              <ul className="mt-4 space-y-1.5 text-sm">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-2">
                    <Check className="size-4 text-success" /> {f}
                  </li>
                ))}
              </ul>
              <Button className="mt-5 w-full" variant={p.key === current ? "outline" : "default"} disabled={p.key === current} onClick={() => change(p.key)}>
                {p.key === current ? "Your plan" : p.price > (plans.find((x) => x.key === current)?.price ?? 0) ? "Upgrade" : "Switch"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader>
          <div>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Monthly subscription invoices (mock)</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <THead>
              <tr>
                <th>Invoice</th>
                <th>Period</th>
                <th>Plan</th>
                <th className="text-right">Amount</th>
                <th>Status</th>
              </tr>
            </THead>
            <TBody>
              {(invoices.data ?? []).map((i: any) => (
                <Tr key={i.id}>
                  <td className="font-mono text-xs">{i.id.toUpperCase()}</td>
                  <td>{i.period}</td>
                  <td className="capitalize">{i.plan}</td>
                  <td className="text-right tabular-nums">{formatINR(i.amount)}</td>
                  <td>{i.status === "paid" ? <Badge tone="success" dot>Paid</Badge> : <Badge tone="warning" dot>Due {formatDateShort(i.issuedAt)}</Badge>}</td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
