import { z } from "zod";

export const phoneSchema = z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number");
export const otpSchema = z.string().regex(/^\d{6}$/, "OTP must be 6 digits");

export const createBookingSchema = z.object({
  customerId: z.string(),
  addressId: z.string(),
  items: z.array(z.object({ cylinderTypeId: z.string(), qty: z.number().int().min(1).max(10) })).min(1),
  slot: z.enum(["standard", "tomorrow_morning", "tomorrow_evening", "express"]),
  paymentMethod: z.enum(["upi", "card", "netbanking", "wallet", "cod"]),
});
export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const profileSchema = z.object({
  name: z.string().min(2),
  type: z.enum(["domestic", "commercial"]),
  address: z.object({
    line1: z.string().min(3),
    line2: z.string().optional(),
    pincode: z.string().regex(/^5\d{5}$/, "Enter a Hyderabad pincode (5xxxxx)"),
    lat: z.number(),
    lng: z.number(),
  }),
});

export const linkConnectionSchema = z.object({
  omc: z.enum(["HP", "IOCL", "BPCL"]),
  consumerNo: z.string().min(4),
});

export const complaintSchema = z.object({
  category: z.enum(["delivery_delay", "wrong_cylinder", "leak", "staff_behaviour", "payment", "other"]),
  text: z.string().min(5),
  bookingId: z.string().optional(),
});
