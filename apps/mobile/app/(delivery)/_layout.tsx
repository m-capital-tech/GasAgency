import { Redirect, Tabs } from "expo-router";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { useSession } from "@/lib/session";

export default function DeliveryTabs() {
  const user = useSession((s) => s.user);
  if (!user) return <Redirect href="/" />;
  return (
    <Tabs tabBar={(p) => <FloatingTabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "#F4F5F7" } }}>
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="drops" options={{ title: "Drops" }} />
      <Tabs.Screen name="summary" options={{ title: "Summary" }} />
    </Tabs>
  );
}
