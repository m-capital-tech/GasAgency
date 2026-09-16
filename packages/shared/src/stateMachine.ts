import type { BookingStatus } from "./types";

// PRD §7 — allowed transitions
export const TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING_PAYMENT: ["PLACED", "PAYMENT_FAILED", "CANCELLED"],
  PAYMENT_FAILED: ["PENDING_PAYMENT", "PLACED", "CANCELLED"], // retry online, or COD fallback
  PLACED: ["ACCEPTED", "REJECTED", "CANCELLED"],
  ACCEPTED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["OUT_FOR_DELIVERY", "ACCEPTED", "CANCELLED"], // ACCEPTED = unassign
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["ACCEPTED", "CANCELLED"], // reschedule
  DELIVERED: [],
  REJECTED: [],
  CANCELLED: [],
};

export const TERMINAL_STATUSES: BookingStatus[] = ["DELIVERED", "REJECTED", "CANCELLED"];
export const OPEN_STATUSES: BookingStatus[] = [
  "PENDING_PAYMENT",
  "PLACED",
  "ACCEPTED",
  "ASSIGNED",
  "OUT_FOR_DELIVERY",
  "DELIVERY_FAILED",
];

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition ${from} → ${to}`);
  }
}

/** The "happy path" next status used by the demo "Advance order" control. */
export function nextHappyStatus(status: BookingStatus): BookingStatus | null {
  switch (status) {
    case "PENDING_PAYMENT":
      return "PLACED";
    case "PAYMENT_FAILED":
      return "PLACED";
    case "PLACED":
      return "ACCEPTED";
    case "ACCEPTED":
      return "ASSIGNED";
    case "ASSIGNED":
      return "OUT_FOR_DELIVERY";
    case "OUT_FOR_DELIVERY":
      return "DELIVERED";
    case "DELIVERY_FAILED":
      return "ACCEPTED";
    default:
      return null;
  }
}

export function isOpen(status: BookingStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

export function canCancel(status: BookingStatus): boolean {
  return ["PENDING_PAYMENT", "PAYMENT_FAILED", "PLACED", "ACCEPTED", "ASSIGNED", "DELIVERY_FAILED"].includes(status);
}

export const STATUS_LABELS: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "Payment pending",
  PAYMENT_FAILED: "Payment failed",
  PLACED: "Placed",
  ACCEPTED: "Accepted",
  ASSIGNED: "Assigned",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  DELIVERY_FAILED: "Delivery failed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

/** Ordered steps shown on the customer timeline. */
export const TIMELINE_STEPS: BookingStatus[] = ["PLACED", "ACCEPTED", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"];
