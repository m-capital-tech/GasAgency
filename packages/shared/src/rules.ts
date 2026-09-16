import { isOpen } from "./stateMachine";
import type { Booking, Customer, CylinderType, PlatformConfig } from "./types";

export interface RuleViolation {
  code: "MIN_GAP" | "QUOTA" | "DUPLICATE_OPEN" | "QTY_CAP" | "AGENCY_UNAVAILABLE";
  message: string;
}

const DAY = 86_400_000;

export function daysBetween(a: string | Date, b: string | Date): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / DAY);
}

/** Refill rule checks (PRD §5.2 step 6). Returns the first violation, or null. */
export function checkRefillRules(
  customer: Customer,
  bookings: Booking[],
  cylinder: CylinderType,
  qty: number,
  config: PlatformConfig,
  now: Date = new Date(),
): RuleViolation | null {
  const mine = bookings.filter((b) => b.customerId === customer.userId);

  const open = mine.find((b) => isOpen(b.status));
  if (open) {
    return {
      code: "DUPLICATE_OPEN",
      message: `You already have an open booking (${open.code}). Track it or wait until it is delivered before booking again.`,
    };
  }

  if (cylinder.category === "domestic") {
    if (qty > 1) {
      return { code: "QTY_CAP", message: "Domestic bookings are limited to 1 cylinder per booking." };
    }
    const delivered = mine
      .filter((b) => b.status === "DELIVERED" && b.items.some((i) => i.cylinderTypeId === cylinder.id))
      .sort((a, b) => (b.deliveredAt ?? b.createdAt).localeCompare(a.deliveredAt ?? a.createdAt));
    const last = delivered[0];
    if (last) {
      const gap = daysBetween(last.deliveredAt ?? last.createdAt, now);
      if (gap < config.minRefillGapDays) {
        const wait = config.minRefillGapDays - gap;
        return {
          code: "MIN_GAP",
          message: `Your last refill was ${gap} day${gap === 1 ? "" : "s"} ago. Domestic refills need a ${config.minRefillGapDays}-day gap — you can book again in ${wait} day${wait === 1 ? "" : "s"}.`,
        };
      }
    }
    const yearStart = new Date(now.getFullYear(), 3, 1); // Indian FY starts 1 Apr
    if (now < yearStart) yearStart.setFullYear(yearStart.getFullYear() - 1);
    const thisYear = delivered.filter((b) => new Date(b.deliveredAt ?? b.createdAt) >= yearStart).length;
    if (thisYear >= config.yearlyDomesticQuota) {
      return {
        code: "QUOTA",
        message: `You have used all ${config.yearlyDomesticQuota} subsidised domestic cylinders for this year. Contact your agency for a non-subsidised refill.`,
      };
    }
  }
  return null;
}

/** PRD §5.6 — estimate next refill from the last 3 deliveries. */
export function estimateCycleDays(customerBookings: Booking[], defaultDays: number): number {
  const delivered = customerBookings
    .filter((b) => b.status === "DELIVERED")
    .map((b) => new Date(b.deliveredAt ?? b.createdAt).getTime())
    .sort((a, b) => b - a)
    .slice(0, 4);
  if (delivered.length < 2) return defaultDays;
  const gaps: number[] = [];
  for (let i = 0; i < delivered.length - 1; i++) gaps.push((delivered[i] - delivered[i + 1]) / DAY);
  const avg = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  return Math.max(7, Math.round(avg));
}

export function gasLeftEstimate(lastDeliveredAt: string | null, cycleDays: number, now: Date = new Date()) {
  if (!lastDeliveredAt) return { pct: 0, daysLeft: 0 };
  const used = (now.getTime() - new Date(lastDeliveredAt).getTime()) / DAY;
  const pct = Math.max(0, Math.min(100, Math.round((1 - used / cycleDays) * 100)));
  const daysLeft = Math.max(0, Math.round(cycleDays - used));
  return { pct, daysLeft };
}
