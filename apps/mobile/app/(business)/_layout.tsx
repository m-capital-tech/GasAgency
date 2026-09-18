import { Redirect, Tabs } from "expo-router";
import { TabBar } from "@/components/TabBar";
import { useNotifications } from "@/features/hooks";
import { useSession } from "@/lib/session";

export default function BusinessTabs() {
  const user = useSession((s) => s.user);
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;
  if (!user) return <Redirect href="/" />;
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
