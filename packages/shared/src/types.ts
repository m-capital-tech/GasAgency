// Core domain types for GasSetu — B2B commercial LPG marketplace
// Customers are businesses (restaurants, cloud kitchens, hotels, canteens…) buying 19 kg / 47.5 kg cylinders.

export type Role = "business" | "agency_owner" | "agency_staff" | "delivery" | "admin";
export type Language = "en" | "hi" | "te";
export type OMC = "HP" | "IOCL" | "BPCL";
export type AgencyStatus = "pending" | "approved" | "suspended";
export type Plan = "free" | "growth" | "pro";

export type BusinessType = "restaurant" | "tiffin_centre" | "cloud_kitchen" | "hotel" | "canteen" | "bakery" | "tea_stall" | "hospital" | "other";
export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  restaurant: "Restaurant",
  tiffin_centre: "Tiffin centre",
  cloud_kitchen: "Cloud kitchen",
  hotel: "Hotel / lodge",
  canteen: "Canteen / hostel mess",
  bakery: "Bakery / sweets",
  tea_stall: "Tea stall / café",
  hospital: "Hospital / institution",
  other: "Other",
};

export interface User {
  id: string;
  role: Role;
  name: string;
  phone: string;
  email?: string;
  language: Language;
  avatarColor: string;
}

/** A delivery location of a business. Multi-outlet accounts have several. */
export interface Outlet {
  id: string;
  label: string; // "Main kitchen", "Branch 2"
  line1: string;
  line2?: string;
  city: string;
  pincode: string;
  lat: number;
  lng: number;
  contactName?: string;
  contactPhone?: string;
  /** stock at this outlet (cylinders) */
  inUse: number;
  spareFull: number;
  emptiesHeld: number;
  /** average consumption for "days of stock left" */
  cylindersPerWeek: number;
}

export interface Connection {
  omc: OMC;
  consumerNo: string;
}

export type CreditStatus = "none" | "requested" | "approved" | "suspended";
export interface CreditTerms {
  status: CreditStatus;
  limit: number; // ₹
  termDays: number; // net-N
  approvedBy?: string;
  approvedAt?: string;
  note?: string;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface StandingOrder {
  id: string;
  outletId: string;
  items: { cylinderTypeId: string; qty: number }[];
  days: Weekday[];
  slot: SlotType;
  paymentMethod: PaymentMethod;
  active: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
}

export type BusinessStatus = "pending" | "verified" | "suspended";

export interface Business {
  userId: string;
  name: string;
  type: BusinessType;
  gstin?: string;
  fssai?: string;
  status: BusinessStatus;
  outlets: Outlet[];
  defaultOutletId: string;
  connection?: Connection;
  assignedAgencyId: string | null;
  credit: CreditTerms;
  standingOrders: StandingOrder[];
  lowStockAlertDays: number;
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
  creditEnabled: boolean;
  slots: Slot[];
  plan: Plan;
  createdAt: string;
}

export interface CylinderType {
  id: string;
  name: string;
  weightKg: number;
}

export interface PriceSlab {
  minQty: number;
  price: number;
}
export interface AgencyPrice {
  agencyId: string;
  cylinderTypeId: string;
  price: number; // base price per cylinder
  slabs: PriceSlab[]; // quantity-based discounts (per order)
  deliveryCharge: number; // per order
}

/** Per-account negotiated price override */
export interface AccountPrice {
  agencyId: string;
  businessId: string;
  cylinderTypeId: string;
  price: number;
}

export interface Inventory {
  agencyId: string;
  cylinderTypeId: string;
  filled: number;
  empty: number;
  /** cylinders currently out with business accounts (deposit stock) */
  withAccounts: number;
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
export type PaymentMethod = "upi" | "card" | "netbanking" | "cod" | "credit";
export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "COD_PENDING" | "COD_COLLECTED" | "CREDIT_DUE" | "CREDIT_OVERDUE" | "CREDIT_PAID" | "REFUNDED";

export interface BookingItem {
  cylinderTypeId: string;
  qty: number;
  unitPrice: number;
}

export interface Charges {
  subtotal: number;
  slabDiscount: number;
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
  /** credit orders: invoice due date */
  dueAt?: string;
}

export interface StatusHistoryEntry {
  status: BookingStatus;
  at: string;
  by: string;
  note?: string;
}

export type DeliveryFailReason = "outlet_closed" | "wrong_address" | "refused" | "other";

export interface Booking {
  id: string;
  code: string;
  businessId: string;
  agencyId: string;
  outletId: string;
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
  emptiesToCollect: number;
  emptiesCollected: number;
  standingOrderId?: string;
  invoiceNo: string;
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

/** A credit-ledger entry for a business account (invoice or payment). */
export interface LedgerEntry {
  id: string;
  businessId: string;
  agencyId: string;
  kind: "invoice" | "payment";
  bookingId?: string;
  amount: number; // invoice = +, payment = −
  dueAt?: string;
  note?: string;
  at: string;
}

export type ComplaintCategory = "delivery_delay" | "short_supply" | "leak" | "staff_behaviour" | "billing" | "other";
export type ComplaintStatus = "open" | "in_progress" | "resolved" | "escalated";

export interface Complaint {
  id: string;
  bookingId?: string;
  businessId: string;
  agencyId: string;
  category: ComplaintCategory;
  text: string;
  status: ComplaintStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AgencyTransferRequest {
  id: string;
  businessId: string;
  fromAgencyId: string;
  toAgencyId: string | null;
  reason: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export type NotificationType = "status" | "stock" | "billing" | "offer" | "system";

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
  gstPct: number; // GST on commercial LPG (illustrative)
  maxCylindersPerOrder: number;
  defaultCreditDays: number;
  defaultCreditLimit: number;
  creditFeePct: number; // platform fee on credit-financed orders (revenue stream)
  lowStockDays: number;
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
