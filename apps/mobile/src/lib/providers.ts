// Mock providers (PRD §0.4). Swap these for real implementations without touching screens.
import type { AuthProvider, LocationProvider, NotificationProvider, PaymentOrder, PaymentProvider, PaymentResult } from "@gassetu/shared";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { post } from "./api";
import { configureNotificationPresentation } from "./push-notifications";

export const mockAuth: AuthProvider = {
  name: "MockOtpProvider",
  requestOtp: (phone) => post("/auth/otp", { phone }),
  verifyOtp: async (phone, otp) => {
    const r = await post("/auth/verify", { phone, otp });
    return { ok: true, token: r.token, userId: r.user.id };
  },
};

/**
 * MockRazorpayProvider — createOrder hits the mock server; `checkout` is fulfilled by the
 * in-app checkout sheet (see components/RazorpaySheet) which resolves the pending promise.
 * To go live: server creates a real Order, client opens Razorpay Checkout, server verifies signature.
 */
let pendingResolve: ((r: PaymentResult) => void) | null = null;
let openSheet: ((order: PaymentOrder, prefer?: string) => void) | null = null;
export function registerCheckoutSheet(fn: typeof openSheet) {
  openSheet = fn;
}
export function resolveCheckout(r: PaymentResult) {
  pendingResolve?.(r);
  pendingResolve = null;
}
export const mockRazorpay: PaymentProvider = {
  name: "MockRazorpayProvider",
  createOrder: (bookingId, amount) => post("/payments/mock/order", { bookingId, amount }),
  checkout: (order, prefer) =>
    new Promise<PaymentResult>((resolve) => {
      pendingResolve = resolve;
      openSheet?.(order, prefer);
    }),
};

export const mockLocation: LocationProvider = {
  name: "MockLocationProvider",
  getCurrentPosition: async () => ({ lat: 17.3961, lng: 78.5211 }), // Amberpet, Hyderabad
  watchPosition: (cb) => {
    cb({ lat: 17.3961, lng: 78.5211 });
    return () => {};
  },
};

let notifReady = false;
export const localNotifications: NotificationProvider = {
  name: "ExpoLocalNotificationProvider",
  requestPermission: async () => {
    if (Platform.OS === "web") return false;
    try {
      configureNotificationPresentation();
      const r = await Notifications.requestPermissionsAsync();
      notifReady = r.granted;
      return notifReady;
    } catch {
      return false;
    }
  },
  notify: async (title, body, data) => {
    if (!notifReady) return;
    try {
      await Notifications.scheduleNotificationAsync({ content: { title, body, data }, trigger: null });
    } catch {
      /* ignore in Expo Go */
    }
  },
};
