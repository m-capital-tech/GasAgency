import { Ionicons } from "@expo/vector-icons";
import { formatDate, formatDateShort, formatINR } from "@gassetu/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { keys, useBusiness, useLedger, useMyBookings, useRequestCredit, useStatements, useUserId } from "@/features/hooks";
import { post } from "@/lib/api";
import { Badge, Button, Card, Chip, Divider, EmptyState, ErrorState, Input, KeyValue, Row, Screen, Sheet, SkeletonList, Text, t } from "@/ui";

/** Billing: credit account, invoices due, ledger, monthly statements */
export default function BillingScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const userId = useUserId();
  const biz = useBusiness();
  const ledger = useLedger();
  const bookings = useMyBookings();
  const statements = useStatements();
  const requestCredit = useRequestCredit();
  const [tab, setTab] = useState<"invoices" | "ledger" | "statements">("invoices");
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const b = biz.data;
  const due = (bookings.data ?? []).filter((x) => x.payment.method === "credit" && ["CREDIT_DUE", "CREDIT_OVERDUE"].includes(x.payment.status) && x.status === "DELIVERED").sort((x, y) => (x.payment.dueAt ?? "").localeCompare(y.payment.dueAt ?? ""));

  const pay = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return toast.error("Enter an amount");
    setBusy(true);
    try {
      const r = await post(`/businesses/${userId}/ledger/payment`, { amount: amt, note: "NEFT (mock)" });
      qc.invalidateQueries({ queryKey: keys.business(userId) });
      qc.invalidateQueries({ queryKey: keys.ledger(userId) });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      setPayOpen(false);
      setAmount("");
      toast.success("Payment recorded", `${r.paidInvoices.length} invoice(s) cleared${r.unapplied ? ` · ${formatINR(r.unapplied, { decimals: false })} unapplied` : ""}.`);
    } catch (e) {
      toast.error("Payment failed", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Billing" subtitle={b?.gstin ? `GSTIN ${b.gstin}` : "Add your GSTIN in Profile for GST invoices"} tabBar refreshing={ledger.isRefetching} onRefresh={() => { biz.refetch(); ledger.refetch(); bookings.refetch(); }}>
      {biz.isLoading ? (
        <SkeletonList count={3} />
      ) : !b ? (
        <ErrorState onRetry={() => biz.refetch()} />
      ) : (
        <View style={{ gap: 12 }}>
          <Card tone={b.creditOverdue > 0 ? "soft" : "surface"}>
            {b.credit.status === "approved" ? (
              <>
                <Row between>
                  <View>
                    <Text variant="label" tone="faint">
                      Credit account · net-{b.credit.termDays}
                    </Text>
                    <Text variant="title" tone={b.creditOverdue > 0 ? "danger" : "ink"}>
                      {formatINR(b.creditOutstanding, { decimals: false })}
                    </Text>
                    <Text variant="caption" tone="muted">
                      outstanding · {formatINR(b.creditAvailable, { decimals: false })} available of {formatINR(b.credit.limit, { decimals: false })}
                    </Text>
                  </View>
                  {b.creditOverdue > 0 ? <Badge label={`${formatINR(b.creditOverdue, { decimals: false })} overdue`} bg={t.colors.dangerSoft} fg={t.colors.danger} dot /> : <Badge label="In good standing" bg={t.colors.successSoft} fg={t.colors.success} dot />}
                </Row>
                <Button title="Pay invoices" icon="card-outline" style={{ marginTop: 14 }} onPress={() => { setAmount(String(Math.round(b.creditOutstanding))); setPayOpen(true); }} disabled={b.creditOutstanding <= 0} />
              </>
            ) : b.credit.status === "requested" ? (
              <Row gap={12}>
                <Ionicons name="hourglass-outline" size={26} color={t.colors.goldDark} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">Credit request under review</Text>
                  <Text variant="small" tone="muted">
                    Munna Gas Connect sets your limit and terms after verifying the business. Until then, pay per order.
                  </Text>
                </View>
              </Row>
            ) : (
              <>
                <Text variant="bodyStrong">Order now, pay on invoice</Text>
                <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
                  Get net-15 / net-30 credit terms and one consolidated monthly bill. Munna Gas Connect approves the limit after a quick check.
                </Text>
                <Button title="Request credit account" variant="secondary" icon="card-outline" style={{ marginTop: 12 }} loading={requestCredit.isPending} onPress={() => requestCredit.mutateAsync({ note: "Requested from app" }).then(() => toast.success("Request sent", "Our team reviews credit within 1 working day.")).catch((e) => toast.error("Couldn't send", e.message))} />
              </>
            )}
          </Card>

          <Row gap={8}>
            <Chip label={`Invoices due (${due.length})`} active={tab === "invoices"} onPress={() => setTab("invoices")} />
            <Chip label="Ledger" active={tab === "ledger"} onPress={() => setTab("ledger")} />
            <Chip label="Statements" active={tab === "statements"} onPress={() => setTab("statements")} />
          </Row>

          {tab === "invoices" ? (
            due.length === 0 ? (
              <EmptyState icon="checkmark-done-outline" title="Nothing due" body="Credit invoices appear here once an order is delivered." />
            ) : (
              <View style={{ gap: 10 }}>
                {due.map((x) => {
                  const overdue = x.payment.status === "CREDIT_OVERDUE";
                  return (
                    <Card key={x.id} onPress={() => router.push(`/order/invoice?id=${x.id}`)} padded={false} style={{ borderRadius: 16, borderColor: overdue ? t.colors.danger : t.colors.border }}>
                      <Row between style={{ padding: 14 }}>
                        <View style={{ flex: 1 }}>
                          <Text variant="bodyStrong">{x.invoiceNo}</Text>
                          <Text variant="caption" tone="muted">
                            {x.code} · {x.items.map((i) => `${i.qty} × ${i.name.split(" ")[0]}`).join(" + ")} · {x.outlet.label}
                          </Text>
                          <Text variant="caption" tone={overdue ? "danger" : "muted"}>
                            {overdue ? "Overdue since" : "Due"} {x.payment.dueAt ? formatDateShort(x.payment.dueAt) : "—"}
                          </Text>
                        </View>
                        <Text variant="h3">{formatINR(x.charges.total, { decimals: false })}</Text>
                      </Row>
                    </Card>
                  );
                })}
              </View>
            )
          ) : null}

          {tab === "ledger" ? (
            ledger.isLoading ? (
              <SkeletonList count={4} />
            ) : (ledger.data ?? []).length === 0 ? (
              <EmptyState icon="list-outline" title="No ledger entries" body="Credit invoices and payments are recorded here." />
            ) : (
              <Card style={{ paddingVertical: 4 }}>
                {(ledger.data as any[]).slice(0, 40).map((l) => (
                  <View key={l.id}>
                    <Row between style={{ paddingVertical: 10 }}>
                      <View style={[styles.ledIcon, { backgroundColor: l.kind === "invoice" ? t.colors.primarySoft : t.colors.successSoft }]}>
                        <Ionicons name={l.kind === "invoice" ? "document-text-outline" : "arrow-down-circle-outline"} size={16} color={l.kind === "invoice" ? t.colors.primary : t.colors.success} />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text variant="small" style={{ fontWeight: "600" }}>
                          {l.note ?? (l.kind === "invoice" ? "Invoice" : "Payment")}
                        </Text>
                        <Text variant="caption" tone="muted">
                          {formatDate(l.at)}
                          {l.dueAt ? ` · due ${formatDateShort(l.dueAt)}` : ""}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text variant="small" style={{ fontWeight: "600", color: l.amount > 0 ? t.colors.ink : t.colors.success }}>
                          {l.amount > 0 ? "+" : "−"}
                          {formatINR(Math.abs(l.amount), { decimals: false })}
                        </Text>
                        <Text variant="caption" tone="faint">
                          bal {formatINR(l.balance, { decimals: false })}
                        </Text>
                      </View>
                    </Row>
                    <Divider style={{ marginVertical: 0 }} />
                  </View>
                ))}
              </Card>
            )
          ) : null}

          {tab === "statements" ? (
            statements.isLoading ? (
              <SkeletonList count={3} />
            ) : (statements.data ?? []).length === 0 ? (
              <EmptyState icon="document-outline" title="No statements yet" />
            ) : (
              <View style={{ gap: 8 }}>
                {(statements.data ?? []).map((m) => (
                  <Pressable key={m} onPress={() => router.push(`/statement/${m}`)} style={styles.stmt} accessibilityRole="button">
                    <Ionicons name="document-text-outline" size={20} color={t.colors.goldDark} />
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {new Date(m + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
                    </Text>
                    <Text variant="caption" tone="muted">
                      Consolidated statement
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={t.colors.inkFaint} />
                  </Pressable>
                ))}
              </View>
            )
          ) : null}
        </View>
      )}

      <Sheet open={payOpen} onClose={() => setPayOpen(false)} title="Pay credit invoices">
        <Text variant="small" tone="muted" style={{ marginBottom: 12 }}>
          Mock bank transfer. Oldest invoices are cleared first.
        </Text>
        <Input label="Amount (₹)" value={amount} onChangeText={(v) => setAmount(v.replace(/\D/g, ""))} keyboardType="number-pad" />
        <KeyValue k="Outstanding" v={formatINR(b?.creditOutstanding ?? 0, { decimals: false })} />
        <Button title="Confirm transfer (mock)" icon="checkmark" style={{ marginTop: 12 }} loading={busy} onPress={pay} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ledIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  stmt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 16, backgroundColor: t.colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
});
