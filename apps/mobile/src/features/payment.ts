import type { PaymentMethod } from "@gassetu/shared";
import { useState } from "react";
import { toast } from "@/components/Toast";
import { mockRazorpay } from "@/lib/providers";
import { useBookingAction, useCheckout, type ExpandedBooking } from "./hooks";

export type PayOutcome = { kind: "paid"; booking: ExpandedBooking } | { kind: "failed"; booking: ExpandedBooking } | { kind: "cancelled"; booking: ExpandedBooking };

/** Shared mock-gateway flow: create order → open checkout sheet → record result on the server. */
export function usePayFlow() {
  const checkout = useCheckout();
  const action = useBookingAction();
  const [busy, setBusy] = useState(false);

  const pay = async (booking: ExpandedBooking, method: PaymentMethod): Promise<PayOutcome> => {
    setBusy(true);
    try {
      let b = booking;
      if (b.status === "PAYMENT_FAILED") b = await action.mutateAsync({ id: b.id, action: "retry-payment" });
      const order = await mockRazorpay.createOrder(b.id, b.charges.total);
      const result = await mockRazorpay.checkout(order, method === "cod" || method === "credit" ? "upi" : method);
      if (result.ok) {
        const paid = await checkout.mutateAsync({ bookingId: b.id, ok: true, paymentId: result.razorpay_payment_id, method: result.method });
        return paid.status === "PLACED" ? { kind: "paid", booking: paid } : { kind: "failed", booking: paid };
      }
      if (result.error.code === "CANCELLED") {
        toast.info("Payment cancelled", "Your booking is saved. Retry or choose cash on delivery.");
        return { kind: "cancelled", booking: b };
      }
      const f = await checkout.mutateAsync({ bookingId: b.id, ok: false, method: method === "cod" || method === "credit" ? "upi" : method, error: result.error.description });
      return { kind: "failed", booking: f };
    } finally {
      setBusy(false);
    }
  };

  const switchPayment = async (booking: ExpandedBooking, method: "cod" | "credit") => {
    setBusy(true);
    try {
      return await action.mutateAsync({ id: booking.id, action: "switch-payment", body: { method } });
    } finally {
      setBusy(false);
    }
  };

  return { pay, switchPayment, busy };
}
