import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { TenantOrderStatusBadge, tenantOrderStatusLabel } from "@/components/TenantStatusBadge";
import { loadTenantOrder, type TenantOrderDetail } from "@/lib/platform-api";
import { useSession } from "@/lib/session";
import { Button, Card, Divider, ErrorState, KeyValue, Row, Screen, SkeletonCard, Text, t } from "@/ui";

function rupees(value: string | number) {
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function TenantOrderDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const sessionKind = useSession((state) => state.sessionKind);
  const tenantPublicId = useSession((state) => state.activeTenantPublicId);
  const [order, setOrder] = useState<TenantOrderDetail | null>(null);
  const orderStatus = order?.status;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantPublicId || !id) return;
    setLoading(true);
    setError(null);
    try {
      setOrder((await loadTenantOrder(tenantPublicId, id)).order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The order could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id, tenantPublicId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!orderStatus || ["delivered", "rejected", "cancelled"].includes(orderStatus)) return;
    const timer = setInterval(() => { void refresh(); }, 30_000);
    return () => clearInterval(timer);
  }, [orderStatus, refresh]);

  if (sessionKind !== "tenant") return <Redirect href="/" />;
  if (!tenantPublicId) return <Redirect href="/(auth)/select-tenant" />;

  return (
    <Screen title={order?.orderNumber ?? "Order"} subtitle={order ? order.outlet.label : undefined} back right={order ? <TenantOrderStatusBadge status={order.status} /> : undefined} refreshing={loading} onRefresh={() => { void refresh(); }}>
      {loading && !order ? <SkeletonCard lines={8} /> : null}
      {error && !order ? <ErrorState message={error} onRetry={() => { void refresh(); }} /> : null}
      {order ? (
        <View style={{ gap: 12 }}>
          {order.status === "delivery_failed" || order.status === "rejected" || order.status === "cancelled" ? (
            <Card style={{ borderColor: t.colors.danger }}>
              <Row gap={10} center={false}>
                <Ionicons name="alert-circle" size={22} color={t.colors.danger} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{tenantOrderStatusLabel[order.status]}</Text>
                  <Text variant="small" tone="muted" style={{ marginTop: 3 }}>{order.failureReason ?? "Contact the serving agency for assistance."}</Text>
                </View>
              </Row>
            </Card>
          ) : null}

          {order.deliveryPartner ? (
            <Card tone="alt">
              <Text variant="label" tone="muted">Delivery partner</Text>
              <Text variant="h3" style={{ marginTop: 4 }}>{order.deliveryPartner.name}</Text>
              <Text variant="small" tone="muted">{order.deliveryPartner.vehicleType} · {order.deliveryPartner.vehicleNumber}</Text>
            </Card>
          ) : null}

          <Card>
            <Text variant="h3" style={{ marginBottom: 14 }}>Order timeline</Text>
            {order.timeline.map((event, index) => (
              <Row key={event.publicId} gap={12} center={false} style={{ minHeight: 58 }}>
                <View style={{ alignItems: "center", width: 24 }}>
                  <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: index === order.timeline.length - 1 ? t.colors.primary : t.colors.success, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name={index === order.timeline.length - 1 ? "ellipse" : "checkmark"} size={12} color="#fff" />
                  </View>
                  {index < order.timeline.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: t.colors.success, marginVertical: 2 }} /> : null}
                </View>
                <View style={{ flex: 1, paddingBottom: 12 }}>
                  <Text variant="bodyStrong">{tenantOrderStatusLabel[event.toStatus]}</Text>
                  <Text variant="caption" tone="muted">{dateTime(event.occurredAt)}</Text>
                  {event.note ? <Text variant="small" tone="danger" style={{ marginTop: 2 }}>{event.note}</Text> : null}
                </View>
              </Row>
            ))}
          </Card>

          <Card>
            <Text variant="h3" style={{ marginBottom: 8 }}>Order details</Text>
            {order.items.map((item) => <KeyValue key={item.cylinderTypeCode} k={`${item.quantity} × ${item.displayName} @ ${rupees(item.unitPrice)}`} v={rupees(item.lineSubtotal)} />)}
            <KeyValue k="Delivery fee" v={rupees(Number(order.deliveryFee) + Number(order.slotSurcharge))} />
            <KeyValue k={`GST (${order.gstRate}%)`} v={rupees(order.gstAmount)} />
            <Divider />
            <KeyValue k="Total" v={rupees(order.totalAmount)} strong tone="primary" />
            <KeyValue k="Payment" v={order.payment.method === "credit" ? "Account credit" : "Cash on delivery"} />
            <KeyValue k="Empties" v={order.status === "delivered" ? `${order.emptiesCollected} collected` : `${order.emptiesExpected} expected`} />
          </Card>

          <Card>
            <Text variant="h3">Delivery address</Text>
            <Text variant="bodyStrong" style={{ marginTop: 7 }}>{order.outlet.label}</Text>
            <Text variant="small" tone="muted">{[order.outlet.addressLine1, order.outlet.addressLine2, order.outlet.city, order.outlet.stateCode, order.outlet.pincode].filter(Boolean).join(", ")}</Text>
            {order.deliveryInstructions ? <Text variant="small" tone="muted" style={{ marginTop: 7 }}>Instruction: {order.deliveryInstructions}</Text> : null}
          </Card>

          {order.invoice ? <Button title={`View invoice ${order.invoice.invoiceNumber}`} icon="document-text-outline" variant="secondary" onPress={() => router.push({ pathname: "/(tenant)/invoice-detail", params: { id: order.invoice!.publicId } })} /> : null}
          <Button title="Report an issue with this order" icon="help-circle-outline" variant="secondary" onPress={() => router.push({ pathname: "/(tenant)/support", params: { orderPublicId: order.publicId } })} />
          <Button title={`Call ${order.agency.displayName}`} icon="call-outline" variant="ghost" onPress={() => { void Linking.openURL(`tel:${order.agency.phoneE164}`); }} />
        </View>
      ) : null}
    </Screen>
  );
}
