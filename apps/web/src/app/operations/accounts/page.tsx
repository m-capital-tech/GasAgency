"use client";

import {
  ArrowLeft,
  BadgeIndianRupee,
  Building2,
  CircleDollarSign,
  CreditCard,
  Flame,
  IndianRupee,
  LogOut,
  ReceiptIndianRupee,
  RefreshCw,
  Save,
  ShieldCheck,
  ShieldOff,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Field, Input, NativeSelect, Textarea, buttonVariants } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  OperationsApiError,
  operationsApi,
  type OperationsAgency,
  type OperationsCommercialAccount,
  type OperationsPayment,
  type OperationsSession,
} from "@/lib/operations-api";

type AgencyWithCredit = OperationsAgency & { creditEnabled: boolean };

const money = (value: string | number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(value));
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function actionError(cause: unknown): string {
  if (cause instanceof OperationsApiError) return cause.message;
  return cause instanceof Error ? cause.message : "The request could not be completed.";
}

function SummaryCard({ label, value, note, icon: Icon }: { label: string; value: string | number; note: string; icon: typeof IndianRupee }) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-4 pt-5">
        <div><p className="text-xs font-medium text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></div>
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><Icon className="size-5" /></span>
      </CardContent>
    </Card>
  );
}

function PriceEditor({ account, busy, onSave }: {
  account: OperationsCommercialAccount;
  busy: boolean;
  onSave: (body: { cylinderTypeCode: string; active: true; unitPrice: string; reason: string } | { cylinderTypeCode: string; active: false; reason: string }) => Promise<void>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(account.prices.map((price) => [price.cylinderTypeCode, price.negotiatedUnitPrice ?? price.baseUnitPrice])));
  const [reason, setReason] = useState("");

  return (
    <Card>
      <CardHeader><div><CardTitle>Negotiated pricing</CardTitle><p className="mt-1 text-xs text-muted-foreground">Account-specific prices apply before volume slabs. Catalogue prices remain the ceiling.</p></div><BadgeIndianRupee className="size-5 text-primary" /></CardHeader>
      <CardContent className="grid gap-4">
        {account.prices.length ? account.prices.map((price) => (
          <div key={price.cylinderTypeCode} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[minmax(0,1fr)_150px_auto] md:items-end">
            <div><p className="text-sm font-semibold">{price.displayName}</p><p className="mt-1 text-xs text-muted-foreground">Catalogue {money(price.baseUnitPrice)} · {price.negotiatedActive ? `Negotiated ${money(price.negotiatedUnitPrice ?? 0)}` : "No negotiated price"}</p></div>
            <Field label="Unit price"><Input inputMode="decimal" value={values[price.cylinderTypeCode] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [price.cylinderTypeCode]: event.target.value }))} /></Field>
            <div className="flex gap-2">
              <Button size="sm" loading={busy} disabled={reason.trim().length < 3 || !values[price.cylinderTypeCode]} onClick={() => onSave({ cylinderTypeCode: price.cylinderTypeCode, active: true, unitPrice: values[price.cylinderTypeCode]!, reason: reason.trim() })}><Save />Save</Button>
              {price.negotiatedActive ? <Button size="sm" variant="outline" loading={busy} disabled={reason.trim().length < 3} onClick={() => onSave({ cylinderTypeCode: price.cylinderTypeCode, active: false, reason: reason.trim() })}>Use catalogue</Button> : null}
            </div>
          </div>
        )) : <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">No active catalogue prices are available for this account.</p>}
        <Field label="Reason for pricing change" hint="Required for the audit trail"><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Annual volume agreement renewed" /></Field>
      </CardContent>
    </Card>
  );
}

