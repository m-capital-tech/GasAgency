import { Redirect, Tabs } from "expo-router";
import { TabBar } from "@/components/TabBar";
import { useNotifications } from "@/features/hooks";
import { useSession } from "@/lib/session";

export default function BusinessTabs() {
  const user = useSession((s) => s.user);
  const sessionKind = useSession((s) => s.sessionKind);
  if (!user) return <Redirect href="/" />;
  if (sessionKind === "tenant") return <Redirect href="/(tenant)/home" />;
  return <DemoBusinessTabs />;
}

function DemoBusinessTabs() {
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "#E9E3D6" } }}>
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="billing" options={{ title: "Billing" }} />
      <Tabs.Screen name="notifications" options={{ title: "Alerts", tabBarBadge: unread ? unread : undefined }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
