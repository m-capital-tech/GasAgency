import type { Booking, DeliveryStaff, LatLng, Notification } from "./types";

// WebSocket /live event envelope
export type LiveEvent =
  | { type: "booking.created"; booking: Booking }
  | { type: "booking.updated"; booking: Booking }
  | { type: "staff.location"; staffId: string; agencyId: string; bookingId: string | null; location: LatLng; etaMinutes: number | null; progress: number }
  | { type: "staff.updated"; staff: DeliveryStaff }
  | { type: "notification"; notification: Notification }
  | { type: "inventory.updated"; agencyId: string }
  | { type: "agency.updated"; agencyId: string }
  | { type: "demo.reset" }
