import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";
import { PUSH_REGISTRATION_ENABLED } from "@/lib/config";
import { registerPlatformPushToken } from "@/lib/platform-api";
import {
  configureNotificationPresentation,
  initializeNotificationRuntime,
  Notifications,
  registerForRemotePushNotifications,
} from "@/lib/push-notifications";
import { useSession } from "@/lib/session";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const demoIdPattern = /^[A-Za-z0-9_-]{1,100}$/;

// Expo recommends installing the foreground handler before the first notification arrives.
configureNotificationPresentation();

function dataString(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Owns notification runtime setup, trusted response routing, and push-token registration. */
export function NotificationBridge() {
  const router = useRouter();
  const sessionKind = useSession((state) => state.sessionKind);
  const user = useSession((state) => state.user);
  const tenantUser = useSession((state) => state.tenantUser);
  const tenants = useSession((state) => state.tenants);
  const activeTenantPublicId = useSession((state) => state.activeTenantPublicId);
  const selectTenant = useSession((state) => state.selectTenant);
  const registeredUserRef = useRef<string | null>(null);

  const routeNotificationResponse = useCallback(
    (response: Notifications.NotificationResponse): boolean => {
      const data = response.notification.request.content.data ?? {};

      if (sessionKind === "tenant") {
        const tenantPublicId = dataString(data, "tenantPublicId") ?? activeTenantPublicId;
        if (!tenantPublicId || !uuidPattern.test(tenantPublicId)) return false;
        if (!tenants.some((tenant) => tenant.publicId === tenantPublicId)) return false;

        const orderPublicId = dataString(data, "orderPublicId");
        const invoicePublicId = dataString(data, "invoicePublicId");
        if (orderPublicId && uuidPattern.test(orderPublicId)) {
          if (tenantPublicId !== activeTenantPublicId) selectTenant(tenantPublicId);
          router.push({ pathname: "/(tenant)/order-detail", params: { id: orderPublicId } });
          return true;
        }
        if (invoicePublicId && uuidPattern.test(invoicePublicId)) {
          if (tenantPublicId !== activeTenantPublicId) selectTenant(tenantPublicId);
          router.push({ pathname: "/(tenant)/invoice-detail", params: { id: invoicePublicId } });
          return true;
        }
        const route = dataString(data, "route");
        if (route === "billing") {
          if (tenantPublicId !== activeTenantPublicId) selectTenant(tenantPublicId);
          router.push("/(tenant)/billing");
          return true;
        }
        if (route === "support") {
          if (tenantPublicId !== activeTenantPublicId) selectTenant(tenantPublicId);
          router.push("/(tenant)/support");
          return true;
        }
        if (route === "order") {
          if (tenantPublicId !== activeTenantPublicId) selectTenant(tenantPublicId);
          router.push("/(tenant)/order");
          return true;
        }
        return false;
      }

      if (sessionKind === "demo" && user) {
        const bookingId = dataString(data, "bookingId");
        if (!bookingId || !demoIdPattern.test(bookingId)) return false;
        router.push(user.role === "delivery" ? `/drop/${bookingId}` : `/order/${bookingId}`);
        return true;
      }

      return false;
    },
    [activeTenantPublicId, router, selectTenant, sessionKind, tenants, user],
  );

  useEffect(() => {
    void initializeNotificationRuntime().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;

    const consume = (response: Notifications.NotificationResponse | null) => {
      if (response && routeNotificationResponse(response)) {
        try {
          Notifications.clearLastNotificationResponse();
        } catch {
          // A missing native method must not block app navigation.
        }
      }
    };

    consume(Notifications.getLastNotificationResponse());
    const subscription = Notifications.addNotificationResponseReceivedListener(consume);
    return () => subscription.remove();
  }, [routeNotificationResponse]);

  useEffect(() => {
    if (sessionKind !== "tenant" || !tenantUser) {
      registeredUserRef.current = null;
      return;
    }
    if (!PUSH_REGISTRATION_ENABLED || registeredUserRef.current === tenantUser.publicId) return;

    registeredUserRef.current = tenantUser.publicId;
    void registerForRemotePushNotifications(registerPlatformPushToken);
  }, [sessionKind, tenantUser]);

  return null;
}
