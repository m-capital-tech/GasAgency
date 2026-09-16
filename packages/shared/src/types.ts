// Core domain types for GasSetu (PRD §8.1)

export type Role = "customer" | "agency_owner" | "agency_staff" | "delivery" | "admin";
export type Language = "en" | "hi" | "te";
export type OMC = "HP" | "IOCL" | "BPCL";
export type CustomerType = "domestic" | "commercial";
export type AgencyStatus = "pending" | "approved" | "suspended";
export type Plan = "free" | "growth" | "pro";

export interface User {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email?: string;
  language: Language;
  avatarColor: string;
}

export interface Address {
  id: string;
  label: string;
  line1: string;
  line2?: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
}

export interface Connection {
  omc: OMC;
  consumerNo: string;
  lpgId: string;
}

export interface Reminder {
  enabled: boolean;
  nextDate: string | null; // ISO date
  autoBook: boolean;
  avgCycleDays: number;
}

export interface Customer {
  userId: string;
  type: CustomerType;
  addresses: Address[];
  defaultAddressId: string;
  connection?: Connection;
  assignedAgencyId: string | null;
  reminder: Reminder;
  createdAt: string;
}

export interface Slot {
  id: string;
  label: string;
  capacity: number;
}

export interface ServiceArea {
  pincodes: string[];
  center: { lat: number; lng: number };
  radiusKm: number;
}

export interface Agency {
  id: string;
  name: string;
  omc: OMC;
  area: string;
  distributorCode: string;
  gstin: string;
  ownerUserId: string;
  phone: string;
  status: AgencyStatus;
  serviceArea: ServiceArea;
  rating: number;
  codEnabled: boolean;
  slots: Slot[];
  plan: Plan;
  createdAt: string;
}

export interface CylinderType {
  id: string;
  name: string;
  weightKg: number;
  category: CustomerType;
}

export interface AgencyPrice {
  agencyId: string;
  cylinderTypeId: string;
  price: number;
  deliveryCharge: number;
}

export interface Inventory {
  agencyId: string;
  cylinderTypeId: string;
  filled: number;
  empty: number;
  lowStockThreshold: number;
}

export interface InventoryEntry {
  id: string;
  agencyId: string;
  cylinderTypeId: string;
  kind: "in" | "out";
  qty: number;
  note?: string;
  at: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DeliveryStaff {
  id: string;
  userId: string;
  agencyId: string;
  vehicle: string;
  vehicleNo: string;
  online: boolean;
  currentLocation: LatLng;
  onTimePct: number;
  failedPct: number;
  cashInHand: number;
}

export type BookingStatus =
  | "PENDING_PAYMENT"
  | "PAYMENT_FAILED"
  | "PLACED"
  | "ACCEPTED"
  | "ASSIGNED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "REJECTED"
  | "CANCELLED";

export type SlotType = "standard" | "tomorrow_morning" | "tomorrow_evening" | "express";
export type PaymentMethod = "upi" | "card" | "netbanking" | "wallet" | "cod";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "COD_PENDING" | "COD_COLLECTED" | "REFUNDED";

export interface BookingItem {
  cylinderTypeId: string;
  qty: number;
  unitPrice: number;
}

export interface Charges {
  subtotal: number;
  delivery: number;
  convenience: number;
  express: number;
  gst: number;
  total: number;
}

export interface Payment {
  method: PaymentMethod;
  status: PaymentStatus;
  gatewayRef?: string;
  paidAt?: string;
}

export interface StatusHistoryEntry {
  status: BookingStatus;
  at: string;
  by: string;
  note?: string;
}

export type DeliveryFailReason = "customer_not_home" | "wrong_address" | "refused" | "other";

export interface Booking {
  id: string;
  code: string;
  customerId: string;
  agencyId: string;
  addressId: string;
  items: BookingItem[];
  slot: SlotType;
  charges: Charges;
  payment: Payment;
  status: BookingStatus;
  statusHistory: StatusHistoryEntry[];
  deliveryOtp: string;
  assignedStaffId: string | null;
  eta: string | null;
  etaMinutes: number | null;
  emptyCollected: boolean;
  failReason?: DeliveryFailReason;
  rejectReason?: string;
  cancelReason?: string;
  createdAt: string;
  deliveredAt?: string;
}

export interface Settlement {
  id: string;
  bookingId: string;
  agencyId: string;
  amount: number;
  commission: number;
  convenienceFee: number;
  expressShare: number;
  netToAgency: number;
  status: "pending" | "settled";
  settledAt: string | null;
  createdAt: string;
}

export type ComplaintCategory = "delivery_delay" | "wrong_cylinder" | "leak" | "staff_behaviour" | "payment" | "other";
export type ComplaintStatus = "open" | "in_progress" | "resolved" | "escalated";

export interface Complaint {
  id: string;
  bookingId?: string;
  customerId: string;
  agencyId: string;
  category: ComplaintCategory;
  text: string;
  status: ComplaintStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyTransferRequest {
  id: string;
  customerId: string;
  fromAgencyId: string;
  toAgencyId: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export type NotificationType = "status" | "reminder" | "offer" | "system";

export interface Notification {
  id: string;
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  bookingId?: string;
  createdAt: string;
}

export interface PlatformConfig {
  commissionPct: number;
  commissionFlat: number;
  commissionMode: "pct" | "flat";
  convenienceFee: number;
  expressFee: number;
  expressAgencySharePct: number;
  gstPct: number;
  minRefillGapDays: number;
  yearlyDomesticQuota: number;
  defaultCycleDays: number;
  reminderLeadDays: number;
  plans: Record<Plan, { name: string; monthlyFee: number; orderLimit: number | null }>;
}

export interface SubscriptionInvoice {
  id: string;
  agencyId: string;
  plan: Plan;
  amount: number;
  period: string;
  status: "paid" | "due";
  issuedAt: string;
}

export interface TripState {
  staffId: string;
  bookingId: string;
  route: LatLng[];
  index: number;
  startedAt: string;
}
