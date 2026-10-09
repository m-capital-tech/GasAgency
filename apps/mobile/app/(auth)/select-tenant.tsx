import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { View } from "react-native";
import { useSession } from "@/lib/session";
import { Button, Card, Row, Screen, Text, t } from "@/ui";

export default function SelectTenantScreen() {
  const router = useRouter();
  const sessionKind = useSession((state) => state.sessionKind);
  const tenantUser = useSession((state) => state.tenantUser);
  const tenants = useSession((state) => state.tenants);
  const selectTenant = useSession((state) => state.selectTenant);
  const logout = useSession((state) => state.logout);

  if (sessionKind !== "tenant" || !tenantUser) return <Redirect href="/" />;

  const choose = (tenantPublicId: string) => {
    selectTenant(tenantPublicId);
    router.replace("/(tenant)/home");
  };

  return (
    <Screen>
      <Text variant="title" style={{ marginTop: 12 }}>Choose a business</Text>
      <Text variant="body" tone="muted" style={{ marginTop: 6, marginBottom: 24 }}>
        {tenantUser.fullName}, select the restaurant, hotel, or commercial account you want to use.
      </Text>
      <View style={{ gap: 12 }}>
        {tenants.map((tenant) => (
          <Card key={tenant.publicId} onPress={() => choose(tenant.publicId)}>
            <Row gap={14}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: t.colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
                <Ionicons name="storefront-outline" size={22} color={t.colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="h3">{tenant.displayName}</Text>
                <Text variant="small" tone="muted">{tenant.membershipType.replaceAll("_", " ")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={t.colors.inkMuted} />
            </Row>
          </Card>
        ))}
        {tenants.length === 0 ? (
          <Card tone="alt">
            <Text variant="h3">No active business access</Text>
            <Text variant="small" tone="muted" style={{ marginTop: 6 }}>Ask your platform administrator to activate your tenant membership.</Text>
          </Card>
        ) : null}
      </View>
      <Button
        title="Sign out"
        variant="ghost"
        style={{ marginTop: 24 }}
        onPress={() => { void logout().finally(() => router.replace("/")); }}
      />
    </Screen>
  );
}
