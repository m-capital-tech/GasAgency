// Provider interfaces (PRD §0.4). Mock implementations live in the apps; real ones can be swapped in.
import type { LatLng, PaymentMethod } from "./types";

export interface PaymentOrder {
  orderId: string;
  amount: number;
  currency: "INR";
  bookingId: string;
}

export type PaymentResult =
  | { ok: true; razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string; method: PaymentMethod }
  | { ok: false; error: { code: string; description: string } };

export interface PaymentProvider {
  readonly name: string;
  createOrder(bookingId: string, amount: number): Promise<PaymentOrder>;
  /** Opens the checkout UI and resolves when the user finishes. */
  checkout(order: PaymentOrder, prefer?: PaymentMethod): Promise<PaymentResult>;
}

export interface LocationProvider {
  readonly name: string;
  getCurrentPosition(): Promise<LatLng>;
  watchPosition(cb: (p: LatLng) => void): () => void;
}

export interface AuthProvider {
  readonly name: string;
  requestOtp(phone: string): Promise<{ sent: boolean; hint?: string }>;
  verifyOtp(phone: string, otp: string): Promise<{ ok: boolean; token?: string; userId?: string }>;
}

export interface NotificationProvider {
  readonly name: string;
  requestPermission(): Promise<boolean>;
  notify(title: string, body: string, data?: Record<string, unknown>): Promise<void>;
}
