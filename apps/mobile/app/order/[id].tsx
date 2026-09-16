import { Ionicons } from "@expo/vector-icons";
import { STATUS_LABELS, TIMELINE_STEPS, canCancel, formatDateShort, formatDateTime, formatINR, formatTime, type BookingStatus } from "@gassetu/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";
import { TrackingMap } from "@/components/TrackingMap";
import { toast } from "@/components/Toast";
import { useDraft } from "@/features/bookingDraft";
import { useBooking, useCancelBooking } from "@/features/hooks";
import { usePayFlow } from "@/features/payment";
import { Avatar, Button, Card, Divider, ErrorState, IconButton, KeyValue, Row, Screen, Sheet, SkeletonCard, StatusBadge, Text, t } from "@/ui";

const STEP_COPY: Record<string, { title: string; sub: string }> = {
  PLACED: { title: "Order placed", sub: "Sent to your agency" },
  ACCEPTED: { title: "Accepted by agency", sub: "Preparing your cylinder" },
  ASSIGNED: { title: "Delivery partner assigned", sub: "Will pick up shortly" },
  OUT_FOR_DELIVERY: { title: "Out for delivery", sub: "On the way to you" },
  DELIVERED: { title: "Delivered", sub: "Enjoy! Reminder scheduled" },
};

