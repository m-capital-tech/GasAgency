import { formatDate, formatINR } from "@gassetu/shared";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { useBooking, useBusiness } from "@/features/hooks";
import { Button, Divider, ErrorState, KeyValue, Row, Screen, SkeletonCard, Text, t } from "@/ui";

/** GST tax invoice (mock PDF preview) */
export default function InvoiceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useBooking(id);
  const biz = useBusiness();
  const b = q.data;
  const gst = b ? b.charges.gst : 0;
  return (
    <Screen title="Tax invoice" back bg={t.colors.surfaceAlt} footer={<Button title="Download PDF (mock)" icon="download-outline" onPress={() => toast.success("Saved", "Invoice PDF saved to Files (demo).")} />}>
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
                {b.invoiceNo} · {formatDate(b.deliveredAt ?? b.createdAt)}
              </Text>
              {b.payment.method === "credit" && b.payment.dueAt ? (
                <Text variant="caption" tone={b.payment.status === "CREDIT_OVERDUE" ? "danger" : "muted"}>
                  Credit · due {formatDate(b.payment.dueAt)} · {b.payment.status === "CREDIT_PAID" ? "PAID" : b.payment.status === "CREDIT_OVERDUE" ? "OVERDUE" : "UNPAID"}
                </Text>
              ) : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text variant="bodyStrong">{b.agencyName}</Text>
              <Text variant="caption" tone="muted">
                {b.agencyOmc} distributor · Hyderabad
              </Text>
              <Text variant="caption" tone="muted">
                GSTIN 36XXXXX0000X1Z0 (mock)
              </Text>
            </View>
          </Row>
          <Divider />
          <Text variant="label" tone="faint">
            Bill to
          </Text>
          <Text variant="bodyStrong">{b.businessName}</Text>
          <Text variant="small" tone="muted">
            {b.outlet.label} · {b.outlet.line1}, {b.outlet.line2}, {b.outlet.city} {b.outlet.pincode}
          </Text>
          <Text variant="small" tone="muted">
            {biz.data?.gstin ? `GSTIN ${biz.data.gstin}` : "GSTIN not provided"}
            {biz.data?.fssai ? ` · FSSAI ${biz.data.fssai}` : ""}
          </Text>
          <Divider />
          <Row between style={{ marginBottom: 6 }}>
            <Text variant="label" tone="faint">
              Description · HSN 2711
            </Text>
            <Text variant="label" tone="faint">
              Amount
            </Text>
          </Row>
          {b.items.map((i) => (
            <KeyValue key={i.cylinderTypeId} k={`${i.name} LPG × ${i.qty} @ ${formatINR(i.unitPrice, { decimals: false })}`} v={formatINR(i.unitPrice * i.qty)} />
          ))}
          {b.charges.delivery ? <KeyValue k="Delivery charge" v={formatINR(b.charges.delivery)} /> : null}
          <KeyValue k="Platform convenience fee" v={formatINR(b.charges.convenience)} />
          {b.charges.express ? <KeyValue k="Express delivery" v={formatINR(b.charges.express)} /> : null}
          <KeyValue k="Taxable value" v={formatINR(b.charges.total - gst)} />
          <KeyValue k="CGST @ 9%" v={formatINR(gst / 2)} />
          <KeyValue k="SGST @ 9%" v={formatINR(gst / 2)} />
          <Divider />
          <KeyValue k="Grand total" v={formatINR(b.charges.total)} strong />
          <KeyValue k="Cylinders returned" v={`${b.emptiesCollected} of ${b.emptiesToCollect}`} />
          <Text variant="caption" tone="faint" style={{ marginTop: 16 }}>
            Illustrative prototype invoice. Cylinders remain the property of the oil marketing company; deposit terms per your distributor agreement.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ paper: { backgroundColor: "#fff", borderRadius: 8, padding: 18, borderWidth: 1, borderColor: t.colors.border } });
