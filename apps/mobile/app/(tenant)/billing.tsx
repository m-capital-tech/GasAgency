import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { TenantInvoiceStatusBadge } from "@/components/TenantStatusBadge";
import { loadTenantBilling, type TenantBillingResponse, type TenantInvoiceStatus } from "@/lib/platform-api";
import { useSession } from "@/lib/session";
import { Button, Card, Chip, EmptyState, ErrorState, KeyValue, Row, Screen, SkeletonList, Text } from "@/ui";

type Filter = "all" | TenantInvoiceStatus;

function rupees(value: string) {
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function TenantBillingScreen() {
  const router = useRouter();
  const sessionKind = useSession((state) => state.sessionKind);
  const tenantPublicId = useSession((state) => state.activeTenantPublicId);
  const [billing, setBilling] = useState<TenantBillingResponse | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantPublicId) return;
    setLoading(true);
    setError(null);
    try {
      setBilling(await loadTenantBilling(tenantPublicId, { limit: 50 }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Billing could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [tenantPublicId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const loadMore = async () => {
    if (!tenantPublicId || !billing?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError(null);
    try {
      const next = await loadTenantBilling(tenantPublicId, { limit: 50, cursor: billing.nextCursor });
      setBilling({ ...next, invoices: [...billing.invoices, ...next.invoices] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "More invoices could not be loaded.");
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = useMemo(() => billing?.invoices.filter((invoice) => filter === "all" || invoice.status === filter) ?? [], [billing?.invoices, filter]);

  if (sessionKind !== "tenant") return <Redirect href="/" />;
  if (!tenantPublicId) return <Redirect href="/(auth)/select-tenant" />;

  return (
    <Screen title="Billing" subtitle={billing ? `GSTIN ${billing.tenant.gstin}` : "Invoices and account position"} tabBar refreshing={loading} onRefresh={() => { void refresh(); }}>
      {loading && !billing ? <SkeletonList count={4} /> : null}
      {error && !billing ? <ErrorState message={error} onRetry={() => { void refresh(); }} /> : null}
      {billing ? (
        <View style={{ gap: 12 }}>
          <Card tone={Number(billing.summary.overdueAmount) > 0 ? "soft" : "surface"}>
            <Text variant="label" tone="muted">Outstanding invoices</Text>
            <Text variant="title" tone={Number(billing.summary.overdueAmount) > 0 ? "danger" : "ink"} style={{ marginTop: 4 }}>{rupees(billing.summary.outstandingAmount)}</Text>
            <Row between style={{ marginTop: 12 }}>
              <View>
                <Text variant="caption" tone="muted">Overdue</Text>
                <Text variant="h3" tone={Number(billing.summary.overdueAmount) > 0 ? "danger" : "ink"}>{rupees(billing.summary.overdueAmount)}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text variant="caption" tone="muted">Paid in last 30 days</Text>
                <Text variant="h3">{rupees(billing.summary.paidLast30Days)}</Text>
              </View>
            </Row>
          </Card>

          {billing.account.credit ? (
            <Card tone="alt">
              <Text variant="h3">Credit account</Text>
              <KeyValue k="Available" v={rupees(billing.account.credit.available)} strong tone="primary" />
              <KeyValue k="Approved limit" v={rupees(billing.account.credit.limit)} />
              <KeyValue k="Used" v={rupees(billing.account.credit.used)} />
              <KeyValue k="Net terms" v={`${billing.account.credit.netTermDays} days`} />
              <KeyValue k="Status" v={billing.account.credit.status} />
            </Card>
          ) : (
            <Card tone="alt">
              <Text variant="bodyStrong">Pay-per-order account</Text>
              <Text variant="small" tone="muted" style={{ marginTop: 4 }}>Your account does not currently have approved credit terms.</Text>
            </Card>
          )}

          <Row gap={8} style={{ flexWrap: "wrap" }}>
            <Chip label="All" active={filter === "all"} onPress={() => setFilter("all")} />
            <Chip label="Open" active={filter === "open"} onPress={() => setFilter("open")} />
            <Chip label="Overdue" active={filter === "overdue"} onPress={() => setFilter("overdue")} />
            <Chip label="Paid" active={filter === "paid"} onPress={() => setFilter("paid")} />
          </Row>

          {!visible.length ? (
            <EmptyState icon="document-text-outline" title="No invoices" body={filter === "all" ? "Invoices are issued after completed deliveries." : `There are no ${filter} invoices.`} />
          ) : (
            <View style={{ gap: 10 }}>
              {visible.map((invoice) => (
                <Card key={invoice.publicId} onPress={() => router.push({ pathname: "/(tenant)/invoice-detail", params: { id: invoice.publicId } })}>
                  <Row between center={false}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{invoice.invoiceNumber}</Text>
                      <Text variant="caption" tone="muted" style={{ marginTop: 3 }}>{invoice.order.orderNumber} · {invoice.outletLabel}</Text>
                      <Text variant="caption" tone={invoice.status === "overdue" ? "danger" : "faint"} style={{ marginTop: 3 }}>
                        Issued {shortDate(invoice.issuedAt)}{invoice.dueAt ? ` · Due ${shortDate(invoice.dueAt)}` : ""}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 7 }}>
                      <Text variant="bodyStrong">{rupees(invoice.totalAmount)}</Text>
                      <TenantInvoiceStatusBadge status={invoice.status} />
                    </View>
                  </Row>
                </Card>
              ))}
            </View>
          )}
          {error ? <Text variant="small" tone="danger">{error}</Text> : null}
          {billing.nextCursor ? <Button title="Load more invoices" variant="secondary" loading={loadingMore} onPress={() => { void loadMore(); }} /> : null}
        </View>
      ) : null}
    </Screen>
  );
}
