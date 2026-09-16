import { Ionicons } from "@expo/vector-icons";
import { formatINR } from "@gassetu/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Linking, Platform, View } from "react-native";
import { TrackingMap } from "@/components/TrackingMap";
import { toast } from "@/components/Toast";
import { useBooking, useBookingAction } from "@/features/hooks";
import { Avatar, Button, Card, ErrorState, IconButton, KeyValue, Row, Screen, SkeletonCard, StatusBadge, Text, t } from "@/ui";

/** D3 — Drop detail + navigation */
export default function DropScreen() {
  const { id, start } = useLocalSearchParams<{ id: string; start?: string }>();
  const router = useRouter();
  const q = useBooking(id);
  const action = useBookingAction();
  const autoStarted = useRef(false);
  const b = q.data;

  const startTrip = async () => {
    try {
      await action.mutateAsync({ id: id!, action: "start-trip" });
      toast.success("Trip started", "Live location is now shared with the customer and agency.");
    } catch (e) {
      toast.error("Couldn't start trip", (e as Error).message);
    }
  };

  useEffect(() => {
    if (start === "1" && b && b.status === "ASSIGNED" && !autoStarted.current) {
      autoStarted.current = true;
      startTrip();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, b?.status]);

  if (q.isLoading) {
    return (
      <Screen title="Drop" back>
        <SkeletonCard lines={6} />
      </Screen>
    );
  }
  if (!b) {
    return (
      <Screen title="Drop" back>
        <ErrorState onRetry={() => q.refetch()} />
      </Screen>
    );
  }
  const live = b.status === "OUT_FOR_DELIVERY";
  const canStart = b.status === "ASSIGNED";
  const finished = ["DELIVERED", "DELIVERY_FAILED", "CANCELLED"].includes(b.status);
  const openMaps = () => {
    const { lat, lng } = b.address;
    const url = Platform.select({ ios: `maps://?daddr=${lat},${lng}`, default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` });
    Linking.openURL(url!).catch(() => toast.info("Navigation", "Open your maps app to navigate."));
  };

  return (
    <Screen
      title={b.customerName}
      subtitle={b.code}
      back
      right={<StatusBadge status={b.status} />}
      footer={
        !finished ? (
          <View style={{ gap: 8 }}>
            {canStart ? <Button title="Start trip" icon="navigate" size="lg" loading={action.isPending} onPress={startTrip} /> : null}
            {live ? (
              <>
                <Button title="Complete delivery · Enter OTP" icon="keypad" size="lg" onPress={() => router.push(`/drop/complete?id=${b.id}`)} />
                <Button title="Couldn't deliver" variant="ghost" onPress={() => router.push(`/drop/fail?id=${b.id}`)} />
              </>
            ) : null}
          </View>
        ) : undefined
      }
    >
      <View style={{ gap: 12 }}>
        <Card padded={false}>
          <TrackingMap from={b.agencyLocation} to={{ lat: b.address.lat, lng: b.address.lng }} route={b.route} staff={b.staff?.location ?? null} height={240} />
          <Row between style={{ padding: 14 }}>
            <View style={{ flex: 1 }}>
              <Text variant="label" tone="faint">
                {live ? `ETA ${b.etaMinutes === 0 ? "arrived" : `${b.etaMinutes ?? "—"} min`}` : "Deliver to"}
              </Text>
              <Text variant="small">
                {b.address.line1}, {b.address.line2}
              </Text>
              <Text variant="caption" tone="muted">
                {b.address.city} — {b.address.pincode}
              </Text>
            </View>
            <IconButton icon="navigate-circle" label="Navigate" tone="primary" size={46} onPress={openMaps} />
          </Row>
        </Card>

        <Card>
          <Row gap={12}>
            <Avatar name={b.customerName} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{b.customerName}</Text>
              <Text variant="caption" tone="muted">
                {b.customerType === "commercial" ? "Commercial customer" : "Home customer"} · +91 {b.customerPhone}
              </Text>
            </View>
            <IconButton icon="call" label="Call customer" tone="soft" onPress={() => Linking.openURL(`tel:${b.customerPhone}`)} />
          </Row>
        </Card>

        <Card>
          <Text variant="label" tone="faint" style={{ marginBottom: 6 }}>
            Order
          </Text>
          {b.items.map((i) => (
            <KeyValue key={i.cylinderTypeId} k={`${i.qty} × ${i.name}`} v={formatINR(i.unitPrice * i.qty)} />
          ))}
          <KeyValue k="Payment" v={b.payment.method === "cod" ? `Collect ${formatINR(b.charges.total)} in cash` : `Prepaid (${b.payment.method.toUpperCase()})`} tone={b.payment.method === "cod" ? "danger" : "success"} strong={b.payment.method === "cod"} />
          <KeyValue k="Slot" v={b.slot === "express" ? "⚡ Express — priority" : b.slot.replace(/_/g, " ")} />
          {b.emptyCollected ? <KeyValue k="Empty cylinder" v="Collected" tone="success" /> : null}
          {b.failReason ? <KeyValue k="Failure reason" v={b.failReason.replace(/_/g, " ")} tone="danger" /> : null}
        </Card>

        {live ? (
          <Row gap={8} style={{ backgroundColor: t.colors.primarySoft, padding: 12, borderRadius: 14 }}>
            <Ionicons name="radio" size={18} color={t.colors.primary} />
            <Text variant="caption" style={{ flex: 1, color: t.colors.primaryDark }}>
              Broadcasting your location (mock GPS) — customer and agency can see you moving.
            </Text>
          </Row>
        ) : null}
      </View>
    </Screen>
  );
}
