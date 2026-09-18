import { z } from "zod";

export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");
export const otpSchema = z.string().regex(/^\d{6}$/, "OTP must be 6 digits");

export const createBookingSchema = z.object({
  businessId: z.string(),
  outletId: z.string(),
  items: z.array(z.object({ cylinderTypeId: z.string(), qty: z.number().int().min(1).max(50) })).min(1),
  slot: z.enum(["standard", "tomorrow_morning", "tomorrow_evening", "express"]),
  paymentMethod: z.enum(["upi", "card", "netbanking", "cod", "credit"]),
  emptiesToCollect: z.number().int().min(0).max(50).optional(),
  standingOrderId: z.string().optional(),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const outletSchema = z.object({
  label: z.string().min(2),
  line1: z.string().min(3),
  line2: z.string().optional(),
  pincode: z.string().regex(/^5\d{5}$/, "Enter a Hyderabad pincode (5xxxxx)"),
  lat: z.number(),
  lng: z.number(),
  contactName: z.string().optional(),
  contactPhone: z.string().optional(),
  inUse: z.number().int().min(0).max(50).optional(),
  spareFull: z.number().int().min(0).max(50).optional(),
  cylindersPerWeek: z.number().min(0).max(100).optional(),
});

export const businessProfileSchema = z.object({
  ownerName: z.string().min(2),
  name: z.string().min(2, "Enter your business name"),
  type: z.enum(["restaurant", "tiffin_centre", "cloud_kitchen", "hotel", "canteen", "bakery", "tea_stall", "hospital", "other"]),
  gstin: z.string().optional(),
  fssai: z.string().optional(),
  outlet: outletSchema,
});

export const linkConnectionSchema = z.object({
  omc: z.enum(["HP", "IOCL", "BPCL"]),
  consumerNo: z.string().min(4),
});

export const complaintSchema = z.object({
  category: z.enum(["delivery_delay", "short_supply", "leak", "staff_behaviour", "billing", "other"]),
  text: z.string().min(5),
  bookingId: z.string().optional(),
});

export const standingOrderSchema = z.object({
  outletId: z.string(),
  items: z.array(z.object({ cylinderTypeId: z.string(), qty: z.number().int().min(1).max(50) })).min(1),
  days: z.array(z.number().int().min(0).max(6)).min(1),
  slot: z.enum(["standard", "tomorrow_morning", "tomorrow_evening", "express"]),
  paymentMethod: z.enum(["upi", "card", "netbanking", "cod", "credit"]),
  active: z.boolean().optional(),
});