function PaymentForm({ account, busy, onRecord }: {
  account: OperationsCommercialAccount;
  busy: boolean;
  onRecord: (body: { amount: string; paymentMethod: OperationsPayment["paymentMethod"]; reference?: string; note?: string }) => Promise<void>;
}) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<OperationsPayment["paymentMethod"]>("bank_transfer");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const submit = async () => {
    await onRecord({ amount, paymentMethod: method, ...(reference.trim() ? { reference: reference.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
    setAmount(""); setReference(""); setNote("");
  };

  return (
    <Card>
      <CardHeader><div><CardTitle>Record a collection</CardTitle><p className="mt-1 text-xs text-muted-foreground">Collections are allocated to the oldest outstanding invoices first and cannot be edited after posting.</p></div><ReceiptIndianRupee className="size-5 text-primary" /></CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount"><Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></Field>
          <Field label="Payment method"><NativeSelect value={method} onChange={(event) => setMethod(event.target.value as OperationsPayment["paymentMethod"])}><option value="bank_transfer">Bank transfer</option><option value="upi">UPI</option><option value="cash">Cash</option><option value="cheque">Cheque</option><option value="other">Other</option></NativeSelect></Field>
          <Field label="Reference" hint="UTR, cheque number, or receipt reference"><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="At least 3 characters" /></Field>
          <Field label="Internal note"><Input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional collection note" /></Field>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3 text-sm"><span>Outstanding available to settle</span><strong>{money(account.receivables.outstanding)}</strong></div>
        <Button variant="success" loading={busy} disabled={!amount || Number(amount) <= 0 || Number(amount) > Number(account.receivables.outstanding) || (reference.length > 0 && reference.trim().length < 3) || (note.length > 0 && note.trim().length < 3)} onClick={() => void submit()}><CircleDollarSign />Post collection</Button>
      </CardContent>
    </Card>
  );
}

export default function OperationsAccountsPage() {
  const router = useRouter();
  const [session, setSession] = useState<OperationsSession | null>(null);
  const [agency, setAgency] = useState<AgencyWithCredit | null>(null);
  const [accounts, setAccounts] = useState<OperationsCommercialAccount[]>([]);
  const [payments, setPayments] = useState<OperationsPayment[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditReason, setCreditReason] = useState("");
  const mutationKeys = useRef(new Map<string, string>());

  const loadAgency = useCallback(async (target: OperationsAgency, quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const [accountResult, paymentResult] = await Promise.all([operationsApi.accounts(target.publicId), operationsApi.payments(target.publicId)]);
      setAgency({ ...target, creditEnabled: accountResult.agency.creditEnabled });
      setAccounts(accountResult.accounts); setPayments(paymentResult.payments);
      setSelectedId((current) => accountResult.accounts.some((account) => account.publicId === current) ? current : accountResult.accounts[0]?.publicId ?? null);
    } catch (cause) {
      if (cause instanceof OperationsApiError && cause.status === 401) { router.replace("/operations/login"); return; }
      setError(actionError(cause));
    } finally { setLoading(false); setRefreshing(false); }
  }, [router]);

  useEffect(() => {
    let active = true;
    operationsApi.session().then((result) => {
      if (!active) return;
      if (!result.agencies.length) throw new Error("This account has no authorized agency scope.");
      setSession(result);
      return loadAgency(result.agencies[0]!);
    }).catch((cause) => {
      if (!active) return;
      if (cause instanceof OperationsApiError && cause.status === 401) router.replace("/operations/login");
      else { setError(actionError(cause)); setLoading(false); }
    });
    return () => { active = false; };
  }, [loadAgency, router]);

  const selected = accounts.find((account) => account.publicId === selectedId) ?? null;
  const totals = useMemo(() => accounts.reduce((sum, account) => ({
    outstanding: sum.outstanding + Number(account.receivables.outstanding),
    overdue: sum.overdue + Number(account.receivables.overdue),
    collected: sum.collected + Number(account.collections.total),
  }), { outstanding: 0, overdue: 0, collected: 0 }), [accounts]);

  const stableKey = (identity: string) => {
    const existing = mutationKeys.current.get(identity);
    if (existing) return existing;
    const key = `web:${identity}:${crypto.randomUUID()}`;
    mutationKeys.current.set(identity, key);
    return key;
  };

  const mutate = async (identity: string, action: (key: string) => Promise<unknown>) => {
    setMutating(true); setError(null);
    try {
      await action(stableKey(identity));
      mutationKeys.current.delete(identity);
      if (agency) await loadAgency(agency, true);
    } catch (cause) { setError(actionError(cause)); throw cause; }
    finally { setMutating(false); }
  };

  const changeCredit = async () => {
    if (!agency) return;
    const body = { creditEnabled: !agency.creditEnabled, reason: creditReason.trim() };
    try { await mutate(`credit-policy:${agency.publicId}:${body.creditEnabled}:${body.reason}`, (key) => operationsApi.setCreditPolicy(agency.publicId, body, key)); setCreditReason(""); } catch { /* visible error is already set */ }
  };

  const changePrice = async (body: { cylinderTypeCode: string; active: true; unitPrice: string; reason: string } | { cylinderTypeCode: string; active: false; reason: string }) => {
    if (!agency || !selected) return;
    const identity = `price:${selected.publicId}:${JSON.stringify(body)}`;
    try { await mutate(identity, (key) => operationsApi.setNegotiatedPrice(agency.publicId, selected.publicId, body, key)); } catch { /* visible error is already set */ }
  };

  const recordPayment = async (body: { amount: string; paymentMethod: OperationsPayment["paymentMethod"]; reference?: string; note?: string }) => {
    if (!agency || !selected) return;
    const identity = `payment:${selected.publicId}:${JSON.stringify(body)}`;
    await mutate(identity, (key) => operationsApi.recordPayment(agency.publicId, selected.publicId, body, key));
  };

  const logout = async () => { try { await operationsApi.logout(); } finally { router.replace("/operations/login"); } };

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-muted/40"><RefreshCw className="size-7 animate-spin text-primary" /><span className="ml-3 text-sm text-muted-foreground">Loading commercial accounts…</span></main>;

  return (
    <main className="min-h-screen bg-muted/40">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white"><Flame className="size-5" /></span><div><h1 className="font-bold">Commercial Accounts & Collections</h1><p className="text-xs text-muted-foreground">Agency pricing, receivables, and credit availability</p></div></div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/operations/orders" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}><ArrowLeft />Orders</Link>
            {session && session.agencies.length > 1 ? <NativeSelect className="w-56" value={agency?.publicId ?? ""} onChange={(event) => { const next = session.agencies.find((item) => item.publicId === event.target.value); if (next) void loadAgency(next); }}>{session.agencies.map((item) => <option key={item.publicId} value={item.publicId}>{item.displayName}</option>)}</NativeSelect> : <Badge tone="primary">{agency?.displayName ?? "Agency"}</Badge>}
            <Button size="sm" variant="outline" onClick={() => agency && void loadAgency(agency, true)} loading={refreshing}><RefreshCw />Refresh</Button>
            <Button size="sm" variant="ghost" onClick={() => void logout()}><LogOut />Sign out</Button>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-5 px-5 py-6 lg:px-8">
        {error ? <div className="flex items-center justify-between gap-3 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-sm text-danger"><span>{error}</span><button className="font-semibold" onClick={() => setError(null)}>Dismiss</button></div> : null}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Active accounts" value={accounts.filter((account) => account.status === "open").length} icon={Building2} note={`${accounts.filter((account) => account.paymentMode === "credit").length} configured for credit`} />
          <SummaryCard label="Outstanding" value={money(totals.outstanding)} icon={WalletCards} note={`${accounts.reduce((sum, account) => sum + account.receivables.openInvoiceCount, 0)} open invoices`} />
          <SummaryCard label="Overdue" value={money(totals.overdue)} icon={CreditCard} note={totals.overdue ? "Collection follow-up required" : "No overdue balance"} />
          <SummaryCard label="Collections recorded" value={money(totals.collected)} icon={CircleDollarSign} note="Lifetime agency-recorded collections" />
        </section>

        <Card className={agency?.creditEnabled ? "border-success/25" : "border-warning/30"}>
          <CardContent className="grid gap-4 pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,420px)_auto] lg:items-end">
            <div className="flex items-start gap-3"><span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${agency?.creditEnabled ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{agency?.creditEnabled ? <ShieldCheck /> : <ShieldOff />}</span><div><p className="font-semibold">Agency-wide credit is {agency?.creditEnabled ? "enabled" : "paused"}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">This switch controls whether any tenant can place a new credit order with this agency. Platform administrators alone control each tenant’s limit and net terms.</p></div></div>
            <Field label="Reason for policy change"><Input value={creditReason} onChange={(event) => setCreditReason(event.target.value)} placeholder="Required for audit trail" /></Field>
            <Button variant={agency?.creditEnabled ? "danger" : "success"} loading={mutating} disabled={creditReason.trim().length < 3} onClick={() => void changeCredit()}>{agency?.creditEnabled ? <ShieldOff /> : <ShieldCheck />}{agency?.creditEnabled ? "Pause credit" : "Restore credit"}</Button>
          </CardContent>
        </Card>

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <Card className="overflow-hidden self-start">
            <CardHeader className="border-b pb-4"><div><CardTitle>Tenant accounts</CardTitle><p className="mt-1 text-xs text-muted-foreground">{accounts.length} account{accounts.length === 1 ? "" : "s"}</p></div></CardHeader>
            <div className="max-h-[720px] overflow-y-auto">{accounts.length ? accounts.map((account) => <button key={account.publicId} className={`w-full border-b p-4 text-left transition-colors last:border-b-0 ${selectedId === account.publicId ? "bg-primary-soft/70" : "hover:bg-muted/60"}`} onClick={() => setSelectedId(account.publicId)}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{account.tenant.displayName}</p><p className="mt-0.5 text-xs text-muted-foreground">GSTIN {account.tenant.gstin}</p></div><Badge tone={account.credit?.status === "approved" ? "success" : account.paymentMode === "credit" ? "warning" : "muted"}>{account.paymentMode}</Badge></div><div className="mt-3 flex items-center justify-between text-xs"><span className="text-muted-foreground">{account.receivables.openInvoiceCount} open invoice{account.receivables.openInvoiceCount === 1 ? "" : "s"}</span><strong>{money(account.receivables.outstanding)}</strong></div></button>) : <p className="p-8 text-center text-sm text-muted-foreground">No active commercial accounts.</p>}</div>
          </Card>

          {selected ? <div className="grid gap-5">
            <Card><CardContent className="grid gap-4 pt-5 md:grid-cols-[minmax(0,1fr)_repeat(3,minmax(120px,auto))]"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-xl font-bold">{selected.tenant.displayName}</h2><Badge tone={selected.status === "open" ? "success" : "warning"} dot>{selected.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{selected.tenant.legalName} · {selected.tenant.businessType.replaceAll("_", " ")} · GSTIN {selected.tenant.gstin}</p></div><div><p className="text-xs text-muted-foreground">Outstanding</p><p className="mt-1 font-bold">{money(selected.receivables.outstanding)}</p></div><div><p className="text-xs text-muted-foreground">Overdue</p><p className="mt-1 font-bold text-danger">{money(selected.receivables.overdue)}</p></div><div><p className="text-xs text-muted-foreground">Admin credit terms</p><p className="mt-1 font-bold">{selected.credit ? `${money(selected.credit.limit)} · Net ${selected.credit.netTermDays}` : "Prepaid"}</p></div></CardContent></Card>
            <div className="grid gap-5 2xl:grid-cols-2"><PriceEditor key={`prices:${selected.publicId}:${selected.prices.map((price) => `${price.cylinderTypeCode}:${price.negotiatedUnitPrice}:${price.negotiatedActive}`).join("|")}`} account={selected} busy={mutating} onSave={changePrice} /><PaymentForm key={`payment:${selected.publicId}:${selected.receivables.outstanding}`} account={selected} busy={mutating} onRecord={recordPayment} /></div>
          </div> : <Card><CardContent className="flex min-h-80 items-center justify-center text-sm text-muted-foreground">Select a tenant account.</CardContent></Card>}
        </section>

        <Card>
          <CardHeader><div><CardTitle>Recent collections</CardTitle><p className="mt-1 text-xs text-muted-foreground">Append-only payment record with invoice allocations</p></div><IndianRupee className="size-5 text-primary" /></CardHeader>
          <CardContent>{payments.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b text-xs text-muted-foreground"><tr><th className="pb-3 font-medium">Received</th><th className="pb-3 font-medium">Tenant</th><th className="pb-3 font-medium">Method</th><th className="pb-3 font-medium">Reference</th><th className="pb-3 font-medium">Allocated invoices</th><th className="pb-3 text-right font-medium">Amount</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment.publicId} className="border-b last:border-b-0"><td className="py-3 text-xs text-muted-foreground">{shortDate(payment.receivedAt)}</td><td className="py-3 font-medium">{payment.tenant.displayName}<p className="text-xs font-normal text-muted-foreground">by {payment.recordedBy}</p></td><td className="py-3 capitalize">{payment.paymentMethod.replaceAll("_", " ")}</td><td className="py-3">{payment.reference ?? "—"}</td><td className="py-3 text-xs text-muted-foreground">{payment.allocations.map((allocation) => allocation.invoiceNumber).join(", ")}</td><td className="py-3 text-right font-bold">{money(payment.amount)}</td></tr>)}</tbody></table></div> : <p className="rounded-xl bg-muted p-6 text-center text-sm text-muted-foreground">No collections have been recorded yet.</p>}</CardContent>
        </Card>
      </div>
    </main>
  );
}
