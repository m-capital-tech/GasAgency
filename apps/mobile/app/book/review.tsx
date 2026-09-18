import { Ionicons } from "@expo/vector-icons";
import { SLOT_LABELS, formatINR, type PaymentMethod } from "@gassetu/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { draftCount, draftItems, useDraft } from "@/features/bookingDraft";
import { useBusiness, useCreateBooking, type ExpandedBooking, type Quote } from "@/features/hooks";
import { usePayFlow, type PayOutcome } from "@/features/payment";
import { ApiError, post } from "@/lib/api";
import { Button, Card, Divider, ErrorState, KeyValue, Row, Screen, SkeletonCard, Text, t } from "@/ui";

const METHODS: { key: PaymentMethod; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "credit", label: "Pay on credit", sub: "Invoice due later · one monthly statement", icon: "document-text-outline" },
  { key: "upi", label: "UPI", sub: "GPay, PhonePe, business UPI", icon: "qr-code-outline" },
  { key: "card", label: "Corporate card", sub: "Credit / debit", icon: "card-outline" },
  { key: "netbanking", label: "Netbanking", sub: "All major banks", icon: "business-outline" },
  { key: "cod", label: "Cash on delivery", sub: "Pay the delivery partner", icon: "cash-outline" },
];

/** C8 — Review & pay (credit, online via mock Razorpay, or COD) */
export default function ReviewScreen() {
  const router = useRouter();
  const draft = useDraft();
  const biz = useBusiness();
  const create = useCreateBooking();
  const flow = usePayFlow();
  const [failed, setFailed] = useState<ExpandedBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const b = biz.data;
  const outlet = b?.outlets.find((o) => o.id === draft.outletId) ?? b?.outlets[0];
  const items = draftItems(draft.qty);
  const count = draftCount(draft.qty);
  const empties = draft.emptiesToCollect ?? Math.min(count, (outlet?.emptiesHeld ?? 0) + (outlet?.inUse ?? 0));

  const quote = useQuery({
    queryKey: ["quote", b?.userId, JSON.stringify(items), draft.slot, draft.paymentMethod],
    queryFn: () => post<Quote>("/bookings/quote", { businessId: b!.userId, items, slot: draft.slot, paymentMethod: draft.paymentMethod }),
    enabled: !!b && items.length > 0,
  });
  const q = quote.data;
  const violation = q?.violation;
  // if credit isn't available, fall back to UPI silently
  useEffect(() => {
    if (q && draft.paymentMethod === "credit" && !q.creditAllowed) draft.set({ paymentMethod: "upi" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q?.creditAllowed]);

  const goSuccess = (bk: ExpandedBooking) => {
    draft.reset();
    router.replace(`/book/success?id=${bk.id}`);
  };
  const handle = async (outcome: PayOutcome) => {
    if (outcome.kind === "paid") return goSuccess(outcome.booking);
    setFailed(outcome.kind === "cancelled" ? { ...outcome.booking, status: "PENDING_PAYMENT" } : outcome.booking);
  };
  const pay = async () => {
    if (!b || !outlet || !items.length) return;
    setBusy(true);
    try {
      const bk = await create.mutateAsync({ businessId: b.userId, outletId: outlet.id, items, slot: draft.slot, paymentMethod: draft.paymentMethod, emptiesToCollect: empties });
      if (bk.status === "PLACED") return goSuccess(bk);
      await handle(await flow.pay(bk, draft.paymentMethod));
    } catch (e) {
      toast.error("Couldn't place order", e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const retry = async (method: PaymentMethod) => {
    if (!failed) return;
    try {
      await handle(await flow.pay(failed, method));
    } catch (e) {
      toast.error("Retry failed", (e as Error).message);
    }
  };
  const switchTo = async (method: "cod" | "credit") => {
    if (!failed) return;
    try {
      goSuccess(await flow.switchPayment(failed, method));
    } catch (e) {
      toast.error("Couldn't switch", (e as Error).message);
    }
  };

  if (failed) {
    return (
      <Screen title="Payment not completed" back>
        <View style={{ alignItems: "center", paddingVertical: 24, gap: 8 }}>
          <View style={styles.failIcon}>
            <Ionicons name="close" size={30} color="#fff" />
          </View>
          <Text variant="h2" center>
            {failed.status === "PAYMENT_FAILED" ? "Payment failed" : "Payment pending"}
          </Text>
          <Text variant="small" tone="muted" center style={{ maxWidth: 300 }}>
            {failed.status === "PAYMENT_FAILED" ? "Your bank declined the transaction. No money was deducted." : "You closed the checkout before paying."} Order {failed.code} is saved for {formatINR(failed.charges.total)}.
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <Button title="Retry payment" icon="refresh" size="lg" loading={flow.busy} onPress={() => retry(draft.paymentMethod === "cod" || draft.paymentMethod === "credit" ? "upi" : draft.paymentMethod)} />
          {q?.creditAllowed ? <Button title="Put it on credit instead" variant="secondary" icon="document-text-outline" size="lg" loading={flow.busy} onPress={() => switchTo("credit")} /> : null}
          {q?.codAllowed ? <Button title="Switch to cash on delivery" variant="ghost" icon="cash-outline" loading={flow.busy} onPress={() => switchTo("cod")} /> : null}
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Review & pay"
      subtitle="Step 3 of 3"
      back
      footer={
        <Row between>
          <View>
            <Text variant="caption" tone="muted">
              Total incl. GST
            </Text>
            <Text variant="h2">{q ? formatINR(q.charges.total) : "—"}</Text>
          </View>
          <Button title={draft.paymentMethod === "credit" ? "Place order on credit" : draft.paymentMethod === "cod" ? "Place order" : `Pay ${q ? formatINR(q.charges.total, { decimals: false }) : ""}`} full={false} loading={busy} disabled={!q || !!violation} onPress={pay} iconRight={draft.paymentMethod === "credit" || draft.paymentMethod === "cod" ? "checkmark" : "lock-closed"} />
        </Row>
      }
    >
      {quote.isLoading || biz.isLoading ? (
        <SkeletonCard lines={6} />
      ) : quote.isError ? (
        <ErrorState message={(quote.error as Error).message} onRetry={() => quote.refetch()} />
      ) : !q ? (
        <ErrorState message="Add at least one cylinder." onRetry={() => router.back()} />
      ) : (
        <View style={{ gap: 12 }}>
          {violation ? (
            <Card style={{ backgroundColor: t.colors.goldSoft, borderColor: "#D9C28C" }}>
              <Row gap={10} center={false}>
                <Ionicons name="alert-circle" size={22} color={t.colors.goldDark} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" style={{ color: "#7A5A1E" }}>
                    {violation.code === "CREDIT_LIMIT" ? "Over your credit limit" : violation.code === "CREDIT_OVERDUE" ? "Overdue invoice on your account" : violation.code === "CREDIT_NOT_APPROVED" ? "Credit not available yet" : violation.code === "QTY_CAP" ? "Too many cylinders for one order" : "Can't place this order"}
                  </Text>
                  <Text variant="small" style={{ color: "#7A5A1E", marginTop: 2 }}>
                    {violation.message}
                  </Text>
                </View>
              </Row>
            </Card>
          ) : null}

          <Card>
            <Text variant="label" tone="faint" style={{ marginBottom: 8 }}>
              Bill details
            </Text>
            {q.items.map((i) => (
              <KeyValue key={i.cylinderTypeId} k={`${i.qty} × ${i.name} @ ${formatINR(i.unitPrice, { decimals: false })}${i.negotiated ? " (your rate)" : i.unitPrice < i.basePrice ? " (slab)" : ""}`} v={formatINR(i.unitPrice * i.qty)} />
            ))}
            {q.charges.slabDiscount ? <KeyValue k="Slab discount included" v={`− ${formatINR(q.charges.slabDiscount)}`} tone="success" /> : null}
            <KeyValue k="Delivery" v={q.charges.delivery ? formatINR(q.charges.delivery) : "Free"} />
            <KeyValue k="Platform convenience fee" v={formatINR(q.charges.convenience)} />
            {q.charges.express ? <KeyValue k="Express delivery" v={formatINR(q.charges.express)} /> : null}
            <KeyValue k="GST @ 18%" v={formatINR(q.charges.gst)} />
            <Divider />
            <KeyValue k="Total" v={formatINR(q.charges.total)} strong />
            {b?.gstin ? (
              <Text variant="caption" tone="faint" style={{ marginTop: 4 }}>
                Tax invoice will carry GSTIN {b.gstin} — input credit eligible.
              </Text>
            ) : null}
          </Card>

          <Card>
            <Row gap={12}>
              <View style={styles.ico}>
                <Ionicons name="storefront" size={18} color={t.colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" tone="faint">
                  Deliver to · {outlet?.label}
                </Text>
                <Text variant="small">
                  {outlet?.line1}, {outlet?.line2}, {outlet?.pincode}
                </Text>
                <Text variant="caption" tone="muted">
                  {count} cylinders in · {empties} empties out
                </Text>
              </View>
              <Pressable onPress={() => router.replace("/book/cylinder")} hitSlop={8} accessibilityLabel="Change outlet">
                <Text variant="small" tone="primary" style={{ fontWeight: "600" }}>
                  Change
                </Text>
              </Pressable>
            </Row>
            <Divider />
            <Row gap={12}>
              <View style={styles.ico}>
                <Ionicons name="time" size={18} color={t.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" tone="faint">
                  {q.agency.name}
                </Text>
                <Text variant="small">{SLOT_LABELS[draft.slot]}</Text>
              </View>
            </Row>
          </Card>

          <Text variant="label" tone="faint" style={{ marginTop: 4 }}>
            Pay with
          </Text>
          <View style={{ gap: 8 }}>
            {METHODS.filter((m) => (m.key !== "cod" || q.codAllowed) && (m.key !== "credit" || q.creditStatus !== "none" || b?.credit.status === "requested")).map((m) => {
              const active = draft.paymentMethod === m.key;
              const creditLocked = m.key === "credit" && !q.creditAllowed;
              return (
                <Pressable key={m.key} onPress={() => !creditLocked && draft.set({ paymentMethod: m.key })} accessibilityRole="radio" accessibilityState={{ selected: active, disabled: creditLocked }} style={[styles.method, active && styles.methodActive, creditLocked && { opacity: 0.55 }]}>
                  <Ionicons name={m.icon} size={20} color={active ? t.colors.primary : t.colors.inkMuted} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{m.label}</Text>
                    <Text variant="caption" tone="muted">
                      {m.key === "credit" ? (q.creditAllowed ? `Net-${q.creditTermDays} · ${formatINR(q.creditAvailable, { decimals: false })} available` : q.creditStatus === "requested" ? "Awaiting GasSetu approval" : m.sub) : m.sub}
                    </Text>
                  </View>
                  {m.key === "credit" && q.creditAllowed ? (
                    <View style={styles.goldTag}>
                      <Text variant="caption" style={{ color: t.colors.goldDark }}>
                        Business
                      </Text>
                    </View>
                  ) : null}
                  <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? t.colors.primary : t.colors.inkFaint} />
                </Pressable>
              );
            })}
            {!q.codAllowed ? (
              <Text variant="caption" tone="faint">
                This agency does not offer cash on delivery.
              </Text>
            ) : null}
          </View>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  ico: { width: 36, height: 36, borderRadius: 12, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
  method: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 16, backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.border },
  methodActive: { borderColor: t.colors.primary, backgroundColor: "#FBF3EE" },
  goldTag: { backgroundColor: t.colors.goldSoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  failIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: t.colors.danger, alignItems: "center", justifyContent: "center" },
});
