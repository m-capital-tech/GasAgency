import type { AgencyPrice, Booking, BookingItem, Charges, CylinderType, PlatformConfig, SlotType } from "./types";

export const DEFAULT_CONFIG: PlatformConfig = {
  commissionPct: 2,
  commissionFlat: 10,
  commissionMode: "pct",
  convenienceFee: 9,
  expressFee: 49,
  expressAgencySharePct: 50,
  gstPct: 5, // illustrative — applied to delivery + fees only
  minRefillGapDays: 21,
  yearlyDomesticQuota: 15,
  defaultCycleDays: 30,
  reminderLeadDays: 3,
  plans: {
    free: { name: "Free", monthlyFee: 0, orderLimit: 200 },
    growth: { name: "Growth", monthlyFee: 1999, orderLimit: null },
    pro: { name: "Pro", monthlyFee: 4999, orderLimit: null },
  },
};

export const SLOT_LABELS: Record<SlotType, string> = {
  standard: "Standard (1–2 days)",
  tomorrow_morning: "Tomorrow, morning (8–12)",
  tomorrow_evening: "Tomorrow, evening (4–8)",
  express: "Express (today)",
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeCharges(
  items: BookingItem[],
  slot: SlotType,
  deliveryCharge: number,
  config: PlatformConfig,
): Charges {
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const express = slot === "express" ? config.expressFee : 0;
  const convenience = config.convenienceFee;
  const gst = round2(((deliveryCharge + convenience + express) * config.gstPct) / 100);
  const total = round2(subtotal + deliveryCharge + convenience + express + gst);
  return { subtotal, delivery: deliveryCharge, convenience, express, gst, total };
}

export function priceFor(prices: AgencyPrice[], agencyId: string, cylinderTypeId: string): AgencyPrice | undefined {
  return prices.find((p) => p.agencyId === agencyId && p.cylinderTypeId === cylinderTypeId);
}

/** Platform economics for one booking (PRD §11). */
export function computeSettlement(booking: Booking, config: PlatformConfig) {
  const cylinderValue = booking.charges.subtotal;
  const online = booking.payment.method !== "cod";
  const commission = online
    ? config.commissionMode === "pct"
      ? round2((cylinderValue * config.commissionPct) / 100)
      : config.commissionFlat
    : 0;
  const convenienceFee = booking.charges.convenience;
  const expressPlatform = round2((booking.charges.express * (100 - config.expressAgencySharePct)) / 100);
  const expressShare = round2(booking.charges.express - expressPlatform);
  const platformRevenue = round2(commission + convenienceFee + expressPlatform);
  const netToAgency = round2(booking.charges.total - platformRevenue - booking.charges.gst);
  return { commission, convenienceFee, expressShare, expressPlatform, platformRevenue, netToAgency };
}

export function cylinderLabel(t: CylinderType): string {
  return `${t.weightKg} kg ${t.category === "domestic" ? "Domestic" : "Commercial"}`;
}

export function slotEtaHours(slot: SlotType): number {
  switch (slot) {
    case "express":
      return 3;
    case "tomorrow_morning":
      return 20;
    case "tomorrow_evening":
      return 28;
    default:
      return 36;
  }
}
