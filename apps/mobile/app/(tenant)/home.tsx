import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { loadTenantHome, type TenantHomeResponse } from "@/lib/platform-api";
import { useSession } from "@/lib/session";
import { Button, Card, ErrorState, KeyValue, Row, Screen, SkeletonList, Text, t } from "@/ui";

function rupees(value: string) {
  return `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function TenantHomeScreen() {
  const router = useRouter();
  const sessionKind = useSession((state) => state.sessionKind);
  const tenantUser = useSession((state) => state.tenantUser);
  const tenants = useSession((state) => state.tenants);
  const activeTenantPublicId = useSession((state) => state.activeTenantPublicId);
  const logout = useSession((state) => state.logout);
  const activeTenant = tenants.find((tenant) => tenant.publicId === activeTenantPublicId);
  const [home, setHome] = useState<TenantHomeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeTenantPublicId) return;
    setLoading(true);
    setError(null);
    try {
      setHome(await loadTenantHome(activeTenantPublicId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The business account could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [activeTenantPublicId]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (sessionKind !== "tenant" || !tenantUser) return <Redirect href="/" />;
  if (!activeTenant) return <Redirect href="/(auth)/select-tenant" />;

  return (
    <Screen refreshing={loading && !!home} onRefresh={() => { void refresh(); }}>
      <Row between style={{ marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <Text variant="small" tone="muted">Signed in as {tenantUser.fullName}</Text>
          <Text variant="title" style={{ marginTop: 2 }}>{activeTenant.displayName}</Text>
        </View>
        <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: t.colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="storefront" size={24} color={t.colors.primary} />
        </View>
      </Row>

      {loading && !home ? <View style={{ marginTop: 24 }}><SkeletonList count={3} /></View> : null}
      {error && !home ? <ErrorState message={error} onRetry={() => { void refresh(); }} /> : null}
      {home ? (
        <>
          <Card tone="alt" style={{ marginTop: 24 }}>
            <Row gap={12} center={false}>
              <Ionicons name="business" size={24} color={t.colors.primary} />
              <View style={{ flex: 1 }}>
                <Text variant="h3">Served by {home.agency.displayName}</Text>
                <Text variant="small" tone="muted" style={{ marginTop: 4 }}>GSTIN {home.tenant.gstin}</Text>
              </View>
            </Row>
          </Card>

          {home.credit ? (
            <Card style={{ marginTop: 14 }}>
              <Text variant="label" tone="muted">Available credit</Text>
              <Text variant="title" style={{ marginTop: 5 }}>{rupees(home.credit.available)}</Text>
              <KeyValue k="Approved limit" v={rupees(home.credit.limit)} />
              <KeyValue k="Net terms" v={`${home.credit.netTermDays} days`} />
              {home.credit.overdue ? <Text variant="small" tone="danger">Credit ordering is paused because an invoice is overdue.</Text> : null}
            </Card>
          ) : null}

          <Text variant="h3" style={{ marginTop: 24, marginBottom: 10 }}>Outlet stock</Text>
          <View style={{ gap: 10 }}>
            {home.outlets.map((outlet) => (
              <Card key={outlet.publicId}>
                <Text variant="h3">{outlet.label}</Text>
                <Text variant="small" tone="muted" style={{ marginTop: 3 }}>{outlet.address}</Text>
                <Row style={{ marginTop: 14 }} between>
                  <View><Text variant="label" tone="muted">In use</Text><Text variant="h2">{outlet.stock.inUse}</Text></View>
                  <View><Text variant="label" tone="muted">Full spare</Text><Text variant="h2">{outlet.stock.spareFull}</Text></View>
                  <View><Text variant="label" tone="muted">Empty</Text><Text variant="h2">{outlet.stock.empty}</Text></View>
                </Row>
              </Card>
            ))}
          </View>

          <Text variant="h3" style={{ marginTop: 24, marginBottom: 10 }}>Your cylinder prices</Text>
          <View style={{ gap: 10 }}>
            {home.catalog.map((item) => (
              <Card key={item.cylinderTypeCode}>
                <Row between>
                  <View style={{ flex: 1 }}>
                    <Text variant="h3">{item.displayName}</Text>
                    <Text variant="small" tone="muted">{item.negotiatedUnitPrice ? "Negotiated account price" : "Agency price"}</Text>
                  </View>
                  <Text variant="h2" tone="primary">{rupees(item.negotiatedUnitPrice ?? item.baseUnitPrice)}</Text>
                </Row>
              </Card>
            ))}
          </View>

          <Button title="Place an order" icon="cart" style={{ marginTop: 22 }} disabled={!home.catalog.length || !home.outlets.length || !home.paymentMethods.length} onPress={() => router.push("/(tenant)/order")} />
        </>
      ) : null}

      <View style={{ gap: 10, marginTop: 24 }}>
        {tenants.length > 1 ? <Button title="Switch business" variant="secondary" icon="swap-horizontal" onPress={() => router.push("/(auth)/select-tenant")} /> : null}
        <Button title="Sign out" variant="ghost" icon="log-out-outline" onPress={() => { void logout().finally(() => router.replace("/")); }} />
      </View>
    </Screen>
  );
}