/** C11 — Order tracking */
export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const q = useBooking(id);
  const cancel = useCancelBooking();
  const flow = usePayFlow();
  const draft = useDraft();
  const [cancelOpen, setCancelOpen] = useState(false);
  const b = q.data;

  if (q.isLoading) {
    return (
      <Screen title="Order" back>
        <SkeletonCard lines={6} />
      </Screen>
    );
  }
  if (q.isError || !b) {
    return (
      <Screen title="Order" back>
        <ErrorState message={(q.error as Error | undefined)?.message ?? "Order not found"} onRetry={() => q.refetch()} />
      </Screen>
    );
  }

  const awaitingPayment = b.status === "PENDING_PAYMENT" || b.status === "PAYMENT_FAILED";
  const terminal = ["DELIVERED", "REJECTED", "CANCELLED"].includes(b.status);
  const failedDelivery = b.status === "DELIVERY_FAILED";
  const live = b.status === "OUT_FOR_DELIVERY";
  const reached = (s: BookingStatus) => b.statusHistory.some((h) => h.status === s);
  const timeOf = (s: BookingStatus) => b.statusHistory.filter((h) => h.status === s).at(-1)?.at;
  const currentIdx = TIMELINE_STEPS.indexOf(b.status as any);

  const payNow = async () => {
    try {
      const out = await flow.pay(b, b.payment.method);
      if (out.kind === "paid") toast.success("Payment successful", `Booking ${b.code} placed.`);
      else if (out.kind === "failed") toast.error("Payment failed", "Retry or switch to cash on delivery.");
    } catch (e) {
      toast.error("Payment error", (e as Error).message);
    }
  };

  const rebook = () => {
    draft.set({ cylinderTypeId: b.items[0].cylinderTypeId, qty: b.items[0].qty, slot: "standard", paymentMethod: b.payment.method });
    router.push("/book/cylinder");
  };

  return (
    <Screen
      title={b.code}
      subtitle={`${formatDateShort(b.createdAt)}, ${formatTime(b.createdAt)}`}
      back
      right={<StatusBadge status={b.status} />}
      refreshing={q.isRefetching}
      onRefresh={() => q.refetch()}
    >
      <View style={{ gap: 12 }}>
        {/* payment pending */}
        {awaitingPayment ? (
          <Card style={{ borderColor: t.colors.warning }}>
            <Text variant="bodyStrong">{b.status === "PAYMENT_FAILED" ? "Payment failed" : "Complete your payment"}</Text>
            <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
              {b.status === "PAYMENT_FAILED" ? "No money was deducted. Retry, or pay cash on delivery." : "Your order will be sent to the agency once paid."}
            </Text>
            <Row gap={8} style={{ marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Button title={`Pay ${formatINR(b.charges.total)}`} size="sm" loading={flow.busy} onPress={payNow} />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Cash on delivery" size="sm" variant="secondary" loading={flow.busy} onPress={() => flow.switchToCod(b).then(() => toast.success("Switched to cash on delivery")).catch((e) => toast.error("Not available", e.message))} />
              </View>
            </Row>
          </Card>
        ) : null}

        {/* live map */}
        {live || b.status === "ASSIGNED" || b.status === "DELIVERED" ? (
          <Card padded={false}>
            <TrackingMap from={b.agencyLocation} to={{ lat: b.address.lat, lng: b.address.lng }} route={live ? b.route : null} staff={live && b.staff ? b.staff.location : b.status === "DELIVERED" ? null : (b.staff?.location ?? null)} height={live ? 260 : 160} interactive={live} />
            {live ? (
              <Row between style={{ padding: 14 }}>
                <View>
                  <Text variant="label" tone="faint">
                    Arriving in
                  </Text>
                  <Text variant="title">{b.etaMinutes === 0 ? "Arrived" : `${b.etaMinutes ?? "—"} min`}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text variant="label" tone="faint">
                    Delivery OTP
                  </Text>
                  <Row gap={6} style={{ marginTop: 2 }}>
                    {b.deliveryOtp.split("").map((d, i) => (
                      <View key={i} style={styles.otp}>
                        <Text variant="h3" tone="primary">
                          {d}
                        </Text>
                      </View>
                    ))}
                  </Row>
                </View>
              </Row>
            ) : null}
          </Card>
        ) : null}

        {/* delivery partner */}
        {b.staff && !terminal ? (
          <Card>
            <Row gap={12}>
              <Avatar name={b.staff.name} color={t.colors.info} size={46} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{b.staff.name}</Text>
                <Text variant="caption" tone="muted">
                  {b.staff.vehicle} · {b.staff.vehicleNo} · {b.staff.onTimePct}% on time
                </Text>
              </View>
              <IconButton icon="call" label="Call delivery partner" tone="primary" onPress={() => Linking.openURL(`tel:${b.staff!.phone}`)} />
              <IconButton icon="chatbubble-ellipses-outline" label="Chat" onPress={() => toast.info("Chat coming soon", "Call your delivery partner for now.")} />
            </Row>
          </Card>
        ) : null}

        {/* OTP for non-live states */}
        {!terminal && !awaitingPayment && !live ? (
          <Card tone="soft">
            <Row between>
              <View>
                <Text variant="label" tone="faint">
                  Delivery OTP
                </Text>
                <Text variant="small" tone="muted">
                  Share with the delivery partner only
                </Text>
              </View>
              <Text variant="title" tone="primary" style={{ letterSpacing: 4 }}>
                {b.deliveryOtp}
              </Text>
            </Row>
          </Card>
        ) : null}

        {failedDelivery ? (
          <Card style={{ borderColor: t.colors.danger }}>
            <Row gap={10}>
              <Ionicons name="alert-circle" size={22} color={t.colors.danger} />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Delivery attempt failed</Text>
                <Text variant="small" tone="muted">
                  {b.statusHistory.at(-1)?.note ?? "Your agency will reschedule."}
                </Text>
              </View>
            </Row>
          </Card>
        ) : null}

        {/* timeline */}
        {!awaitingPayment && b.status !== "REJECTED" && b.status !== "CANCELLED" ? (
          <Card>
            <Text variant="label" tone="faint" style={{ marginBottom: 10 }}>
              Order timeline
            </Text>
            {TIMELINE_STEPS.map((s, i) => {
              const done = reached(s) && (i < currentIdx || b.status === "DELIVERED");
              const current = s === b.status || (failedDelivery && s === "ACCEPTED");
              const at = timeOf(s);
              return (
                <Row key={s} gap={12} center={false} style={{ minHeight: 52 }}>
                  <View style={{ alignItems: "center", width: 22 }}>
                    <View style={[styles.node, done && styles.nodeDone, current && styles.nodeCurrent]}>{done ? <Ionicons name="checkmark" size={12} color="#fff" /> : null}</View>
                    {i < TIMELINE_STEPS.length - 1 ? <View style={[styles.line, done && { backgroundColor: t.colors.success }]} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: 12 }}>
                    <Text variant="bodyStrong" tone={done || current ? "ink" : "faint"}>
                      {STEP_COPY[s].title}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {at ? formatDateTime(at) : STEP_COPY[s].sub}
                    </Text>
                  </View>
                </Row>
              );
            })}
          </Card>
        ) : null}

        {b.status === "REJECTED" || b.status === "CANCELLED" ? (
          <Card style={{ borderColor: t.colors.border }}>
            <Text variant="bodyStrong">{STATUS_LABELS[b.status]}</Text>
            <Text variant="small" tone="muted">
              {b.rejectReason ?? b.cancelReason ?? ""}
              {b.payment.status === "REFUNDED" ? ` · Refund of ${formatINR(b.charges.total)} initiated (3–5 days).` : ""}
            </Text>
          </Card>
        ) : null}

        {/* details */}
        <Card>
          <Text variant="label" tone="faint" style={{ marginBottom: 6 }}>
            Details
          </Text>
          {b.items.map((i) => (
            <KeyValue key={i.cylinderTypeId} k={`${i.qty} × ${i.name}`} v={formatINR(i.unitPrice * i.qty)} />
          ))}
          <KeyValue k="Delivery + fees + GST" v={formatINR(b.charges.delivery + b.charges.convenience + b.charges.express + b.charges.gst)} />
          <Divider />
          <KeyValue k="Total" v={formatINR(b.charges.total)} strong />
          <KeyValue k="Payment" v={b.payment.method === "cod" ? (b.payment.status === "COD_COLLECTED" ? "Cash collected" : "Cash on delivery") : `${b.payment.method.toUpperCase()} · ${b.payment.status === "PAID" ? "Paid" : b.payment.status === "REFUNDED" ? "Refunded" : b.payment.status}`} />
          <KeyValue k="Agency" v={b.agencyName} />
          <KeyValue k="Address" v={`${b.address.line1}, ${b.address.pincode}`} />
          <Row gap={8} style={{ marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <Button title="Invoice" variant="ghost" size="sm" icon="document-text-outline" onPress={() => router.push(`/order/invoice?id=${b.id}`)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Help" variant="ghost" size="sm" icon="help-circle-outline" onPress={() => router.push(`/support?bookingId=${b.id}`)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Call" variant="ghost" size="sm" icon="call-outline" onPress={() => Linking.openURL(`tel:${b.agencyPhone}`)} />
            </View>
          </Row>
        </Card>

        {terminal ? <Button title="Book again" icon="repeat" onPress={rebook} /> : null}
        {canCancel(b.status) ? <Button title="Cancel booking" variant="ghost" onPress={() => setCancelOpen(true)} /> : null}
      </View>

      <Sheet open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this booking?">
        <Text variant="small" tone="muted" style={{ marginBottom: 12 }}>
          {b.payment.status === "PAID" ? `Your payment of ${formatINR(b.charges.total)} will be refunded in 3–5 working days.` : "No charges apply."}
        </Text>
        {["Changed my mind", "Ordered by mistake", "Found another supplier", "Delivery too slow"].map((r) => (
          <Button
            key={r}
            title={r}
            variant="ghost"
            style={{ marginBottom: 8 }}
            loading={cancel.isPending}
            onPress={() =>
              cancel
                .mutateAsync({ id: b.id, reason: r })
                .then(() => {
                  setCancelOpen(false);
                  toast.success("Booking cancelled");
                })
                .catch((e) => Alert.alert("Couldn't cancel", e.message))
            }
          />
        ))}
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  otp: { width: 30, height: 36, borderRadius: 8, backgroundColor: t.colors.primarySoft, alignItems: "center", justifyContent: "center" },
  node: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: t.colors.border, backgroundColor: t.colors.surface, alignItems: "center", justifyContent: "center" },
  nodeDone: { backgroundColor: t.colors.success, borderColor: t.colors.success },
  nodeCurrent: { borderColor: t.colors.primary, borderWidth: 4 },
  line: { width: 2, flex: 1, backgroundColor: t.colors.border, marginVertical: 2 },
});
