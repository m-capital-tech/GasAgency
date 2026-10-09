import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import {
  loadTenantHome,
  placeTenantOrder,
  requestTenantQuote,
  type TenantDeliverySlot,
  type TenantHomeResponse,
  type TenantOrderResponse,
  type TenantPaymentMethod,
  type TenantQuote,
} from "@/lib/platform-api";
import { useSession } from "@/lib/session";
import { Button, Card, Chip, Divider, ErrorState, KeyValue, Row, Screen, SkeletonList, Text, t } from "@/ui";

function rupees(value: string) {
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TenantOrderScreen() {
  const router = useRouter();
  const sessionKind = useSession((state) => state.sessionKind);
  const activeTenantPublicId = useSession((state) => state.activeTenantPublicId);
  const [home, setHome] = useState<TenantHomeResponse | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [outletPublicId, setOutletPublicId] = useState<string | null>(null);
  const [deliverySlot, setDeliverySlot] = useState<TenantDeliverySlot | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<TenantPaymentMethod | null>(null);
  const [quote, setQuote] = useState<TenantQuote | null>(null);
  const [order, setOrder] = useState<TenantOrderResponse["order"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeTenantPublicId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await loadTenantHome(activeTenantPublicId);
      setHome(result);
      setOutletPublicId(result.outlets[0]?.publicId ?? null);
      setDeliverySlot(result.deliverySlots.find((slot) => slot.code === "standard")?.code ?? result.deliverySlots[0]?.code ?? null);
      setPaymentMethod(result.paymentMethods[0] ?? null);
      setQuantities(Object.fromEntries(result.catalog.map((item, index) => [item.cylinderTypeCode, index === 0 ? 1 : 0])));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Ordering could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [activeTenantPublicId]);

  useEffect(() => { void load(); }, [load]);
  const items = useMemo(() => Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([cylinderTypeCode, quantity]) => ({ cylinderTypeCode, quantity })), [quantities]);
  const clearQuote = () => { setQuote(null); setError(null); };
  const changeQuantity = (code: string, delta: number) => {
    clearQuote();
    setQuantities((current) => ({ ...current, [code]: Math.max(0, Math.min(500, (current[code] ?? 0) + delta)) }));
  };

  const createQuote = async () => {
    if (!activeTenantPublicId || !outletPublicId || !deliverySlot || !paymentMethod || items.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      setQuote((await requestTenantQuote(activeTenantPublicId, { outletPublicId, deliverySlot, paymentMethod, items })).quote);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A quotation could not be created.");
    } finally {
      setSubmitting(false);
    }
  };

  const place = async () => {
    if (!activeTenantPublicId || !quote) return;
    setSubmitting(true);
    setError(null);
    try {
      setOrder((await placeTenantOrder(activeTenantPublicId, quote.publicId, `mobile-order:${quote.publicId}`)).order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The order could not be placed.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sessionKind !== "tenant") return <Redirect href="/" />;
  if (!activeTenantPublicId) return <Redirect href="/(auth)/select-tenant" />;
  if (order) {
    return (
      <Screen>
        <View style={{ alignItems: "center", paddingTop: 48 }}>
          <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: t.colors.successSoft, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name="checkmark" size={42} color={t.colors.success} />
          </View>
          <Text variant="title" center style={{ marginTop: 20 }}>Order placed</Text>
          <Text variant="body" tone="muted" center style={{ marginTop: 7 }}>Your agency has received {order.orderNumber}.</Text>
          <Card style={{ marginTop: 24, width: "100%" }}>
            <KeyValue k="Order" v={order.orderNumber} />
            <KeyValue k="Payment" v={order.paymentMethod === "credit" ? "Account credit" : "Cash on delivery"} />
            <Divider />
            <KeyValue k="Total" v={rupees(order.totalAmount)} strong tone="primary" />
          </Card>
          <Button title="Back to business" style={{ marginTop: 24 }} onPress={() => router.replace("/(tenant)/home")} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen title="Place order" subtitle={home?.agency.displayName} back>
      {loading ? <SkeletonList count={3} /> : null}
      {error && !home ? <ErrorState message={error} onRetry={() => { void load(); }} /> : null}
      {home ? (
        <>
          <Text variant="h3">Delivery outlet</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {home.outlets.map((outlet) => <Chip key={outlet.publicId} label={outlet.label} active={outletPublicId === outlet.publicId} onPress={() => { clearQuote(); setOutletPublicId(outlet.publicId); }} />)}
          </View>

          <Text variant="h3" style={{ marginTop: 24 }}>Cylinders</Text>
          <View style={{ gap: 10, marginTop: 10 }}>
            {home.catalog.map((item) => (
              <Card key={item.cylinderTypeCode}>
                <Row between>
                  <View style={{ flex: 1 }}>
                    <Text variant="h3">{item.displayName}</Text>
                    <Text variant="small" tone="muted">From {rupees(item.negotiatedUnitPrice ?? item.baseUnitPrice)} before GST</Text>
                  </View>
                  <Row>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${item.displayName}`} onPress={() => changeQuantity(item.cylinderTypeCode, -1)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center" }}><Ionicons name="remove" size={20} color={t.colors.ink} /></Pressable>
                    <Text variant="h2" style={{ minWidth: 26, textAlign: "center" }}>{quantities[item.cylinderTypeCode] ?? 0}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={`Add one ${item.displayName}`} onPress={() => changeQuantity(item.cylinderTypeCode, 1)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.colors.primarySoft, alignItems: "center", justifyContent: "center" }}><Ionicons name="add" size={20} color={t.colors.primary} /></Pressable>
                  </Row>
                </Row>
              </Card>
            ))}
          </View>

          <Text variant="h3" style={{ marginTop: 24 }}>Delivery slot</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {home.deliverySlots.map((slot) => <Chip key={slot.code} label={`${slot.displayName}${Number(slot.surcharge) ? ` · ${rupees(slot.surcharge)}` : ""}`} active={deliverySlot === slot.code} onPress={() => { clearQuote(); setDeliverySlot(slot.code); }} />)}
          </View>

          <Text variant="h3" style={{ marginTop: 24 }}>Payment</Text>
          <View style={{ gap: 8, marginTop: 10 }}>
            {home.paymentMethods.map((method) => <Chip key={method} label={method === "credit" ? `Account credit · ${rupees(home.credit?.available ?? "0")}` : "Cash on delivery"} active={paymentMethod === method} onPress={() => { clearQuote(); setPaymentMethod(method); }} />)}
          </View>

          {error ? <Text variant="small" tone="danger" style={{ marginTop: 18 }}>{error}</Text> : null}
          {quote ? (
            <Card tone="alt" style={{ marginTop: 22 }}>
              <Text variant="h3">Order quotation</Text>
              {quote.items.map((item) => <KeyValue key={item.cylinderTypeCode} k={`${item.displayName} × ${item.quantity}`} v={rupees(item.lineSubtotal)} />)}
              <Divider />
              <KeyValue k="Subtotal" v={rupees(quote.subtotal)} />
              <KeyValue k="Delivery and slot" v={rupees((Number(quote.deliveryFee) + Number(quote.slotSurcharge)).toFixed(2))} />
              <KeyValue k={`GST (${quote.gstRate}%)`} v={rupees(quote.gstAmount)} />
              <Divider />
              <KeyValue k="Order total" v={rupees(quote.totalAmount)} strong tone="primary" />
              <Text variant="caption" tone="muted" style={{ marginTop: 8 }}>Price is reserved for 10 minutes and rechecked when the order is placed.</Text>
            </Card>
          ) : null}

          <Button title={quote ? "Confirm order" : "Review price"} icon={quote ? "checkmark-circle" : "receipt-outline"} loading={submitting} disabled={!items.length || !outletPublicId || !deliverySlot || !paymentMethod} style={{ marginTop: 22 }} onPress={() => { void (quote ? place() : createQuote()); }} />
        </>
      ) : null}
    </Screen>
  );
}
