import { formatDateShort, formatINR } from "@gassetu/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { useStatement } from "@/features/hooks";
import { Button, Divider, ErrorState, KeyValue, Row, Screen, SkeletonCard, Text, t } from "@/ui";

/** Monthly consolidated statement */
export default function StatementScreen() {
  const { month } = useLocalSearchParams<{ month: string }>();
  const router = useRouter();
  const q = useStatement(month);
  const s = q.data;
  const title = month ? new Date(month + "-01").toLocaleDateString("en-IN", { month: "long", year: "numeric" }) : "Statement";
  return (
    <Screen title={title} subtitle="Consolidated statement" back bg={t.colors.surfaceAlt} footer={<Button title="Download PDF (mock)" icon="download-outline" onPress={() => toast.success("Saved", "Statement PDF saved to Files (demo).")} />}>
      {q.isLoading ? (
        <SkeletonCard lines={8} />
      ) : !s ? (
        <ErrorState onRetry={() => q.refetch()} />
      ) : (
        <View style={styles.paper}>
          <Text variant="h2">{s.business.name}</Text>
          <Text variant="caption" tone="muted">
            {s.business.gstin ? `GSTIN ${s.business.gstin} · ` : ""}
            {s.business.agencyName}
          </Text>
          <Divider />
          <KeyValue k="Orders" v={String(s.totals.orders)} />
          <KeyValue k="Cylinders delivered" v={String(s.totals.cylinders)} />
          <KeyValue k="Taxable value" v={formatINR(s.totals.subtotal)} />
          <KeyValue k="GST" v={formatINR(s.totals.gst)} />
          <Divider />
          <KeyValue k="Total billed" v={formatINR(s.totals.total)} strong />
          <KeyValue k="On credit" v={formatINR(s.totals.credit)} />
          <KeyValue k="Prepaid online" v={formatINR(s.totals.prepaid)} />
          <KeyValue k="Cash on delivery" v={formatINR(s.totals.cod)} />
          <Divider />
          <Text variant="label" tone="faint" style={{ marginBottom: 6 }}>
            Line items
          </Text>
          {s.rows.map((b: any) => (
            <Row key={b.id} between style={{ paddingVertical: 6 }}>
              <View style={{ flex: 1 }}>
                <Text variant="small" style={{ fontWeight: "600" }} onPress={() => router.push(`/order/invoice?id=${b.id}`)}>
                  {b.invoiceNo} · {formatDateShort(b.deliveredAt ?? b.createdAt)}
                </Text>
                <Text variant="caption" tone="muted">
                  {b.items.map((i: any) => `${i.qty} × ${i.name.split(" ")[0]}`).join(" + ")} · {b.outlet.label} · {b.payment.method === "credit" ? "credit" : b.payment.method}
                </Text>
              </View>
              <Text variant="small" style={{ fontWeight: "600" }}>
                {formatINR(b.charges.total, { decimals: false })}
              </Text>
            </Row>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ paper: { backgroundColor: "#fff", borderRadius: 8, padding: 18, borderWidth: 1, borderColor: t.colors.border } });
