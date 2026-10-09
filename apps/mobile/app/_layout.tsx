import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { DemoFab } from "@/components/DemoFab";
import { RazorpaySheet } from "@/components/RazorpaySheet";
import { ToastHost, toast } from "@/components/Toast";
import { useLiveSync } from "@/features/hooks";
import { useLive } from "@/lib/live";
import { localNotifications } from "@/lib/providers";
import { queryClient } from "@/lib/query";
import { useSession } from "@/lib/session";
import { t } from "@/ui";

SplashScreen.preventAutoHideAsync().catch(() => {});

function DemoLiveBridge() {
  useLiveSync();
  const user = useSession((s) => s.user);
  const router = useRouter();
  useEffect(() => {
    localNotifications.requestPermission().catch(() => {});
  }, []);
  // push-style in-app banner at each status change (PRD §5.3)
  useLive(
    (e) => {
      if (e.type === "notification" && user && e.notification.userId === user.id) {
        const n = e.notification;
        toast.status(n.title, n.body, () => {
          if (n.bookingId) router.push(user.role === "delivery" ? `/drop/${n.bookingId}` : `/order/${n.bookingId}`);
        });
        localNotifications.notify(n.title, n.body, { bookingId: n.bookingId }).catch(() => {});
      }
      if (e.type === "demo.reset") toast.info("Demo data reset", "Seed data restored.");
    },
    [user?.id],
  );
  return null;
}

export default function RootLayout() {
  const hydrated = useSession((s) => s.hydrated);
  const user = useSession((s) => s.user);
  const sessionKind = useSession((s) => s.sessionKind);
  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);
  if (!hydrated) return <View style={{ flex: 1, backgroundColor: t.colors.primary }} />;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AppErrorBoundary onReset={() => queryClient.clear()}>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.bg }, animation: "slide_from_right" }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)/login" />
            <Stack.Screen name="(auth)/select-tenant" />
            <Stack.Screen name="(tenant)/home" />
            <Stack.Screen name="(tenant)/order" />
            <Stack.Screen name="(onboarding)/profile" />
            <Stack.Screen name="(onboarding)/connection" />
            <Stack.Screen name="(business)" />
            <Stack.Screen name="(delivery)" />
            <Stack.Screen name="book/cylinder" />
            <Stack.Screen name="book/slot" />
            <Stack.Screen name="book/review" />
            <Stack.Screen name="book/success" options={{ animation: "fade", gestureEnabled: false }} />
            <Stack.Screen name="order/[id]" />
            <Stack.Screen name="order/invoice" options={{ presentation: "modal" }} />
            <Stack.Screen name="standing-orders" />
            <Stack.Screen name="statement/[month]" options={{ presentation: "modal" }} />
            <Stack.Screen name="support" />
            <Stack.Screen name="agency" />
            <Stack.Screen name="outlets" />
            <Stack.Screen name="drop/[id]" />
            <Stack.Screen name="drop/complete" options={{ presentation: "modal" }} />
            <Stack.Screen name="drop/fail" options={{ presentation: "modal" }} />
          </Stack>
          {sessionKind === "demo" ? <DemoLiveBridge /> : null}
          <ToastHost />
          <RazorpaySheet />
          {user && sessionKind === "demo" ? <DemoFab /> : null}
          </AppErrorBoundary>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
