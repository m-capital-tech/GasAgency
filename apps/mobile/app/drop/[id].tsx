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
    const { lat, lng } = b.outlet;
    const url = Platform.select({ ios: `maps://?daddr=${lat},${lng}`, default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` });
    Linking.openURL(url!).catch(() => toast.info("Navigation", "Open your maps app to navigate."));
  };

  return (
    <Screen
      title={b.businessName}
      subtitle={`${b.code} · ${b.outlet.label}`}
      back
      right={<StatusBadge status={b.status} />}
      footer={
        !finished ? (
          <View style={{ gap: 8 }}>
            {canStart ? <Button title="Start trip" icon="navigate" size="lg" loading={action.isPending} onPress={startTrip} /> : null}
            {live ? (
              <>
                <Button title={`Deliver ${b.cylinders} cylinder${b.cylinders === 1 ? "" : "s"} · Enter OTP`} icon="keypad" size="lg" onPress={() => router.push(`/drop/complete?id=${b.id}`)} />
                <Button title="Couldn't deliver" variant="ghost" onPress={() => router.push(`/drop/fail?id=${b.id}`)} />
              </>
            ) : null}
          </View>
        ) : undefined
      }
    >
      <View style={{ gap: 12 }}>
        <Card padded={false}>
          <TrackingMap from={b.agencyLocation} to={{ lat: b.outlet.lat, lng: b.outlet.lng }} route={b.route} staff={b.staff?.location ?? null} height={240} />
          <Row between style={{ padding: 14 }}>
            <View style={{ flex: 1 }}>
              <Text variant="label" tone="faint">
                {live ? `ETA ${b.etaMinutes === 0 ? "arrived" : `${b.etaMinutes ?? "—"} min`}` : "Deliver to"}
              </Text>
              <Text variant="small">
                {b.outlet.line1}, {b.outlet.line2}
              </Text>
              <Text variant="caption" tone="muted">
                {b.outlet.city} — {b.outlet.pincode}
              </Text>
            </View>
            <IconButton icon="navigate-circle" label="Navigate" tone="primary" size={46} onPress={openMaps} />
          </Row>
        </Card>

        <Card>
          <Row gap={12}>
            <Avatar name={b.businessName} size={44} />
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">{b.businessName}</Text>
              <Text variant="caption" tone="muted">
                {b.outlet.contactName ? `${b.outlet.contactName} · ` : ""}+91 {b.contactPhone}
              </Text>
            </View>
            <IconButton icon="call" label="Call outlet" tone="soft" onPress={() => Linking.openURL(`tel:${b.contactPhone}`)} />
          </Row>
        </Card>

        <Card>
          <Text variant="label" tone="faint" style={{ marginBottom: 6 }}>
            Order
          </Text>
          {b.items.map((i) => (
            <KeyValue key={i.cylinderTypeId} k={`${i.qty} × ${i.name}`} v={formatINR(i.unitPrice * i.qty)} />
          ))}
          <KeyValue k="Empties to collect" v={String(b.emptiesToCollect)} />
          <KeyValue k="Payment" v={b.payment.method === "cod" ? `Collect ${formatINR(b.charges.total)} in cash` : b.payment.method === "credit" ? "On credit — nothing to collect" : `Prepaid (${b.payment.method.toUpperCase()})`} tone={b.payment.method === "cod" ? "danger" : "success"} strong={b.payment.method === "cod"} />
          <KeyValue k="Slot" v={b.slot === "express" ? "⚡ Express — priority" : b.slot === "tomorrow_morning" ? "Before opening (6–9 AM)" : b.slot.replace(/_/g, " ")} />
          {b.status === "DELIVERED" ? <KeyValue k="Empties collected" v={String(b.emptiesCollected)} tone="success" /> : null}
          {b.failReason ? <KeyValue k="Failure reason" v={b.failReason.replace(/_/g, " ")} tone="danger" /> : null}
        </Card>

        {live ? (
          <Row gap={8} style={{ backgroundColor: t.colors.primarySoft, padding: 12, borderRadius: 14 }}>
            <Ionicons name="radio" size={18} color={t.colors.primary} />
            <Text variant="caption" style={{ flex: 1, color: t.colors.primaryDark }}>
              Broadcasting your location (mock GPS) — the outlet and agency can see you moving.
            </Text>
          </Row>
        ) : null}
      </View>
    </Screen>
  );
}
