import { Redirect, Tabs } from "expo-router";
import { FloatingTabBar } from "@/components/FloatingTabBar";
import { useNotifications } from "@/features/hooks";
import { useSession } from "@/lib/session";

export default function CustomerTabs() {
  const user = useSession((s) => s.user);
  const notifications = useNotifications();
  const unread = (notifications.data ?? []).filter((n) => !n.read).length;
  if (!user) return <Redirect href="/" />;
  return (
    <Tabs tabBar={(p) => <FloatingTabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: "#F4F5F7" } }}>
      <Tabs.Screen name="home" options={{ title: "Home" }} />
      <Tabs.Screen name="orders" options={{ title: "Orders" }} />
      <Tabs.Screen name="notifications" options={{ title: "Notifications", tabBarBadge: unread ? unread : undefined }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
