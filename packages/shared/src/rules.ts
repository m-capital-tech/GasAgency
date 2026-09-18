import { isOpen } from "./stateMachine";
import type { Booking, Business, CylinderType, Outlet, PlatformConfig } from "./types";

export interface RuleViolation {
  code: "QTY_CAP" | "CREDIT_LIMIT" | "CREDIT_NOT_APPROVED" | "CREDIT_OVERDUE" | "AGENCY_UNAVAILABLE" | "BUSINESS_SUSPENDED";
  message: string;
}

const DAY = 86_400_000;

export function daysBetween(a: string | Date, b: string | Date): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY);
}

/** Outstanding credit for a business = unpaid credit invoices. */
export function creditOutstanding(bookings: Booking[], businessId: string): number {
  return bookings
    .filter((b) => b.businessId === businessId && b.payment.method === "credit" && ["CREDIT_DUE", "CREDIT_OVERDUE"].includes(b.payment.status) && b.status !== "CANCELLED" && b.status !== "REJECTED")
    .reduce((s, b) => s + b.charges.total, 0);
}

export function hasOverdue(bookings: Booking[], businessId: string, now: Date = new Date()): boolean {
  return bookings.some((b) => b.businessId === businessId && b.payment.method === "credit" && b.payment.status !== "CREDIT_PAID" && b.payment.dueAt && new Date(b.payment.dueAt) < now && !["CANCELLED", "REJECTED"].includes(b.status));
}

/** B2B order checks: quantity cap, credit approval / limit / overdue. */
export function checkOrderRules(
  business: Business,
  bookings: Booking[],
  items: { cylinderTypeId: string; qty: number }[],
  total: number,
  paymentMethod: string,
  config: PlatformConfig,
  now: Date = new Date(),
): RuleViolation | null {
  if (business.status === "suspended") return { code: "BUSINESS_SUSPENDED", message: "This account is suspended. Please contact GasSetu support." };
  const qty = items.reduce((s, i) => s + i.qty, 0);
  if (qty > config.maxCylindersPerOrder) {
    return { code: "QTY_CAP", message: `Orders are limited to ${config.maxCylindersPerOrder} cylinders. For bulk supply, place a second order or call your agency.` };
  }
  if (paymentMethod === "credit") {
    if (business.credit.status !== "approved") {
      return { code: "CREDIT_NOT_APPROVED", message: business.credit.status === "requested" ? "Your credit account is awaiting approval. Pay online or cash for now." : "Credit is not enabled on this account. Pay online or cash, or request credit from your profile." };
    }
    if (hasOverdue(bookings, business.userId, now)) {
      return { code: "CREDIT_OVERDUE", message: "You have an overdue invoice. Clear it to keep ordering on credit, or pay for this order online." };
    }
    const outstanding = creditOutstanding(bookings, business.userId);
    if (outstanding + total > business.credit.limit) {
      return {
        code: "CREDIT_LIMIT",
        message: `This order would take your credit to ₹${Math.round(outstanding + total).toLocaleString("en-IN")} against a limit of ₹${business.credit.limit.toLocaleString("en-IN")}. Pay online for this one, or ask your agency to raise the limit.`,
      };
    }
  }
  return null;
}

/** Days of stock left at an outlet from spare cylinders and consumption rate. */
export function stockDaysLeft(outlet: Outlet): number {
  const perDay = outlet.cylindersPerWeek / 7;
  if (perDay <= 0) return 99;
  // a cylinder in use counts as roughly half full on average
  return Math.max(0, Math.round((outlet.spareFull + outlet.inUse * 0.5) / perDay));
}

/** Estimate consumption (cylinders / week) from delivered orders to an outlet over the last 8 weeks. */
export function estimateCylindersPerWeek(deliveredToOutlet: Booking[], fallback: number, now: Date = new Date()): number {
  const since = now.getTime() - 56 * DAY;
  const recent = deliveredToOutlet.filter((b) => b.status === "DELIVERED" && new Date(b.deliveredAt ?? b.createdAt).getTime() >= since);
  if (recent.length < 2) return fallback;
  const cyl = recent.reduce((s, b) => s + b.items.reduce((x, i) => x + i.qty, 0), 0);
  const first = Math.min(...recent.map((b) => new Date(b.deliveredAt ?? b.createdAt).getTime()));
  const weeks = Math.max(1, (now.getTime() - first) / (7 * DAY));
  return Math.round((cyl / weeks) * 10) / 10;
}

export function nextRunFor(days: number[], from: Date = new Date()): Date | null {
  if (!days.length) return null;
  for (let i = 1; i <= 7; i++) {
    const d = new Date(from.getTime() + i * DAY);
    if (days.includes(d.getDay())) {
      d.setHours(7, 0, 0, 0);
      return d;
    }
  }
  return null;
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export { isOpen };

export function cylinderLabel(t: CylinderType): string {
  return `${t.weightKg} kg`;
}
