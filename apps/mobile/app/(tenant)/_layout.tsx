import { Redirect, Tabs } from "expo-router";
import { TabBar } from "@/components/TabBar";
import { useSession } from "@/lib/session";

export default function TenantTabs() {
  const sessionKind = useSession((state) => state.sessionKind);
  const activeTenantPublicId = useSession((state) => state.activeTenantPublicId);
  if (sessionKind !== "tenant") return <Redirect href="/" />;
  if (!activeTenantPublicId) return <Redirect href="/(auth)/select-tenant" />;

  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "#E9E3D6" } }}>
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="analytics" options={{ title: "Insights" }} />
      <Tabs.Screen name="billing" options={{ title: "Billing" }} />
      <Tabs.Screen name="profile" options={{ title: "Account" }} />
      <Tabs.Screen name="order" options={{ href: null }} />
      <Tabs.Screen name="order-detail" options={{ href: null }} />
      <Tabs.Screen name="invoice-detail" options={{ href: null }} />
      <Tabs.Screen name="support" options={{ href: null }} />
      <Tabs.Screen name="registration-summary" options={{ href: null }} />
    </Tabs>
  );
}
