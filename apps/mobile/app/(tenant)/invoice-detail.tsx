import { Redirect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { TenantInvoiceStatusBadge } from "@/components/TenantStatusBadge";
import { loadTenantInvoice, type TenantInvoiceDetail } from "@/lib/platform-api";
import { useSession } from "@/lib/session";
import { Card, Divider, ErrorState, KeyValue, Row, Screen, SkeletonCard, Text, t } from "@/ui";

function rupees(value: string) {
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function date(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export default function TenantInvoiceDetailScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const sessionKind = useSession((state) => state.sessionKind);
  const tenantPublicId = useSession((state) => state.activeTenantPublicId);
  const [invoice, setInvoice] = useState<TenantInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantPublicId || !id) return;
    setLoading(true);
    setError(null);
    try {
      setInvoice((await loadTenantInvoice(tenantPublicId, id)).invoice);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The invoice could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [id, tenantPublicId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (sessionKind !== "tenant") return <Redirect href="/" />;
  if (!tenantPublicId) return <Redirect href="/(auth)/select-tenant" />;

  return (
    <Screen title="Tax invoice" subtitle={invoice?.invoiceNumber} back bg={t.colors.surfaceAlt} refreshing={loading} onRefresh={() => { void refresh(); }}>
      {loading && !invoice ? <SkeletonCard lines={10} /> : null}
      {error && !invoice ? <ErrorState message={error} onRetry={() => { void refresh(); }} /> : null}
      {invoice ? (
        <Card style={{ borderRadius: 10, padding: 18 }}>
          <Row between center={false}>
            <View style={{ flex: 1 }}>
              <Text variant="h2">TAX INVOICE</Text>
              <Text variant="caption" tone="muted">{invoice.invoiceNumber} · {date(invoice.issuedAt)}</Text>
              {invoice.dueAt ? <Text variant="caption" tone={invoice.status === "overdue" ? "danger" : "muted"}>Due {date(invoice.dueAt)}</Text> : null}
            </View>
            <TenantInvoiceStatusBadge status={invoice.status} />
          </Row>

          <Divider />
          <Text variant="label" tone="faint">Supplier</Text>
          <Text variant="bodyStrong">{invoice.agency.displayName}</Text>
          <Text variant="small" tone="muted">{invoice.agency.city}, {invoice.agency.stateCode}</Text>
          <Text variant="small" tone="muted">GSTIN {invoice.agency.gstin}</Text>

          <Divider />
          <Text variant="label" tone="faint">Bill to</Text>
          <Text variant="bodyStrong">{invoice.tenant.legalName}</Text>
          <Text variant="small" tone="muted">{invoice.tenant.outletLabel} · {[invoice.tenant.addressLine1, invoice.tenant.addressLine2, invoice.tenant.city, invoice.tenant.stateCode, invoice.tenant.pincode].filter(Boolean).join(", ")}</Text>
          <Text variant="small" tone="muted">GSTIN {invoice.tenant.gstin}</Text>

          <Divider />
          <Row between style={{ marginBottom: 7 }}>
            <Text variant="label" tone="faint">Description</Text>
            <Text variant="label" tone="faint">Amount</Text>
          </Row>
          {invoice.items.map((item) => <KeyValue key={item.cylinderTypeCode} k={`${item.quantity} × ${item.displayName} @ ${rupees(item.unitPrice)}`} v={rupees(item.lineSubtotal)} />)}
          <KeyValue k="Taxable value" v={rupees(invoice.taxableAmount)} />
          <KeyValue k="GST" v={rupees(invoice.gstAmount)} />
          <Divider />
          <KeyValue k="Grand total" v={rupees(invoice.totalAmount)} strong />
          <KeyValue k="Outstanding" v={rupees(invoice.outstandingAmount)} tone={invoice.status === "overdue" ? "danger" : "ink"} />
          {invoice.payments.length ? (
            <>
              <Divider />
              <Text variant="label" tone="faint">Payments received</Text>
              {invoice.payments.map((payment) => (
                <KeyValue
                  key={payment.publicId}
                  k={`${date(payment.receivedAt)} · ${payment.paymentMethod.replace("_", " ")}${payment.reference ? ` · ${payment.reference}` : ""}`}
                  v={rupees(payment.amount)}
                />
              ))}
            </>
          ) : null}
          <Text variant="caption" tone="faint" style={{ marginTop: 16 }}>Invoice data is issued by the serving agency and stored against order {invoice.order.orderNumber}.</Text>
        </Card>
      ) : null}
    </Screen>
  );
}
