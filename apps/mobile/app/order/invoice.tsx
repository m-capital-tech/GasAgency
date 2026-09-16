import { formatDate, formatINR } from "@gassetu/shared";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { useBooking } from "@/features/hooks";
import { Button, Divider, ErrorState, KeyValue, Row, Screen, SkeletonCard, Text, t } from "@/ui";

/** C12 — Invoice view (mock PDF preview) */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useBooking(id);
  const b = q.data;
  return (
    <Screen title="Invoice" back bg={t.colors.surfaceAlt} footer={<Button title="Download PDF (mock)" icon="download-outline" onPress={() => toast.success("Saved", "Invoice PDF saved to Files (demo).")} />}>
      {q.isLoading ? (
        <SkeletonCard lines={8} />
      ) : !b ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <View style={styles.paper}>
          <Row between center={false}>
            <View>
              <Text variant="h2">TAX INVOICE</Text>
              <Text variant="caption" tone="muted">
                No. INV-{b.code.replace("GS-", "")} · {formatDate(b.createdAt)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text variant="bodyStrong">{b.agencyName}</Text>
              <Text variant="caption" tone="muted">
                {b.agencyOmc} distributor · Hyderabad
              </Text>
              <Text variant="caption" tone="muted">
                GSTIN: 36XXXXX0000X1Z0 (mock)
              </Text>
            </View>
          </Row>
          <Divider />
          <Text variant="label" tone="faint">
            Bill to
          </Text>
          <Text variant="bodyStrong">{b.customerName}</Text>
          <Text variant="small" tone="muted">
            {b.address.line1}, {b.address.line2}, {b.address.city} {b.address.pincode}
          </Text>
          <Divider />
          <Row between style={{ marginBottom: 6 }}>
            <Text variant="label" tone="faint">
              Description
            </Text>
            <Text variant="label" tone="faint">
              Amount
            </Text>
          </Row>
          {b.items.map((i) => (
            <KeyValue key={i.cylinderTypeId} k={`${i.name} × ${i.qty}`} v={formatINR(i.unitPrice * i.qty)} />
          ))}
          {b.charges.delivery ? <KeyValue k="Delivery charge" v={formatINR(b.charges.delivery)} /> : null}
          <KeyValue k="Convenience fee" v={formatINR(b.charges.convenience)} />
          {b.charges.express ? <KeyValue k="Express delivery" v={formatINR(b.charges.express)} /> : null}
          <KeyValue k="GST @5% (on services)" v={formatINR(b.charges.gst)} />
          <Divider />
          <KeyValue k="Grand total" v={formatINR(b.charges.total)} strong />
          <KeyValue k="Payment" v={b.payment.method === "cod" ? "Cash on delivery" : `${b.payment.method.toUpperCase()} · ${b.payment.gatewayRef ?? ""}`} />
          <Text variant="caption" tone="faint" style={{ marginTop: 16 }}>
            Illustrative prototype invoice. Not a valid tax document. Domestic LPG pricing follows OMC notified rates.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ paper: { backgroundColor: "#fff", borderRadius: 8, padding: 18, borderWidth: 1, borderColor: t.colors.border } });
