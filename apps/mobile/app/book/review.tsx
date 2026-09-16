import { Ionicons } from "@expo/vector-icons";
import { SLOT_LABELS, formatINR, type PaymentMethod } from "@gassetu/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { useDraft } from "@/features/bookingDraft";
import { useCreateBooking, useCustomer, type ExpandedBooking } from "@/features/hooks";
import { usePayFlow, type PayOutcome } from "@/features/payment";
import { ApiError, post } from "@/lib/api";
import { Button, Card, Divider, ErrorState, KeyValue, Row, Screen, SkeletonCard, Text, t } from "@/ui";

const METHODS: { key: PaymentMethod; label: string; sub: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "upi", label: "UPI", sub: "GPay, PhonePe, Paytm", icon: "qr-code-outline" },
  { key: "card", label: "Card", sub: "Credit / debit", icon: "card-outline" },
  { key: "netbanking", label: "Netbanking", sub: "All major banks", icon: "business-outline" },
  { key: "wallet", label: "Wallet", sub: "Paytm, Amazon Pay", icon: "wallet-outline" },
  { key: "cod", label: "Cash on delivery", sub: "Pay the delivery partner", icon: "cash-outline" },
];

/** C8 — Review & pay (C9 mock checkout opens from here) */
export default function ReviewScreen() {
  const router = useRouter();
  const draft = useDraft();
  const customer = useCustomer();
  const create = useCreateBooking();
  const [failed, setFailed] = useState<ExpandedBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const c = customer.data;
  const addr = c?.addresses.find((a) => a.id === c.defaultAddressId);

  const quote = useQuery({
    queryKey: ["quote", c?.userId, draft.cylinderTypeId, draft.qty, draft.slot],
    queryFn: () => post("/bookings/quote", { customerId: c!.userId, items: [{ cylinderTypeId: draft.cylinderTypeId, qty: draft.qty }], slot: draft.slot }),
    enabled: !!c && !!draft.cylinderTypeId,
  });
  const q = quote.data;
  const violation = q?.violation as { code: string; message: string } | null | undefined;
  const codAllowed = !!q?.codAllowed;

  const goSuccess = (b: ExpandedBooking) => {
    draft.reset();
    router.replace(`/book/success?id=${b.id}`);
  };

  const flow = usePayFlow();

  const handle = async (outcome: PayOutcome) => {
    if (outcome.kind === "paid") return goSuccess(outcome.booking);
    setFailed(outcome.kind === "cancelled" ? { ...outcome.booking, status: "PENDING_PAYMENT" } : outcome.booking);
  };

  const pay = async () => {
    if (!c || !addr || !draft.cylinderTypeId) return;
    setBusy(true);
    try {
      const b = await create.mutateAsync({ customerId: c.userId, addressId: addr.id, items: [{ cylinderTypeId: draft.cylinderTypeId, qty: draft.qty }], slot: draft.slot, paymentMethod: draft.paymentMethod });
      if (b.status === "PLACED") return goSuccess(b);
      await handle(await flow.pay(b, draft.paymentMethod));
    } catch (e) {
      toast.error("Couldn't place booking", e instanceof ApiError ? e.message : (e as Error).message);
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

  const switchCod = async () => {
    if (!failed) return;
    try {
      goSuccess(await flow.switchToCod(failed));
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
            {failed.status === "PAYMENT_FAILED" ? "Your bank declined the transaction. No money was deducted." : "You closed the checkout before paying."} Booking {failed.code} is saved for {formatINR(failed.charges.total)}.
          </Text>
        </View>
        <View style={{ gap: 10 }}>
          <Button title="Retry payment" icon="refresh" size="lg" loading={flow.busy} onPress={() => retry(draft.paymentMethod === "cod" ? "upi" : draft.paymentMethod)} />
          {codAllowed ? <Button title="Switch to Cash on Delivery" variant="secondary" icon="cash-outline" size="lg" loading={flow.busy} onPress={switchCod} /> : null}
          <Button title="Try another method" variant="ghost" onPress={() => retry("card")} />
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
              Total payable
            </Text>
            <Text variant="h2">{q ? formatINR(q.charges.total) : "—"}</Text>
          </View>
          <Button title={draft.paymentMethod === "cod" ? "Place order" : `Pay ${q ? formatINR(q.charges.total) : ""}`} full={false} loading={busy} disabled={!q || !!violation} onPress={pay} iconRight="lock-closed" />
        </Row>
      }
    >
      {quote.isLoading || customer.isLoading ? (
        <SkeletonCard lines={6} />
      ) : quote.isError ? (
        <ErrorState message={(quote.error as Error).message} onRetry={() => quote.refetch()} />
      ) : (
        <View style={{ gap: 12 }}>
          {violation ? (
            <Card style={{ backgroundColor: t.colors.warningSoft, borderColor: "#F1D98A" }}>
              <Row gap={10} center={false}>
                <Ionicons name="alert-circle" size={22} color="#9A6B00" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong" style={{ color: "#7A5400" }}>
                    {violation.code === "DUPLICATE_OPEN" ? "You already have an open booking" : violation.code === "MIN_GAP" ? "Too soon for a domestic refill" : violation.code === "QUOTA" ? "Yearly quota reached" : "Can't place this booking"}
                  </Text>
                  <Text variant="small" style={{ color: "#7A5400", marginTop: 2 }}>
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
            {q.items.map((i: any) => (
              <KeyValue key={i.cylinderTypeId} k={`${i.qty} × ${i.name ?? "cylinder"} @ ${formatINR(i.unitPrice)}`} v={formatINR(i.unitPrice * i.qty)} />
            ))}
            <KeyValue k="Delivery charge" v={q.charges.delivery ? formatINR(q.charges.delivery) : "Free"} />
            <KeyValue k="Platform convenience fee" v={formatINR(q.charges.convenience)} />
            {q.charges.express ? <KeyValue k={`Express delivery`} v={formatINR(q.charges.express)} /> : null}
            <KeyValue k="GST (5% on fees)" v={formatINR(q.charges.gst)} />
            <Divider />
            <KeyValue k="Total" v={formatINR(q.charges.total)} strong />
          </Card>

          <Card>
            <Row gap={12}>
              <View style={styles.ico}>
                <Ionicons name="location" size={18} color={t.colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" tone="faint">
                  Deliver to · {addr?.label}
                </Text>
                <Text variant="small">
                  {addr?.line1}, {addr?.line2}, {addr?.city} {addr?.pincode}
                </Text>
              </View>
              <Pressable onPress={() => router.push("/addresses")} hitSlop={8} accessibilityLabel="Change address">
                <Text variant="small" tone="primary" style={{ fontWeight: "600" }}>
                  Change
                </Text>
              </Pressable>
            </Row>
            <Divider />
            <Row gap={12}>
              <View style={styles.ico}>
                <Ionicons name="storefront" size={18} color={t.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="label" tone="faint">
                  Agency · {SLOT_LABELS[draft.slot]}
                </Text>
                <Text variant="small">{q.agency.name}</Text>
              </View>
            </Row>
          </Card>

          <Text variant="label" tone="faint" style={{ marginTop: 4 }}>
            Pay with
          </Text>
          <View style={{ gap: 8 }}>
            {METHODS.filter((m) => m.key !== "cod" || codAllowed).map((m) => {
              const active = draft.paymentMethod === m.key;
              return (
                <Pressable key={m.key} onPress={() => draft.set({ paymentMethod: m.key })} accessibilityRole="radio" accessibilityState={{ selected: active }} style={[styles.method, active && styles.methodActive]}>
                  <Ionicons name={m.icon} size={20} color={active ? t.colors.primary : t.colors.inkMuted} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{m.label}</Text>
                    <Text variant="caption" tone="muted">
                      {m.sub}
                    </Text>
                  </View>
                  <Ionicons name={active ? "radio-button-on" : "radio-button-off"} size={20} color={active ? t.colors.primary : t.colors.inkFaint} />
                </Pressable>
              );
            })}
            {!codAllowed ? (
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
  methodActive: { borderColor: t.colors.primary, backgroundColor: "#FFFAF7" },
  failIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: t.colors.danger, alignItems: "center", justifyContent: "center" },
});
