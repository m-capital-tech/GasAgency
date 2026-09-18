import type { AgencyPrice, Booking, BookingItem, Charges, PlatformConfig, SlotType } from "./types";

export const DEFAULT_CONFIG: PlatformConfig = {
  commissionPct: 2,
  commissionFlat: 25,
  commissionMode: "pct",
  convenienceFee: 19,
  expressFee: 99,
  expressAgencySharePct: 50,
  gstPct: 18, // commercial LPG attracts 18 % GST (illustrative)
  maxCylindersPerOrder: 20,
  defaultCreditDays: 15,
  defaultCreditLimit: 50000,
  creditFeePct: 1,
  lowStockDays: 2,
  plans: {
    free: { name: "Free", monthlyFee: 0, orderLimit: 150 },
    growth: { name: "Growth", monthlyFee: 2999, orderLimit: null },
    pro: { name: "Pro", monthlyFee: 7999, orderLimit: null },
  },
};

export const SLOT_LABELS: Record<SlotType, string> = {
  standard: "Standard (next day)",
  tomorrow_morning: "Tomorrow, before opening (6–9 AM)",
  tomorrow_evening: "Tomorrow, evening (4–8 PM)",
  express: "Express (within 3 hours)",
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Price per cylinder after quantity slabs (per order). */
export function slabPrice(price: AgencyPrice, qty: number): number {
  const slab = [...price.slabs].filter((s) => qty >= s.minQty).sort((a, b) => b.minQty - a.minQty)[0];
  return slab ? slab.price : price.price;
}

export function computeCharges(items: BookingItem[], basePrices: number[], slot: SlotType, deliveryCharge: number, config: PlatformConfig): Charges {
  const base = items.reduce((s, i, idx) => s + i.qty * (basePrices[idx] ?? i.unitPrice), 0);
  const subtotal = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
  const slabDiscount = round2(Math.max(0, base - subtotal));
  const express = slot === "express" ? config.expressFee : 0;
  const convenience = config.convenienceFee;
  const gst = round2(((subtotal + deliveryCharge + convenience + express) * config.gstPct) / 100);
  const total = round2(subtotal + deliveryCharge + convenience + express + gst);
  return { subtotal, slabDiscount, delivery: deliveryCharge, convenience, express, gst, total };
}

/** Platform economics for one booking (PRD §11 + B2B credit fee). */
export function computeSettlement(booking: Booking, config: PlatformConfig) {
  const cylinderValue = booking.charges.subtotal;
  const online = booking.payment.method !== "cod";
  const commission = online ? (config.commissionMode === "pct" ? round2((cylinderValue * config.commissionPct) / 100) : config.commissionFlat) : 0;
  const creditFee = booking.payment.method === "credit" ? round2((cylinderValue * config.creditFeePct) / 100) : 0;
  const convenienceFee = booking.charges.convenience;
  const expressPlatform = round2((booking.charges.express * (100 - config.expressAgencySharePct)) / 100);
  const expressShare = round2(booking.charges.express - expressPlatform);
  const platformRevenue = round2(commission + convenienceFee + expressPlatform + creditFee);
  const netToAgency = round2(booking.charges.total - platformRevenue - booking.charges.gst);
  return { commission, creditFee, convenienceFee, expressShare, expressPlatform, platformRevenue, netToAgency };
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
      return 24;
  }
}
