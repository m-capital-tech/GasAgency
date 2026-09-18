import {
  assertTransition,
  buildRoute,
  canCancel,
  checkOrderRules,
  computeCharges,
  computeSettlement,
  creditOutstanding,
  estimateCylindersPerWeek,
  haversineKm,
  isOpen,
  nearestAgency,
  nextHappyStatus,
  nextRunFor,
  slabPrice,
  slotEtaHours,
  stockDaysLeft,
  STATUS_LABELS,
  type Agency,
  type Booking,
  type BookingStatus,
  type Business,
  type Complaint,
  type CreateBookingInput,
  type DeliveryFailReason,
  type DeliveryStaff,
  type LatLng,
  type LedgerEntry,
  type LiveEvent,
  type Notification,
  type Outlet,
  type PaymentMethod,
  type PlatformConfig,
  type Settlement,
  type SlotType,
  type StandingOrder,
  type User,
} from "@gassetu/shared";
import { generateSeed, type SeedData } from "@gassetu/mock-data";
import { EngineError, notFound } from "./errors";

export type Listener = (e: LiveEvent) => void;

const DAY = 86_400_000;
const ROUTE_POINTS = 40;
const ROUTE_TICK_MS = 1500;

export interface TripRuntime {
  staffId: string;
  bookingId: string;
  agencyId: string;
  route: LatLng[];
  index: number;
  startedAt: string;
}

export type SimulationKind = "payment_failure" | "delivery_failure" | "low_stock" | "order_burst" | "overdue_invoice";

export interface DemoState {
  speed: number;
  forceNextPaymentFail: boolean;
  /** Demo switch (§6.5): skip credit-limit / quantity checks so a persona can rebook freely on stage. */
  bypassRules: boolean;
}

/**
 * DemoEngine — the whole B2B prototype's business logic in one in-memory object.
 * mock-api wraps it over HTTP/WS; the mobile app can run it locally as an offline fallback.
 */
export class DemoEngine {
  state!: SeedData;
  trips = new Map<string, TripRuntime>();
  demo: DemoState = { speed: 1, forceNextPaymentFail: false, bypassRules: false };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private counter = 1000;
  private invoiceSeq = 9000;

  constructor(private readonly nowFn: () => Date = () => new Date()) {
    this.reset();
  }

  // ---------- infra ----------
  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit(e: LiveEvent) {
    for (const l of this.listeners) {
      try {
        l(e);
      } catch (err) {
        console.error("listener error", err);
      }
    }
  }
  private now() {
    return this.nowFn();
  }
  private iso(d: Date = this.now()) {
    return d.toISOString();
  }
  private id(p: string) {
    return `${p}_${(++this.counter).toString(36)}`;
  }
  get config(): PlatformConfig {
    return this.state.config;
  }

  reset() {
    this.stopTicker();
    this.trips.clear();
    this.state = generateSeed(this.now());
    this.demo = { speed: 1, forceNextPaymentFail: false, bypassRules: false };
    for (const b of this.state.bookings) {
      if (b.status === "OUT_FOR_DELIVERY" && b.assignedStaffId && !this.trips.has(b.assignedStaffId)) {
        const s = this.staff(b.assignedStaffId);
        const route = buildRoute(s.currentLocation, this.outletOf(b), ROUTE_POINTS, b.id.length);
        const index = Math.floor(ROUTE_POINTS * 0.35);
        s.currentLocation = route[index];
        b.etaMinutes = this.etaFor(index, route.length);
        this.trips.set(s.id, { staffId: s.id, bookingId: b.id, agencyId: b.agencyId, route, index, startedAt: this.iso() });
      }
    }
    this.emit({ type: "demo.reset" });
    this.startTicker();
  }

  destroy() {
    this.stopTicker();
    this.listeners.clear();
  }

  // ---------- lookups ----------
  user(id: string): User {
    const u = this.state.users.find((x) => x.id === id);
    if (!u) throw notFound("User");
    return u;
  }
  business(userId: string): Business {
    const b = this.state.businesses.find((x) => x.userId === userId);
    if (!b) throw notFound("Business");
    return b;
  }
  agency(id: string): Agency {
    const a = this.state.agencies.find((x) => x.id === id);
    if (!a) throw notFound("Agency");
    return a;
  }
  booking(id: string): Booking {
    const b = this.state.bookings.find((x) => x.id === id || x.code === id);
    if (!b) throw notFound("Booking");
    return b;
  }
  staff(id: string): DeliveryStaff {
    const s = this.state.staff.find((x) => x.id === id);
    if (!s) throw notFound("Delivery staff");
    return s;
  }
  staffByUser(userId: string): DeliveryStaff {
    const s = this.state.staff.find((x) => x.userId === userId);
    if (!s) throw notFound("Delivery staff");
    return s;
  }
  agencyByOwner(userId: string): Agency {
    const a = this.state.agencies.find((x) => x.ownerUserId === userId);
    if (!a) throw notFound("Agency");
    return a;
  }
  outletOf(b: Booking): Outlet {
    const biz = this.business(b.businessId);
    return biz.outlets.find((o) => o.id === b.outletId) ?? biz.outlets[0];
  }
  cylinderName(id: string) {
    return this.state.cylinderTypes.find((c) => c.id === id)?.name ?? id;
  }

  expandBooking(b: Booking) {
    const biz = this.business(b.businessId);
    const user = this.user(b.businessId);
    const agency = this.agency(b.agencyId);
    const staff = b.assignedStaffId ? this.state.staff.find((s) => s.id === b.assignedStaffId) : undefined;
    const staffUser = staff ? this.user(staff.userId) : undefined;
    const trip = staff ? this.trips.get(staff.id) : undefined;
    const outlet = this.outletOf(b);
    return {
      ...b,
      businessName: biz.name,
      businessType: biz.type,
      ownerName: user.name,
      contactPhone: outlet.contactPhone ?? user.phone,
      outlet,
      agencyName: agency.name,
      agencyPhone: agency.phone,
      agencyOmc: agency.omc,
      agencyLocation: agency.serviceArea.center,
      cylinders: b.items.reduce((s, i) => s + i.qty, 0),
      items: b.items.map((i) => ({ ...i, name: this.cylinderName(i.cylinderTypeId) })),
      staff: staff && staffUser ? { id: staff.id, name: staffUser.name, phone: staffUser.phone, vehicle: staff.vehicle, vehicleNo: staff.vehicleNo, location: staff.currentLocation, onTimePct: staff.onTimePct } : null,
      route: trip && trip.bookingId === b.id ? trip.route : null,
      routeIndex: trip && trip.bookingId === b.id ? trip.index : null,
    };
  }
  expandStaff(s: DeliveryStaff) {
    const u = this.user(s.userId);
    const today = this.startOfToday();
    const mine = this.state.bookings.filter((b) => b.assignedStaffId === s.id);
    const todayBookings = mine.filter((b) => new Date(b.createdAt) >= today || isOpen(b.status));
    const trip = this.trips.get(s.id);
    return {
      ...s,
      name: u.name,
      phone: u.phone,
      avatarColor: u.avatarColor,
      currentDrops: mine.filter((b) => ["ASSIGNED", "OUT_FOR_DELIVERY"].includes(b.status)).length,
      currentCylinders: mine.filter((b) => ["ASSIGNED", "OUT_FOR_DELIVERY"].includes(b.status)).reduce((x, b) => x + b.items.reduce((y, i) => y + i.qty, 0), 0),
      todayAssigned: todayBookings.length,
      todayDelivered: todayBookings.filter((b) => b.status === "DELIVERED").length,
      todayFailed: todayBookings.filter((b) => b.status === "DELIVERY_FAILED" || (b.status === "CANCELLED" && b.failReason)).length,
      activeBookingId: trip?.bookingId ?? mine.find((b) => b.status === "OUT_FOR_DELIVERY")?.id ?? null,
      tripProgress: trip ? trip.index / (trip.route.length - 1) : null,
    };
  }
  expandBusiness(biz: Business) {
    const u = this.user(biz.userId);
    const mine = this.state.bookings.filter((b) => b.businessId === biz.userId);
    const delivered = mine.filter((b) => b.status === "DELIVERED").sort((a, b) => (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""));
    const last = delivered[0];
    const now = this.now();
    const outstanding = creditOutstanding(mine, biz.userId);
    const overdue = mine.filter((b) => b.payment.method === "credit" && b.payment.status !== "CREDIT_PAID" && b.payment.dueAt && new Date(b.payment.dueAt) < now && !["CANCELLED", "REJECTED"].includes(b.status)).reduce((s, b) => s + b.charges.total, 0);
    const outlets = biz.outlets.map((o) => ({ ...o, daysLeft: stockDaysLeft(o), lowStock: stockDaysLeft(o) <= biz.lowStockAlertDays }));
    const cyl30 = mine.filter((b) => b.status === "DELIVERED" && new Date(b.createdAt) > new Date(now.getTime() - 30 * DAY)).reduce((s, b) => s + b.items.reduce((x, i) => x + i.qty, 0), 0);
    return {
      ...biz,
      outlets,
      ownerName: u.name,
      phone: u.phone,
      avatarColor: u.avatarColor,
      agencyName: biz.assignedAgencyId ? this.agency(biz.assignedAgencyId).name : null,
      totalBookings: mine.length,
      cylinders30: cyl30,
      spend30: Math.round(mine.filter((b) => b.status === "DELIVERED" && new Date(b.createdAt) > new Date(now.getTime() - 30 * DAY)).reduce((s, b) => s + b.charges.total, 0)),
      lastDeliveryAt: last?.deliveredAt ?? null,
      lastBooking: last ? this.expandBooking(last) : null,
      creditOutstanding: outstanding,
      creditOverdue: overdue,
      creditAvailable: biz.credit.status === "approved" ? Math.max(0, biz.credit.limit - outstanding) : 0,
      lowStockOutlets: outlets.filter((o) => o.lowStock).length,
      usualOrder: this.usualOrder(biz),
    };
  }

  /** Most common item mix at the default outlet — powers "Reorder usual". */
  usualOrder(biz: Business) {
    const counts = new Map<string, { items: { cylinderTypeId: string; qty: number }[]; n: number }>();
    for (const b of this.state.bookings.filter((x) => x.businessId === biz.userId && x.status === "DELIVERED" && x.outletId === biz.defaultOutletId)) {
      const key = b.items.map((i) => `${i.cylinderTypeId}:${i.qty}`).sort().join("|");
      const e = counts.get(key) ?? { items: b.items.map(({ cylinderTypeId, qty }) => ({ cylinderTypeId, qty })), n: 0 };
      e.n++;
      counts.set(key, e);
    }
    const best = [...counts.values()].sort((a, b) => b.n - a.n)[0];
    return best?.items ?? [{ cylinderTypeId: "cyl_19", qty: 2 }];
  }

  private startOfToday() {
    const d = this.now();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ---------- auth ----------
  requestOtp(phone: string) {
    const exists = this.state.users.some((u) => u.phone === phone);
    return { sent: true, hint: "Demo OTP is 123456", newUser: !exists };
  }
  verifyOtp(phone: string, otp: string) {
    if (!/^\d{6}$/.test(otp)) throw new EngineError("BAD_OTP", "OTP must be 6 digits");
    if (otp !== "123456") throw new EngineError("BAD_OTP", "Incorrect OTP. Demo OTP is 123456.");
    let user = this.state.users.find((u) => u.phone === phone);
    let isNew = false;
    if (!user) {
      user = { id: this.id("usr"), role: "business", name: "", phone, language: "en", avatarColor: "#A31E21" };
      this.state.users.push(user);
      isNew = true;
    }
    return { token: `tok_${user.id}`, user, isNew, profile: this.profileFor(user) };
  }
  loginEmail(email: string, password: string) {
    if (password !== "123456") throw new EngineError("BAD_PASSWORD", "Incorrect password. Demo password is 123456.");
    const user = this.state.users.find((u) => u.email === email);
    if (!user) throw new EngineError("NO_USER", "No account with that email.");
    return { token: `tok_${user.id}`, user, profile: this.profileFor(user) };
  }
  profileFor(user: User) {
    switch (user.role) {
      case "business": {
        const b = this.state.businesses.find((x) => x.userId === user.id);
        return b ? this.expandBusiness(b) : null;
      }
      case "delivery":
        return this.expandStaff(this.staffByUser(user.id));
      case "agency_owner":
        return this.agencyByOwner(user.id);
      default:
        return null;
    }
  }

  // ---------- business profile ----------
  upsertBusiness(userId: string, input: { ownerName: string; name: string; type: Business["type"]; gstin?: string; fssai?: string; outlet: Omit<Outlet, "id" | "city" | "inUse" | "spareFull" | "emptiesHeld" | "cylindersPerWeek"> & Partial<Pick<Outlet, "inUse" | "spareFull" | "cylindersPerWeek">> }) {
    const user = this.user(userId);
    user.name = input.ownerName;
    let biz = this.state.businesses.find((x) => x.userId === userId);
    const outlet: Outlet = { id: this.id("out"), city: "Hyderabad", inUse: input.outlet.inUse ?? 2, spareFull: input.outlet.spareFull ?? 0, emptiesHeld: 0, cylindersPerWeek: input.outlet.cylindersPerWeek ?? 3, ...input.outlet };
    if (!biz) {
      biz = {
        userId,
        name: input.name,
        type: input.type,
        gstin: input.gstin || undefined,
        fssai: input.fssai || undefined,
        status: "pending",
        outlets: [outlet],
        defaultOutletId: outlet.id,
        assignedAgencyId: null,
        credit: { status: "none", limit: 0, termDays: this.config.defaultCreditDays },
        standingOrders: [],
        lowStockAlertDays: this.config.lowStockDays,
        createdAt: this.iso(),
      };
      this.state.businesses.push(biz);
      this.notify(this.state.demo.adminUserId, "New business registration", `${biz.name} (${biz.type.replace("_", " ")}) is awaiting verification.`, "system");
    } else {
      biz.name = input.name;
      biz.type = input.type;
      biz.gstin = input.gstin || biz.gstin;
      biz.fssai = input.fssai || biz.fssai;
      biz.outlets = [outlet, ...biz.outlets.slice(1)];
      biz.defaultOutletId = outlet.id;
    }
    this.emit({ type: "business.updated", businessId: userId });
    return this.expandBusiness(biz);
  }

  addOutlet(userId: string, input: Omit<Outlet, "id" | "city" | "emptiesHeld"> & Partial<Pick<Outlet, "emptiesHeld">>) {
    const biz = this.business(userId);
    const outlet: Outlet = { id: this.id("out"), city: "Hyderabad", emptiesHeld: 0, ...input };
    biz.outlets.push(outlet);
    this.emit({ type: "business.updated", businessId: userId });
    return this.expandBusiness(biz);
  }
  updateOutlet(userId: string, outletId: string, patch: Partial<Outlet>) {
    const biz = this.business(userId);
    const o = biz.outlets.find((x) => x.id === outletId);
    if (!o) throw notFound("Outlet");
    Object.assign(o, patch, { id: o.id });
    this.emit({ type: "business.updated", businessId: userId });
    return this.expandBusiness(biz);
  }
  setDefaultOutlet(userId: string, outletId: string) {
    const biz = this.business(userId);
    if (!biz.outlets.some((o) => o.id === outletId)) throw notFound("Outlet");
    biz.defaultOutletId = outletId;
    return this.expandBusiness(biz);
  }

  /** Mock consumer-number lookup: any consumer number maps to the OMC's agency nearest the outlet. */
  linkConnection(userId: string, omc: Agency["omc"], consumerNo: string) {
    const biz = this.business(userId);
    if (consumerNo.replace(/\D/g, "").length < 6) throw new EngineError("BAD_CONSUMER", "Consumer number should be at least 6 digits.");
    const outlet = biz.outlets.find((o) => o.id === biz.defaultOutletId) ?? biz.outlets[0];
    const candidates = this.state.agencies.filter((a) => a.omc === omc && a.status === "approved");
    const agency = nearestAgency(candidates, outlet, outlet.pincode) ?? nearestAgency(this.state.agencies, outlet, outlet.pincode);
    if (!agency) throw new EngineError("NO_AGENCY", "No distributor found for this connection.");
    biz.connection = { omc, consumerNo };
    biz.assignedAgencyId = agency.id;
    if (biz.status === "pending") biz.status = "verified"; // linked commercial connection counts as KYC for the demo
    this.emit({ type: "business.updated", businessId: userId });
    return { agency: this.agencyCard(agency, outlet), business: this.expandBusiness(biz) };
  }

  autoAssignAgency(userId: string) {
    const biz = this.business(userId);
    const outlet = biz.outlets.find((o) => o.id === biz.defaultOutletId) ?? biz.outlets[0];
    const agency = nearestAgency(this.state.agencies, outlet, outlet.pincode);
    if (!agency) throw new EngineError("NO_AGENCY", "No agency serves this area yet.");
    biz.assignedAgencyId = agency.id;
    biz.connection = undefined;
    if (biz.status === "pending") biz.status = "verified";
    this.emit({ type: "business.updated", businessId: userId });
    return { agency: this.agencyCard(agency, outlet), business: this.expandBusiness(biz) };
  }

  agencyCard(agency: Agency, from?: LatLng) {
    return {
      ...agency,
      distanceKm: from ? Math.round(haversineKm(agency.serviceArea.center, from) * 10) / 10 : null,
      prices: this.state.prices.filter((p) => p.agencyId === agency.id),
      cylinderTypes: this.state.cylinderTypes,
    };
  }
  nearestAgencies(point: LatLng, pincode?: string) {
    return this.state.agencies
      .filter((a) => a.status === "approved")
      .map((a) => this.agencyCard(a, point))
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }

  requestTransfer(userId: string, reason: string, toAgencyId: string | null) {
    const biz = this.business(userId);
    if (!biz.assignedAgencyId) throw new EngineError("NO_AGENCY", "No agency assigned yet.");
    if (this.state.transferRequests.some((t) => t.businessId === userId && t.status === "pending")) throw new EngineError("DUPLICATE", "You already have a pending transfer request.");
    const req = { id: this.id("trf"), businessId: userId, fromAgencyId: biz.assignedAgencyId, toAgencyId, reason, status: "pending" as const, createdAt: this.iso() };
    this.state.transferRequests.push(req);
    this.notify(userId, "Transfer request received", "Your agency and our team will review it within 2 working days.", "system");
    return req;
  }
  resolveTransfer(id: string, approve: boolean) {
    const t = this.state.transferRequests.find((x) => x.id === id);
    if (!t) throw notFound("Transfer request");
    t.status = approve ? "approved" : "rejected";
    if (approve) {
      const biz = this.business(t.businessId);
      biz.assignedAgencyId = t.toAgencyId ?? biz.assignedAgencyId;
      this.notify(t.businessId, "Agency changed", `You are now served by ${this.agency(biz.assignedAgencyId!).name}.`, "system");
    } else this.notify(t.businessId, "Transfer request declined", "Please contact support if you need help.", "system");
    return t;
  }

  // ---------- credit ----------
  requestCredit(userId: string, note?: string) {
    const biz = this.business(userId);
    if (biz.credit.status === "approved") throw new EngineError("ALREADY", "Credit is already enabled on this account.");
    biz.credit = { ...biz.credit, status: "requested", note };
    this.notify(this.state.demo.adminUserId, "Credit request", `${biz.name} has requested a credit account.`, "system");
    this.emit({ type: "business.updated", businessId: userId });
    return this.expandBusiness(biz);
  }
  /** Admin decides while onboarding: verify the business and set credit terms in one go. */
  setBusinessStatus(userId: string, input: { status?: Business["status"]; credit?: Partial<Business["credit"]>; by?: string }) {
    const biz = this.business(userId);
    if (input.status) biz.status = input.status;
    if (input.credit) {
      biz.credit = { ...biz.credit, ...input.credit };
      if (input.credit.status === "approved") {
        biz.credit.approvedBy = input.by ?? "admin";
        biz.credit.approvedAt = this.iso();
        this.notify(userId, "Credit approved 🎉", `You can now order on credit up to ₹${biz.credit.limit.toLocaleString("en-IN")} with net-${biz.credit.termDays} terms.`, "billing");
      } else if (input.credit.status === "suspended") this.notify(userId, "Credit suspended", "Please clear outstanding invoices to restore credit ordering.", "billing");
      else if (input.credit.status === "none") this.notify(userId, "Credit request declined", "You can keep ordering with online payment or cash on delivery.", "billing");
    }
    if (input.status === "verified" && !input.credit) this.notify(userId, "Business verified ✅", "Your GasSetu account is active. Order commercial cylinders from your agency now.", "system");
    if (input.status === "suspended") this.notify(userId, "Account suspended", "Please contact GasSetu support.", "system");
    this.emit({ type: "business.updated", businessId: userId });
    return this.expandBusiness(biz);
  }
  /** Record a payment against credit invoices (oldest first). */
  recordCreditPayment(userId: string, amount: number, note = "Payment received") {
    const biz = this.business(userId);
    let remaining = amount;
    const due = this.state.bookings
      .filter((b) => b.businessId === userId && b.payment.method === "credit" && ["CREDIT_DUE", "CREDIT_OVERDUE"].includes(b.payment.status) && !["CANCELLED", "REJECTED"].includes(b.status))
      .sort((a, b) => (a.payment.dueAt ?? "").localeCompare(b.payment.dueAt ?? ""));
    const paid: string[] = [];
    for (const b of due) {
      if (remaining < b.charges.total - 0.01) break;
      remaining -= b.charges.total;
      b.payment.status = "CREDIT_PAID";
      b.payment.paidAt = this.iso();
      paid.push(b.invoiceNo);
      this.emit({ type: "booking.updated", booking: b });
    }
    this.state.ledger.push({ id: this.id("led"), businessId: userId, agencyId: biz.assignedAgencyId ?? "", kind: "payment", amount: -amount, note: `${note}${paid.length ? " · " + paid.join(", ") : ""}`, at: this.iso() });
    this.notify(userId, "Payment recorded", `₹${Math.round(amount).toLocaleString("en-IN")} received against ${paid.length} invoice(s).`, "billing");
    this.emit({ type: "business.updated", businessId: userId });
    return { paidInvoices: paid, unapplied: Math.round(remaining), business: this.expandBusiness(biz) };
  }
  ledgerFor(userId: string) {
    const rows = this.state.ledger.filter((l) => l.businessId === userId).sort((a, b) => b.at.localeCompare(a.at));
    let balance = 0;
    const withBalance = [...rows].reverse().map((r) => ({ ...r, balance: (balance += r.amount) }));
    return withBalance.reverse();
  }
  /** Monthly consolidated statement for a business (credit + prepaid). */
  statement(userId: string, month: string /* YYYY-MM */) {
    const biz = this.business(userId);
    const rows = this.state.bookings.filter((b) => b.businessId === userId && b.status === "DELIVERED" && (b.deliveredAt ?? b.createdAt).startsWith(month)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const sum = (f: (b: Booking) => number) => Math.round(rows.reduce((s, b) => s + f(b), 0));
    return {
      business: this.expandBusiness(biz),
      month,
      rows: rows.map((b) => this.expandBooking(b)),
      totals: { orders: rows.length, cylinders: sum((b) => b.items.reduce((x, i) => x + i.qty, 0)), subtotal: sum((b) => b.charges.subtotal), gst: sum((b) => b.charges.gst), total: sum((b) => b.charges.total), credit: sum((b) => (b.payment.method === "credit" ? b.charges.total : 0)), prepaid: sum((b) => (b.payment.method !== "credit" && b.payment.method !== "cod" ? b.charges.total : 0)), cod: sum((b) => (b.payment.method === "cod" ? b.charges.total : 0)) },
    };
  }
  statementMonths(userId: string) {
    const months = new Set(this.state.bookings.filter((b) => b.businessId === userId && b.status === "DELIVERED").map((b) => (b.deliveredAt ?? b.createdAt).slice(0, 7)));
    return [...months].sort().reverse();
  }

  // ---------- standing orders ----------
  upsertStandingOrder(userId: string, input: Omit<StandingOrder, "id" | "lastRunAt" | "nextRunAt" | "active"> & { id?: string; active?: boolean }) {
    const biz = this.business(userId);
    const existing = input.id ? biz.standingOrders.find((s) => s.id === input.id) : undefined;
    const so: StandingOrder = { ...(existing ?? { id: this.id("so"), lastRunAt: null, nextRunAt: null }), ...input, id: existing?.id ?? this.id("so"), active: input.active ?? true };
    so.nextRunAt = so.active ? (nextRunFor(so.days, this.now())?.toISOString() ?? null) : null;
    if (existing) Object.assign(existing, so);
    else biz.standingOrders.push(so);
    this.emit({ type: "business.updated", businessId: userId });
    return this.expandBusiness(biz);
  }
  deleteStandingOrder(userId: string, id: string) {
    const biz = this.business(userId);
    biz.standingOrders = biz.standingOrders.filter((s) => s.id !== id);
    this.emit({ type: "business.updated", businessId: userId });
    return this.expandBusiness(biz);
  }
  /** Demo: fire a standing order now (what the scheduler would do at 7 AM on its day). */
  runStandingOrder(userId: string, id: string) {
    const biz = this.business(userId);
    const so = biz.standingOrders.find((s) => s.id === id);
    if (!so) throw notFound("Standing order");
    const b = this.createBooking({ businessId: userId, outletId: so.outletId, items: so.items, slot: so.slot, paymentMethod: so.paymentMethod, emptiesToCollect: so.items.reduce((s, i) => s + i.qty, 0), standingOrderId: so.id });
    if (b.status === "PENDING_PAYMENT") this.recordPayment(b.id, { ok: true, paymentId: `pay_mock_auto_${Date.now().toString(36)}`, method: so.paymentMethod });
    so.lastRunAt = this.iso();
    so.nextRunAt = nextRunFor(so.days, this.now())?.toISOString() ?? null;
    this.notify(userId, "Standing order placed", `${b.code}: ${this.describeItems(b)} for ${this.outletOf(b).label}.`, "status", b.id);
    return this.expandBooking(b);
  }

  // ---------- bookings ----------
  listBookings(filter: { businessId?: string; agencyId?: string; staffId?: string; outletId?: string; status?: BookingStatus[]; since?: string } = {}) {
    return this.state.bookings
      .filter((b) => !filter.businessId || b.businessId === filter.businessId)
      .filter((b) => !filter.agencyId || b.agencyId === filter.agencyId)
      .filter((b) => !filter.staffId || b.assignedStaffId === filter.staffId)
      .filter((b) => !filter.outletId || b.outletId === filter.outletId)
      .filter((b) => !filter.status || filter.status.includes(b.status))
      .filter((b) => !filter.since || b.createdAt >= filter.since)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => this.expandBooking(b));
  }

  priceFor(agencyId: string, businessId: string, cylinderTypeId: string, qty: number) {
    const p = this.state.prices.find((x) => x.agencyId === agencyId && x.cylinderTypeId === cylinderTypeId);
    if (!p) throw notFound("Price");
    const account = this.state.accountPrices.find((x) => x.agencyId === agencyId && x.businessId === businessId && x.cylinderTypeId === cylinderTypeId);
    return { base: p.price, unit: account ? Math.min(account.price, slabPrice(p, qty)) : slabPrice(p, qty), negotiated: !!account, deliveryCharge: p.deliveryCharge };
  }

  quote(businessId: string, items: { cylinderTypeId: string; qty: number }[], slot: SlotType, paymentMethod: PaymentMethod = "upi") {
    const biz = this.business(businessId);
    if (!biz.assignedAgencyId) throw new EngineError("NO_AGENCY", "No agency assigned yet.");
    const agency = this.agency(biz.assignedAgencyId);
    if (agency.status !== "approved") throw new EngineError("AGENCY_UNAVAILABLE", "Your agency is not accepting orders right now.");
    const priced = items.map((i) => {
      const p = this.priceFor(agency.id, businessId, i.cylinderTypeId, i.qty);
      return { ...i, unitPrice: p.unit, basePrice: p.base, negotiated: p.negotiated, name: this.cylinderName(i.cylinderTypeId) };
    });
    const delivery = this.state.prices.find((x) => x.agencyId === agency.id)?.deliveryCharge ?? 0;
    const charges = computeCharges(priced, priced.map((p) => p.basePrice), slot, delivery, this.config);
    const violation = this.demo.bypassRules ? null : checkOrderRules(biz, this.state.bookings, items, charges.total, paymentMethod, this.config, this.now());
    const outstanding = creditOutstanding(this.state.bookings, businessId);
    return {
      charges,
      violation,
      items: priced,
      agency: this.agencyCard(agency),
      codAllowed: agency.codEnabled,
      creditAllowed: agency.creditEnabled && biz.credit.status === "approved",
      creditStatus: biz.credit.status,
      creditAvailable: biz.credit.status === "approved" ? Math.max(0, biz.credit.limit - outstanding) : 0,
      creditTermDays: biz.credit.termDays,
    };
  }

  createBooking(input: CreateBookingInput): Booking {
    const q = this.quote(input.businessId, input.items, input.slot, input.paymentMethod);
    if (q.violation) throw new EngineError(q.violation.code, q.violation.message, 422);
    if (input.paymentMethod === "cod" && !q.codAllowed) throw new EngineError("COD_DISABLED", "This agency does not accept cash on delivery.");
    if (input.paymentMethod === "credit" && !q.creditAllowed) throw new EngineError("CREDIT_DISABLED", "Credit ordering is not available for this account.");
    const biz = this.business(input.businessId);
    const outletId = biz.outlets.some((o) => o.id === input.outletId) ? input.outletId : biz.defaultOutletId;
    const online = ["upi", "card", "netbanking"].includes(input.paymentMethod);
    const now = this.now();
    const qty = input.items.reduce((s, i) => s + i.qty, 0);
    const b: Booking = {
      id: this.id("bk"),
      code: `GS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      businessId: input.businessId,
      agencyId: biz.assignedAgencyId!,
      outletId,
      items: q.items.map(({ cylinderTypeId, qty, unitPrice }) => ({ cylinderTypeId, qty, unitPrice })),
      slot: input.slot,
      charges: q.charges,
      payment: { method: input.paymentMethod, status: online ? "PENDING" : input.paymentMethod === "cod" ? "COD_PENDING" : "CREDIT_DUE" },
      status: online ? "PENDING_PAYMENT" : "PLACED",
      statusHistory: [],
      deliveryOtp: String(1000 + Math.floor(Math.random() * 9000)),
      assignedStaffId: null,
      eta: new Date(now.getTime() + slotEtaHours(input.slot) * 3_600_000).toISOString(),
      etaMinutes: null,
      emptiesToCollect: input.emptiesToCollect ?? qty,
      emptiesCollected: 0,
      standingOrderId: input.standingOrderId,
      invoiceNo: `INV-${String(++this.invoiceSeq).padStart(5, "0")}`,
      createdAt: this.iso(now),
    };
    b.statusHistory.push({ status: b.status, at: b.createdAt, by: "business" });
    this.state.bookings.push(b);
    if (!online) this.afterPlaced(b);
    else this.emit({ type: "booking.updated", booking: b });
    return b;
  }

  recordPayment(bookingId: string, result: { ok: boolean; paymentId?: string; method?: PaymentMethod; error?: string }) {
    const b = this.booking(bookingId);
    if (!["PENDING_PAYMENT", "PAYMENT_FAILED"].includes(b.status)) throw new EngineError("BAD_STATE", "Order is not awaiting payment.");
    const ok = this.demo.forceNextPaymentFail ? false : result.ok;
    this.demo.forceNextPaymentFail = false;
    if (result.method && result.method !== "cod" && result.method !== "credit") b.payment.method = result.method;
    if (ok) {
      b.payment = { ...b.payment, status: "PAID", gatewayRef: result.paymentId ?? `pay_mock_${Date.now().toString(36)}`, paidAt: this.iso() };
      this.transition(b, "PLACED", "gateway");
      this.afterPlaced(b);
    } else {
      b.payment.status = "FAILED";
      this.transition(b, "PAYMENT_FAILED", "gateway", result.error ?? "Payment declined by bank");
    }
    return b;
  }
  retryPayment(bookingId: string) {
    const b = this.booking(bookingId);
    if (b.status !== "PAYMENT_FAILED") throw new EngineError("BAD_STATE", "Nothing to retry.");
    b.payment.status = "PENDING";
    this.transition(b, "PENDING_PAYMENT", "business");
    return b;
  }
  switchPayment(bookingId: string, method: "cod" | "credit") {
    const b = this.booking(bookingId);
    if (!["PENDING_PAYMENT", "PAYMENT_FAILED"].includes(b.status)) throw new EngineError("BAD_STATE", "Order is not awaiting payment.");
    const agency = this.agency(b.agencyId);
    const biz = this.business(b.businessId);
    if (method === "cod" && !agency.codEnabled) throw new EngineError("COD_DISABLED", "This agency does not accept cash on delivery.");
    if (method === "credit") {
      const v = this.demo.bypassRules ? null : checkOrderRules(biz, this.state.bookings, b.items, b.charges.total, "credit", this.config, this.now());
      if (v) throw new EngineError(v.code, v.message, 422);
      if (!agency.creditEnabled) throw new EngineError("CREDIT_DISABLED", "This agency does not offer credit.");
    }
    b.payment = method === "cod" ? { method: "cod", status: "COD_PENDING" } : { method: "credit", status: "CREDIT_DUE" };
    this.transition(b, "PLACED", "business", method === "cod" ? "Switched to cash on delivery" : "Switched to credit");
    this.afterPlaced(b);
    return b;
  }

  private afterPlaced(b: Booking) {
    const agency = this.agency(b.agencyId);
    this.emit({ type: "booking.created", booking: b });
    this.notify(b.businessId, "Order placed", `${agency.name} has received ${b.code} (${this.describeItems(b)}). Delivery OTP: ${b.deliveryOtp}.`, "status", b.id);
    this.notify(agency.ownerUserId, "New order", `${this.business(b.businessId).name}: ${this.describeItems(b)} · ${b.slot === "express" ? "Express" : b.slot.replace(/_/g, " ")} · ${b.payment.method === "credit" ? "on credit" : b.payment.method === "cod" ? "COD" : "prepaid"}.`, "status", b.id);
  }
  describeItems(b: Booking) {
    return b.items.map((i) => `${i.qty} × ${this.cylinderName(i.cylinderTypeId).replace(" Commercial", "")}`).join(" + ");
  }

  transition(b: Booking, to: BookingStatus, by: string, note?: string) {
    assertTransition(b.status, to);
    b.status = to;
    b.statusHistory.push({ status: to, at: this.iso(), by, note });
    this.emit({ type: "booking.updated", booking: b });
    return b;
  }

  accept(bookingId: string, by = "agency") {
    const b = this.booking(bookingId);
    this.transition(b, "ACCEPTED", by);
    this.notify(b.businessId, "Order accepted", `${this.agency(b.agencyId).name} accepted ${b.code}. Assigning a delivery partner.`, "status", b.id);
    return b;
  }
  reject(bookingId: string, reason: string, by = "agency") {
    const b = this.booking(bookingId);
    b.rejectReason = reason;
    if (b.payment.status === "PAID") b.payment.status = "REFUNDED";
    this.transition(b, "REJECTED", by, reason);
    this.notify(b.businessId, "Order rejected", `${this.agency(b.agencyId).name} could not take ${b.code}: ${reason}.${b.payment.status === "REFUNDED" ? " Refund initiated." : ""}`, "status", b.id);
    return b;
  }
  cancel(bookingId: string, reason: string, by: "business" | "agency" = "business") {
    const b = this.booking(bookingId);
    if (!canCancel(b.status)) throw new EngineError("BAD_STATE", `Cannot cancel an order that is ${STATUS_LABELS[b.status].toLowerCase()}.`);
    b.cancelReason = reason;
    if (b.payment.status === "PAID") b.payment.status = "REFUNDED";
    b.assignedStaffId = null;
    this.transition(b, "CANCELLED", by, reason);
    this.notify(b.businessId, "Order cancelled", `${b.code} was cancelled.${b.payment.status === "REFUNDED" ? ` Refund of ₹${b.charges.total} initiated.` : ""}`, "status", b.id);
    return b;
  }
  assign(bookingId: string, staffId: string, by = "agency") {
    const b = this.booking(bookingId);
    const s = this.staff(staffId);
    if (s.agencyId !== b.agencyId) throw new EngineError("WRONG_AGENCY", "Staff belongs to another agency.");
    if (b.status === "ASSIGNED") {
      b.assignedStaffId = staffId;
      b.statusHistory.push({ status: "ASSIGNED", at: this.iso(), by, note: `Reassigned to ${this.user(s.userId).name}` });
      this.emit({ type: "booking.updated", booking: b });
      return b;
    }
    if (b.status === "PLACED") this.accept(bookingId, by);
    b.assignedStaffId = staffId;
    this.transition(b, "ASSIGNED", by, `Assigned to ${this.user(s.userId).name}`);
    this.notify(b.businessId, "Delivery partner assigned", `${this.user(s.userId).name} will deliver ${b.code}.`, "status", b.id);
    this.notify(s.userId, "New drop assigned", `${this.business(b.businessId).name} · ${this.describeItems(b)} · ${this.outletOf(b).line2 ?? ""}`, "status", b.id);
    return b;
  }
  /** Fewest current cylinders on the vehicle wins; ties → online first, then higher on-time %. */
  autoAssign(bookingId: string, by = "agency") {
    const b = this.booking(bookingId);
    const pool = this.state.staff.filter((s) => s.agencyId === b.agencyId).map((s) => this.expandStaff(s));
    if (!pool.length) throw new EngineError("NO_STAFF", "No delivery staff available.");
    pool.sort((x, y) => x.currentDrops - y.currentDrops || Number(y.online) - Number(x.online) || y.onTimePct - x.onTimePct);
    return this.assign(bookingId, pool[0].id, by);
  }
  unassign(bookingId: string) {
    const b = this.booking(bookingId);
    b.assignedStaffId = null;
    this.transition(b, "ACCEPTED", "agency", "Unassigned");
    return b;
  }

  // ---------- delivery ----------
  startTrip(bookingId: string, by = "delivery") {
    const b = this.booking(bookingId);
    if (!b.assignedStaffId) throw new EngineError("NO_STAFF", "Assign a delivery partner first.");
    const s = this.staff(b.assignedStaffId);
    const existing = this.trips.get(s.id);
    if (existing && existing.bookingId !== b.id) {
      const other = this.booking(existing.bookingId);
      if (other.status === "OUT_FOR_DELIVERY") throw new EngineError("BUSY", `Finish the current drop (${other.code}) first.`);
    }
    const route = buildRoute(s.currentLocation, this.outletOf(b), ROUTE_POINTS, b.id.length);
    this.trips.set(s.id, { staffId: s.id, bookingId: b.id, agencyId: b.agencyId, route, index: 0, startedAt: this.iso() });
    s.online = true;
    b.etaMinutes = this.etaFor(0, route.length);
    b.eta = new Date(this.now().getTime() + b.etaMinutes * 60_000).toISOString();
    if (b.status !== "OUT_FOR_DELIVERY") this.transition(b, "OUT_FOR_DELIVERY", by);
    else this.emit({ type: "booking.updated", booking: b });
    this.emit({ type: "staff.updated", staff: s });
    this.notify(b.businessId, "Out for delivery", `${this.user(s.userId).name} is on the way with ${this.describeItems(b)}. Share OTP ${b.deliveryOtp} at the outlet.`, "status", b.id);
    return this.expandBooking(b);
  }
  private etaFor(index: number, total: number) {
    return Math.max(0, Math.round(18 * (1 - index / (total - 1))));
  }

  completeDelivery(bookingId: string, input: { otp: string; cashCollected?: boolean; emptiesCollected?: number }, by = "delivery") {
    const b = this.booking(bookingId);
    if (b.status !== "OUT_FOR_DELIVERY") throw new EngineError("BAD_STATE", "Order is not out for delivery.");
    if (input.otp.trim() !== b.deliveryOtp) throw new EngineError("BAD_OTP", "Incorrect delivery OTP. Ask the outlet manager for the 4-digit code in their app.", 422);
    if (b.payment.method === "cod" && !input.cashCollected) throw new EngineError("CASH", "Confirm that cash was collected.", 422);
    const now = this.now();
    const qty = b.items.reduce((s, i) => s + i.qty, 0);
    b.deliveredAt = this.iso(now);
    b.emptiesCollected = Math.max(0, Math.min(50, input.emptiesCollected ?? b.emptiesToCollect));
    b.etaMinutes = 0;
    if (b.payment.method === "cod") {
      b.payment.status = "COD_COLLECTED";
      if (b.assignedStaffId) this.staff(b.assignedStaffId).cashInHand += b.charges.total;
    }
    if (b.payment.method === "credit") {
      const biz = this.business(b.businessId);
      b.payment.dueAt = new Date(now.getTime() + biz.credit.termDays * DAY).toISOString();
      this.state.ledger.push({ id: this.id("led"), businessId: b.businessId, agencyId: b.agencyId, kind: "invoice", bookingId: b.id, amount: b.charges.total, dueAt: b.payment.dueAt, note: b.invoiceNo, at: this.iso(now) });
    }
    this.transition(b, "DELIVERED", by);
    // agency inventory + cylinders out with the account
    for (const i of b.items) {
      const inv = this.state.inventory.find((x) => x.agencyId === b.agencyId && x.cylinderTypeId === i.cylinderTypeId);
      if (inv) {
        inv.filled = Math.max(0, inv.filled - i.qty);
        inv.withAccounts += i.qty;
      }
    }
    const inv19 = this.state.inventory.find((x) => x.agencyId === b.agencyId && x.cylinderTypeId === "cyl_19");
    if (inv19 && b.emptiesCollected) {
      inv19.empty += b.emptiesCollected;
      inv19.withAccounts = Math.max(0, inv19.withAccounts - b.emptiesCollected);
    }
    this.emit({ type: "inventory.updated", agencyId: b.agencyId });
    // outlet stock
    const outlet = this.outletOf(b);
    outlet.spareFull += qty;
    outlet.emptiesHeld = Math.max(0, outlet.emptiesHeld - b.emptiesCollected);
    // settlement (online + credit)
    if (b.payment.method !== "cod") {
      const econ = computeSettlement(b, this.config);
      const stl: Settlement = { id: this.id("stl"), bookingId: b.id, agencyId: b.agencyId, amount: b.charges.total, commission: econ.commission + econ.creditFee, convenienceFee: econ.convenienceFee, expressShare: econ.expressShare, netToAgency: econ.netToAgency, status: "pending", settledAt: null, createdAt: this.iso(now) };
      this.state.settlements.push(stl);
    }
    if (b.assignedStaffId) {
      const s = this.staff(b.assignedStaffId);
      const trip = this.trips.get(s.id);
      if (trip && trip.bookingId === b.id) {
        s.currentLocation = trip.route[trip.route.length - 1];
        this.trips.delete(s.id);
        this.emit({ type: "staff.updated", staff: s });
      }
    }
    const biz = this.business(b.businessId);
    outlet.cylindersPerWeek = estimateCylindersPerWeek(this.state.bookings.filter((x) => x.outletId === outlet.id), outlet.cylindersPerWeek, now);
    const invoiceMsg = b.payment.method === "credit" ? ` Invoice ${b.invoiceNo} ₹${Math.round(b.charges.total).toLocaleString("en-IN")} due ${new Date(b.payment.dueAt!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.` : ` Invoice ${b.invoiceNo} is in your app.`;
    this.notify(b.businessId, "Delivered ✅", `${b.code}: ${this.describeItems(b)} delivered, ${b.emptiesCollected} empties collected.${invoiceMsg}`, "status", b.id);
    this.notify(this.agency(b.agencyId).ownerUserId, "Delivered", `${b.code} · ${biz.name} · ${b.emptiesCollected} empties back.`, "status", b.id);
    this.emit({ type: "business.updated", businessId: b.businessId });
    return this.expandBooking(b);
  }

  failDelivery(bookingId: string, reason: DeliveryFailReason, notes?: string, by = "delivery") {
    const b = this.booking(bookingId);
    if (b.status !== "OUT_FOR_DELIVERY") throw new EngineError("BAD_STATE", "Order is not out for delivery.");
    b.failReason = reason;
    const label: Record<DeliveryFailReason, string> = { outlet_closed: "Outlet closed / no one to receive", wrong_address: "Wrong address", refused: "Outlet refused", other: "Other" };
    this.transition(b, "DELIVERY_FAILED", by, notes ? `${label[reason]} — ${notes}` : label[reason]);
    if (b.assignedStaffId) {
      const s = this.staff(b.assignedStaffId);
      const trip = this.trips.get(s.id);
      if (trip && trip.bookingId === b.id) {
        s.currentLocation = trip.route[trip.index];
        this.trips.delete(s.id);
        this.emit({ type: "staff.updated", staff: s });
      }
    }
    this.notify(b.businessId, "Delivery attempt failed", `${label[reason]}. Your agency will reschedule ${b.code}.`, "status", b.id);
    this.notify(this.agency(b.agencyId).ownerUserId, "Delivery failed", `${b.code}: ${label[reason]}. Back in your queue.`, "status", b.id);
    return this.expandBooking(b);
  }
  reschedule(bookingId: string) {
    const b = this.booking(bookingId);
    if (b.status !== "DELIVERY_FAILED") throw new EngineError("BAD_STATE", "Only failed deliveries can be rescheduled.");
    b.assignedStaffId = null;
    b.failReason = undefined;
    this.transition(b, "ACCEPTED", "agency", "Rescheduled");
    this.notify(b.businessId, "Delivery rescheduled", `${b.code} will be delivered again soon.`, "status", b.id);
    return b;
  }
  setStaffOnline(staffId: string, online: boolean) {
    const s = this.staff(staffId);
    s.online = online;
    this.emit({ type: "staff.updated", staff: s });
    return this.expandStaff(s);
  }
  depositCash(staffId: string) {
    const s = this.staff(staffId);
    const amount = s.cashInHand;
    s.cashInHand = 0;
    this.emit({ type: "staff.updated", staff: s });
    return { deposited: amount, staff: this.expandStaff(s) };
  }
  dropsFor(staffId: string) {
    const s = this.staff(staffId);
    const open = this.state.bookings.filter((b) => b.assignedStaffId === staffId && ["ASSIGNED", "OUT_FOR_DELIVERY"].includes(b.status));
    const ordered: Booking[] = [];
    let cur = s.currentLocation;
    const pool = [...open];
    const active = pool.find((b) => b.status === "OUT_FOR_DELIVERY");
    if (active) {
      ordered.push(active);
      pool.splice(pool.indexOf(active), 1);
      cur = this.outletOf(active);
    }
    while (pool.length) {
      pool.sort((a, b) => haversineKm(cur, this.outletOf(a)) - haversineKm(cur, this.outletOf(b)));
      const next = pool.shift()!;
      ordered.push(next);
      cur = this.outletOf(next);
    }
    const today = this.startOfToday();
    const done = this.state.bookings.filter((b) => b.assignedStaffId === staffId && new Date(b.createdAt) >= today && ["DELIVERED", "DELIVERY_FAILED"].includes(b.status));
    return { pending: ordered.map((b) => this.expandBooking(b)), done: done.map((b) => this.expandBooking(b)), staff: this.expandStaff(s), cylindersToLoad: ordered.reduce((x, b) => x + b.items.reduce((y, i) => y + i.qty, 0), 0) };
  }

  // ---------- route playback ----------
  private startTicker() {
    if (this.timer) return;
    let acc = 0;
    this.timer = setInterval(() => {
      acc += 100 * this.demo.speed;
      if (acc >= ROUTE_TICK_MS) {
        acc = 0;
        this.tick();
      }
    }, 100);
    (this.timer as { unref?: () => void }).unref?.();
  }
  private stopTicker() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  tick() {
    for (const trip of this.trips.values()) {
      if (trip.index >= trip.route.length - 1) continue;
      trip.index++;
      const s = this.staff(trip.staffId);
      s.currentLocation = trip.route[trip.index];
      const b = this.booking(trip.bookingId);
      b.etaMinutes = this.etaFor(trip.index, trip.route.length);
      this.emit({ type: "staff.location", staffId: s.id, agencyId: trip.agencyId, bookingId: trip.bookingId, location: s.currentLocation, etaMinutes: b.etaMinutes, progress: trip.index / (trip.route.length - 1) });
      if (trip.index === trip.route.length - 1) this.notify(b.businessId, "Arriving now", `${this.user(s.userId).name} has reached ${this.outletOf(b).label}. Keep OTP ${b.deliveryOtp} ready.`, "status", b.id);
    }
  }

  // ---------- notifications ----------
  notify(userId: string, title: string, body: string, type: Notification["type"], bookingId?: string) {
    const n: Notification = { id: this.id("ntf"), userId, title, body, type, read: false, bookingId, createdAt: this.iso() };
    this.state.notifications.unshift(n);
    this.emit({ type: "notification", notification: n });
    return n;
  }
  notificationsFor(userId: string) {
    return this.state.notifications.filter((n) => n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  markRead(userId: string, id?: string) {
    this.state.notifications.forEach((n) => {
      if (n.userId === userId && (!id || n.id === id)) n.read = true;
    });
    return this.notificationsFor(userId);
  }

  // ---------- complaints ----------
  createComplaint(businessId: string, input: { category: Complaint["category"]; text: string; bookingId?: string }) {
    const biz = this.business(businessId);
    const cmp: Complaint = { id: this.id("cmp"), businessId, agencyId: biz.assignedAgencyId ?? (input.bookingId ? this.booking(input.bookingId).agencyId : ""), category: input.category, text: input.text, bookingId: input.bookingId, status: "open", createdAt: this.iso(), updatedAt: this.iso() };
    this.state.complaints.unshift(cmp);
    this.notify(businessId, "Complaint registered", `Ticket ${cmp.id.toUpperCase()} is open. Account managers respond within 4 hours.`, "system");
    if (cmp.agencyId) this.notify(this.agency(cmp.agencyId).ownerUserId, "New complaint", `${biz.name}: ${input.text.slice(0, 60)}`, "system");
    return cmp;
  }
  updateComplaint(id: string, status: Complaint["status"]) {
    const cmp = this.state.complaints.find((x) => x.id === id);
    if (!cmp) throw notFound("Complaint");
    cmp.status = status;
    cmp.updatedAt = this.iso();
    if (status === "resolved") this.notify(cmp.businessId, "Complaint resolved", `Ticket ${cmp.id.toUpperCase()} has been resolved.`, "system");
    return cmp;
  }
  expandComplaint(c: Complaint) {
    const b = c.bookingId ? this.state.bookings.find((x) => x.id === c.bookingId) : undefined;
    const biz = this.state.businesses.find((x) => x.userId === c.businessId);
    return { ...c, businessName: biz?.name ?? "—", ownerName: this.user(c.businessId).name, contactPhone: this.user(c.businessId).phone, bookingCode: b?.code ?? null, agencyName: c.agencyId ? this.agency(c.agencyId).name : null };
  }

  // ---------- agency ops ----------
  agencyDashboard(agencyId: string) {
    const agency = this.agency(agencyId);
    const today = this.startOfToday();
    const all = this.state.bookings.filter((b) => b.agencyId === agencyId);
    const todays = all.filter((b) => new Date(b.createdAt) >= today);
    const openAll = all.filter((b) => isOpen(b.status));
    const cyl = (arr: Booking[]) => arr.reduce((s, b) => s + b.items.reduce((x, i) => x + i.qty, 0), 0);
    const accounts = this.state.businesses.filter((b) => b.assignedAgencyId === agencyId);
    const receivables = accounts.reduce((s, b) => s + creditOutstanding(this.state.bookings, b.userId), 0);
    const overdue = all.filter((b) => b.payment.method === "credit" && b.payment.status !== "CREDIT_PAID" && b.payment.dueAt && new Date(b.payment.dueAt) < this.now() && !["CANCELLED", "REJECTED"].includes(b.status)).reduce((s, b) => s + b.charges.total, 0);
    const days = (n: number) => {
      const out: { date: string; label: string; orders: number; cylinders: number; revenue: number; delivered: number }[] = [];
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * DAY);
        const next = new Date(d.getTime() + DAY);
        const inDay = all.filter((b) => new Date(b.createdAt) >= d && new Date(b.createdAt) < next);
        out.push({ date: d.toISOString(), label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), orders: inDay.length, cylinders: cyl(inDay), revenue: Math.round(inDay.filter((b) => b.status === "DELIVERED").reduce((s, b) => s + b.charges.total, 0)), delivered: inDay.filter((b) => b.status === "DELIVERED").length });
      }
      return out;
    };
    const mix = this.state.cylinderTypes.map((t) => ({ id: t.id, name: t.name, qty: all.filter((b) => new Date(b.createdAt) > new Date(today.getTime() - 30 * DAY)).reduce((s, b) => s + b.items.filter((i) => i.cylinderTypeId === t.id).reduce((x, i) => x + i.qty, 0), 0) }));
    const segments = Object.entries(accounts.reduce((m, b) => ((m[b.type] = (m[b.type] ?? 0) + 1), m), {} as Record<string, number>)).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    return {
      agency,
      kpis: {
        todayOrders: todays.length,
        todayCylinders: cyl(todays),
        pending: openAll.filter((b) => b.status === "PLACED").length,
        accepted: openAll.filter((b) => ["ACCEPTED", "ASSIGNED"].includes(b.status)).length,
        outForDelivery: openAll.filter((b) => b.status === "OUT_FOR_DELIVERY").length,
        deliveredToday: todays.filter((b) => b.status === "DELIVERED").length,
        revenueToday: todays.filter((b) => b.status === "DELIVERED").reduce((s, b) => s + b.charges.total, 0),
        revenue30: all.filter((b) => b.status === "DELIVERED" && new Date(b.createdAt) > new Date(today.getTime() - 30 * DAY)).reduce((s, b) => s + b.charges.total, 0),
        codOutstanding: this.state.staff.filter((s) => s.agencyId === agencyId).reduce((s, x) => s + x.cashInHand, 0),
        receivables,
        overdue,
        accounts: accounts.length,
        creditAccounts: accounts.filter((b) => b.credit.status === "approved").length,
        failedToday: todays.filter((b) => b.status === "DELIVERY_FAILED").length,
      },
      series7: days(7),
      series30: days(30),
      cylinderMix: mix,
      segments,
      staff: this.state.staff.filter((s) => s.agencyId === agencyId).map((s) => this.expandStaff(s)),
      lowStock: this.state.inventory.filter((i) => i.agencyId === agencyId && i.filled <= i.lowStockThreshold).map((i) => ({ ...i, name: this.cylinderName(i.cylinderTypeId) })),
      lowStockAccounts: accounts.map((b) => this.expandBusiness(b)).filter((b) => b.lowStockOutlets > 0).slice(0, 6),
      recent: all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((b) => this.expandBooking(b)),
    };
  }

  agencyAccounts(agencyId: string) {
    return this.state.businesses
      .filter((b) => b.assignedAgencyId === agencyId)
      .map((b) => this.expandBusiness(b))
      .sort((a, b) => b.spend30 - a.spend30);
  }
  runCampaign(agencyId: string, businessIds: string[]) {
    const agency = this.agency(agencyId);
    let sent = 0;
    for (const id of businessIds) {
      const b = this.state.businesses.find((x) => x.userId === id && x.assignedAgencyId === agencyId);
      if (!b) continue;
      this.notify(id, "Running low?", `${agency.name}: your outlet looks close to running out. Reorder now for a before-opening delivery tomorrow.`, "stock");
      sent++;
    }
    return { sent };
  }
  setAccountPrice(agencyId: string, businessId: string, cylinderTypeId: string, price: number | null) {
    this.state.accountPrices = this.state.accountPrices.filter((p) => !(p.agencyId === agencyId && p.businessId === businessId && p.cylinderTypeId === cylinderTypeId));
    if (price != null) this.state.accountPrices.push({ agencyId, businessId, cylinderTypeId, price });
    this.notify(businessId, "Negotiated price updated", price != null ? `${this.agency(agencyId).name} set your ${this.cylinderName(cylinderTypeId)} price to ₹${price}.` : "Your negotiated price was removed; slab pricing applies.", "billing");
    return this.state.accountPrices.filter((p) => p.agencyId === agencyId);
  }

  agencyInventory(agencyId: string) {
    return {
      stock: this.state.inventory.filter((i) => i.agencyId === agencyId).map((i) => ({ ...i, name: this.cylinderName(i.cylinderTypeId), low: i.filled <= i.lowStockThreshold })),
      entries: this.state.inventoryEntries.filter((e) => e.agencyId === agencyId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40).map((e) => ({ ...e, name: this.cylinderName(e.cylinderTypeId) })),
      emptiesHeldByAccounts: this.state.businesses.filter((b) => b.assignedAgencyId === agencyId).map((b) => ({ businessId: b.userId, name: b.name, empties: b.outlets.reduce((s, o) => s + o.emptiesHeld, 0), inUse: b.outlets.reduce((s, o) => s + o.inUse + o.spareFull, 0) })).filter((x) => x.empties > 0).sort((a, b) => b.empties - a.empties).slice(0, 10),
    };
  }
  addInventoryEntry(agencyId: string, input: { cylinderTypeId: string; kind: "in" | "out"; qty: number; note?: string }) {
    const inv = this.state.inventory.find((i) => i.agencyId === agencyId && i.cylinderTypeId === input.cylinderTypeId);
    if (!inv) throw notFound("Inventory row");
    if (input.kind === "in") {
      inv.filled += input.qty;
      inv.empty = Math.max(0, inv.empty - input.qty);
    } else {
      if (inv.filled < input.qty) throw new EngineError("STOCK", `Only ${inv.filled} filled cylinders in stock.`);
      inv.filled -= input.qty;
      inv.empty += input.qty;
    }
    this.state.inventoryEntries.unshift({ id: this.id("ie"), agencyId, ...input, at: this.iso() });
    this.emit({ type: "inventory.updated", agencyId });
    return this.agencyInventory(agencyId);
  }
  updateAgency(agencyId: string, patch: Partial<Pick<Agency, "name" | "phone" | "codEnabled" | "creditEnabled" | "slots" | "serviceArea" | "plan">>) {
    const a = this.agency(agencyId);
    Object.assign(a, patch);
    this.emit({ type: "agency.updated", agencyId });
    return a;
  }
  updatePrices(agencyId: string, rows: { cylinderTypeId: string; price: number; deliveryCharge: number; slabs?: { minQty: number; price: number }[] }[]) {
    for (const r of rows) {
      const p = this.state.prices.find((x) => x.agencyId === agencyId && x.cylinderTypeId === r.cylinderTypeId);
      if (p) {
        p.price = r.price;
        p.deliveryCharge = r.deliveryCharge;
        if (r.slabs) p.slabs = r.slabs;
      }
    }
    this.emit({ type: "agency.updated", agencyId });
    return this.state.prices.filter((p) => p.agencyId === agencyId);
  }
  upsertStaff(agencyId: string, input: { id?: string; name: string; phone: string; vehicle: string; vehicleNo: string }) {
    if (input.id) {
      const s = this.staff(input.id);
      const u = this.user(s.userId);
      u.name = input.name;
      u.phone = input.phone;
      s.vehicle = input.vehicle;
      s.vehicleNo = input.vehicleNo;
      this.emit({ type: "staff.updated", staff: s });
      return this.expandStaff(s);
    }
    const agency = this.agency(agencyId);
    const u: User = { id: this.id("usr"), role: "delivery", name: input.name, phone: input.phone, language: "en", avatarColor: "#C6953F" };
    this.state.users.push(u);
    const s: DeliveryStaff = { id: this.id("stf"), userId: u.id, agencyId, vehicle: input.vehicle, vehicleNo: input.vehicleNo, online: false, currentLocation: { ...agency.serviceArea.center }, onTimePct: 100, failedPct: 0, cashInHand: 0 };
    this.state.staff.push(s);
    this.emit({ type: "staff.updated", staff: s });
    return this.expandStaff(s);
  }

  agencySettlements(agencyId: string) {
    const rows = this.state.settlements.filter((s) => s.agencyId === agencyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const bookings = this.state.bookings.filter((b) => b.agencyId === agencyId);
    const cod = bookings.filter((b) => b.payment.method === "cod" && ["COD_COLLECTED", "COD_PENDING"].includes(b.payment.status) && new Date(b.createdAt) > new Date(this.now().getTime() - 7 * DAY));
    const sum = (arr: Settlement[], k: keyof Settlement) => arr.reduce((s, r) => s + (r[k] as number), 0);
    const settled = rows.filter((r) => r.status === "settled");
    const pending = rows.filter((r) => r.status === "pending");
    const payoutMap = new Map<string, { date: string; count: number; gross: number; commission: number; net: number }>();
    for (const r of settled) {
      const k = r.settledAt!.slice(0, 10);
      const p = payoutMap.get(k) ?? { date: r.settledAt!, count: 0, gross: 0, commission: 0, net: 0 };
      p.count++;
      p.gross += r.amount;
      p.commission += r.commission + r.convenienceFee;
      p.net += r.netToAgency;
      payoutMap.set(k, p);
    }
    const now = this.now();
    const creditInvoices = bookings.filter((b) => b.payment.method === "credit" && b.status === "DELIVERED").sort((a, b) => (b.payment.dueAt ?? "").localeCompare(a.payment.dueAt ?? ""));
    const receivables = creditInvoices.filter((b) => b.payment.status !== "CREDIT_PAID");
    return {
      summary: { gross: sum(rows, "amount"), commission: sum(rows, "commission"), convenience: sum(rows, "convenienceFee"), expressShare: sum(rows, "expressShare"), net: sum(rows, "netToAgency"), pendingNet: sum(pending, "netToAgency"), settledNet: sum(settled, "netToAgency"), receivables: receivables.reduce((s, b) => s + b.charges.total, 0), overdue: receivables.filter((b) => b.payment.dueAt && new Date(b.payment.dueAt) < now).reduce((s, b) => s + b.charges.total, 0), collected30: creditInvoices.filter((b) => b.payment.status === "CREDIT_PAID" && b.payment.paidAt && new Date(b.payment.paidAt) > new Date(now.getTime() - 30 * DAY)).reduce((s, b) => s + b.charges.total, 0) },
      rows: rows.slice(0, 60).map((r) => ({ ...r, bookingCode: this.state.bookings.find((b) => b.id === r.bookingId)?.code ?? r.bookingId })),
      payouts: [...payoutMap.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
      cod: cod.map((b) => this.expandBooking(b)),
      codCollected: cod.filter((b) => b.payment.status === "COD_COLLECTED").reduce((s, b) => s + b.charges.total, 0),
      codPending: cod.filter((b) => b.payment.status === "COD_PENDING").reduce((s, b) => s + b.charges.total, 0),
      receivables: receivables.slice(0, 80).map((b) => ({ ...this.expandBooking(b), overdueDays: b.payment.dueAt ? Math.max(0, Math.floor((now.getTime() - new Date(b.payment.dueAt).getTime()) / DAY)) : 0 })),
      aging: [
        { bucket: "Not due", amount: receivables.filter((b) => !b.payment.dueAt || new Date(b.payment.dueAt) >= now).reduce((s, b) => s + b.charges.total, 0) },
        { bucket: "1–15 days", amount: receivables.filter((b) => b.payment.dueAt && new Date(b.payment.dueAt) < now && now.getTime() - new Date(b.payment.dueAt).getTime() <= 15 * DAY).reduce((s, b) => s + b.charges.total, 0) },
        { bucket: "16–30 days", amount: receivables.filter((b) => b.payment.dueAt && now.getTime() - new Date(b.payment.dueAt).getTime() > 15 * DAY && now.getTime() - new Date(b.payment.dueAt).getTime() <= 30 * DAY).reduce((s, b) => s + b.charges.total, 0) },
        { bucket: "30+ days", amount: receivables.filter((b) => b.payment.dueAt && now.getTime() - new Date(b.payment.dueAt).getTime() > 30 * DAY).reduce((s, b) => s + b.charges.total, 0) },
      ].map((x) => ({ ...x, amount: Math.round(x.amount) })),
    };
  }

  registerAgency(input: { name: string; omc: Agency["omc"]; distributorCode: string; gstin: string; ownerName: string; ownerPhone: string; ownerEmail: string; pincodes: string[]; center: LatLng; radiusKm: number; area: string }) {
    const owner: User = { id: this.id("usr"), role: "agency_owner", name: input.ownerName, phone: input.ownerPhone, email: input.ownerEmail, language: "en", avatarColor: "#620A1A" };
    this.state.users.push(owner);
    const a: Agency = {
      id: this.id("ag"),
      name: input.name,
      omc: input.omc,
      area: input.area,
      distributorCode: input.distributorCode,
      gstin: input.gstin,
      ownerUserId: owner.id,
      phone: input.ownerPhone,
      status: "pending",
      serviceArea: { pincodes: input.pincodes, center: input.center, radiusKm: input.radiusKm },
      rating: 0,
      codEnabled: true,
      creditEnabled: true,
      slots: [
        { id: "standard", label: "Standard (next day)", capacity: 100 },
        { id: "tomorrow_morning", label: "Before opening (6–9 AM)", capacity: 40 },
        { id: "tomorrow_evening", label: "Evening (4–8 PM)", capacity: 40 },
        { id: "express", label: "Express (3 hrs)", capacity: 10 },
      ],
      plan: "free",
      createdAt: this.iso(),
    };
    this.state.agencies.push(a);
    for (const t of this.state.cylinderTypes) {
      const base = t.id === "cyl_19" ? 1750 : 4350;
      this.state.prices.push({ agencyId: a.id, cylinderTypeId: t.id, price: base, slabs: t.id === "cyl_19" ? [{ minQty: 5, price: base - 25 }, { minQty: 10, price: base - 50 }] : [{ minQty: 3, price: base - 60 }], deliveryCharge: 40 });
      this.state.inventory.push({ agencyId: a.id, cylinderTypeId: t.id, filled: 0, empty: 0, withAccounts: 0, lowStockThreshold: t.id === "cyl_19" ? 40 : 10 });
    }
    this.notify(this.state.demo.adminUserId, "New agency registration", `${a.name} (${a.omc}) is awaiting KYC approval.`, "system");
    this.emit({ type: "agency.updated", agencyId: a.id });
    return a;
  }

  // ---------- admin ----------
  setAgencyStatus(agencyId: string, status: Agency["status"]) {
    const a = this.agency(agencyId);
    a.status = status;
    if (status === "approved" && a.rating === 0) a.rating = 4.2;
    this.notify(a.ownerUserId, status === "approved" ? "Agency approved 🎉" : status === "suspended" ? "Agency suspended" : "Agency status updated", status === "approved" ? "You can now receive commercial orders on GasSetu." : "Please contact platform support.", "system");
    this.emit({ type: "agency.updated", agencyId });
    return a;
  }
  updateConfig(patch: Partial<PlatformConfig>) {
    Object.assign(this.state.config, patch);
    return this.state.config;
  }
  adminBusinesses(q = "") {
    const s = q.toLowerCase();
    return this.state.businesses
      .map((b) => this.expandBusiness(b))
      .filter((b) => !s || b.name.toLowerCase().includes(s) || b.ownerName.toLowerCase().includes(s) || b.phone.includes(s) || (b.agencyName ?? "").toLowerCase().includes(s) || b.type.includes(s))
      .sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1) || (a.credit.status === "requested" ? -1 : 1) - (b.credit.status === "requested" ? -1 : 1) || b.spend30 - a.spend30)
      .slice(0, 150);
  }
  adminOverview() {
    const today = this.startOfToday();
    const all = this.state.bookings;
    const delivered = all.filter((b) => b.status === "DELIVERED");
    const gmv = delivered.reduce((s, b) => s + b.charges.total, 0);
    let commission = 0, convenience = 0, express = 0, creditFee = 0;
    for (const b of delivered) {
      const e = computeSettlement(b, this.config);
      commission += e.commission;
      convenience += e.convenienceFee;
      express += e.expressPlatform;
      creditFee += e.creditFee;
    }
    const subscriptions = this.state.subscriptionInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
    const weeks: { label: string; orders: number; cylinders: number; gmv: number; revenue: number }[] = [];
    for (let w = 12; w >= 0; w--) {
      const start = new Date(today.getTime() - (w * 7 + 6) * DAY);
      const end = new Date(start.getTime() + 7 * DAY);
      const inW = all.filter((b) => new Date(b.createdAt) >= start && new Date(b.createdAt) < end);
      const dW = inW.filter((b) => b.status === "DELIVERED");
      weeks.push({ label: start.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), orders: inW.length, cylinders: inW.reduce((s, b) => s + b.items.reduce((x, i) => x + i.qty, 0), 0), gmv: Math.round(dW.reduce((s, b) => s + b.charges.total, 0)), revenue: Math.round(dW.reduce((s, b) => s + computeSettlement(b, this.config).platformRevenue, 0)) });
    }
    const activeBusinesses = new Set(all.filter((b) => new Date(b.createdAt) > new Date(today.getTime() - 30 * DAY)).map((b) => b.businessId)).size;
    const creditBook = this.state.businesses.reduce((s, b) => s + creditOutstanding(all, b.userId), 0);
    const cityHeat = this.state.agencies.map((a) => ({ id: a.id, name: a.name, area: a.area, omc: a.omc, status: a.status, center: a.serviceArea.center, orders30: all.filter((b) => b.agencyId === a.id && new Date(b.createdAt) > new Date(today.getTime() - 30 * DAY)).length, gmv30: Math.round(all.filter((b) => b.agencyId === a.id && b.status === "DELIVERED" && new Date(b.createdAt) > new Date(today.getTime() - 30 * DAY)).reduce((s, b) => s + b.charges.total, 0)), rating: a.rating, plan: a.plan, accounts: this.state.businesses.filter((b) => b.assignedAgencyId === a.id).length }));
    const segments = Object.entries(this.state.businesses.reduce((m, b) => ((m[b.type] = (m[b.type] ?? 0) + 1), m), {} as Record<string, number>)).map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count);
    return {
      kpis: {
        gmv,
        orders: all.length,
        ordersToday: all.filter((b) => new Date(b.createdAt) >= today).length,
        cylinders: delivered.reduce((s, b) => s + b.items.reduce((x, i) => x + i.qty, 0), 0),
        activeBusinesses,
        totalBusinesses: this.state.businesses.length,
        pendingBusinesses: this.state.businesses.filter((b) => b.status === "pending").length,
        creditRequests: this.state.businesses.filter((b) => b.credit.status === "requested").length,
        creditAccounts: this.state.businesses.filter((b) => b.credit.status === "approved").length,
        creditBook: Math.round(creditBook),
        activeAgencies: this.state.agencies.filter((a) => a.status === "approved").length,
        pendingAgencies: this.state.agencies.filter((a) => a.status === "pending").length,
        platformRevenue: Math.round(commission + convenience + express + creditFee + subscriptions),
        openComplaints: this.state.complaints.filter((c) => c.status !== "resolved").length,
      },
      revenueSplit: [
        { stream: `Commission (${this.config.commissionPct}% online + credit)`, amount: Math.round(commission) },
        { stream: `Credit facilitation fee (${this.config.creditFeePct}%)`, amount: Math.round(creditFee) },
        { stream: "Convenience fees", amount: Math.round(convenience) },
        { stream: "Express fee share", amount: Math.round(express) },
        { stream: "SaaS subscriptions", amount: Math.round(subscriptions) },
      ],
      weekly: weeks,
      cityHeat,
      segments,
      config: this.config,
    };
  }

  // ---------- demo controls (§6.5) ----------
  advance(bookingId: string) {
    const b = this.booking(bookingId);
    const next = nextHappyStatus(b.status);
    if (!next) throw new EngineError("TERMINAL", `Order is already ${STATUS_LABELS[b.status].toLowerCase()}.`);
    switch (next) {
      case "PLACED":
        if (b.status === "PAYMENT_FAILED") this.retryPayment(b.id);
        return this.recordPayment(b.id, { ok: true, paymentId: `pay_mock_demo${Date.now().toString(36)}` });
      case "ACCEPTED":
        return b.status === "DELIVERY_FAILED" ? this.reschedule(b.id) : this.accept(b.id, "demo");
      case "ASSIGNED":
        return this.autoAssign(b.id, "demo");
      case "OUT_FOR_DELIVERY":
        return this.startTrip(b.id, "demo");
      case "DELIVERED": {
        const s = b.assignedStaffId ? this.trips.get(b.assignedStaffId) : undefined;
        if (s) s.index = s.route.length - 1;
        return this.completeDelivery(b.id, { otp: b.deliveryOtp, cashCollected: true, emptiesCollected: b.emptiesToCollect }, "demo");
      }
      default:
        throw new EngineError("TERMINAL", "No next step.");
    }
  }

  simulate(kind: SimulationKind, agencyId = this.state.demo.sureshAgencyId) {
    switch (kind) {
      case "payment_failure": {
        const pending = this.state.bookings.filter((b) => b.status === "PENDING_PAYMENT").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (pending) {
          this.recordPayment(pending.id, { ok: false, error: "Simulated: bank declined the transaction" });
          return { message: `Payment for ${pending.code} marked failed.` };
        }
        this.demo.forceNextPaymentFail = true;
        return { message: "Next checkout will fail." };
      }
      case "delivery_failure": {
        const b = this.state.bookings.filter((x) => x.agencyId === agencyId && x.status === "OUT_FOR_DELIVERY").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (!b) throw new EngineError("NONE", "No order is out for delivery right now.");
        this.failDelivery(b.id, "outlet_closed", "Simulated from demo controls");
        return { message: `${b.code} marked delivery failed.` };
      }
      case "low_stock": {
        const inv = this.state.inventory.find((i) => i.agencyId === agencyId && i.cylinderTypeId === "cyl_19");
        if (inv) inv.filled = Math.max(0, Math.min(inv.filled, inv.lowStockThreshold - 10));
        this.emit({ type: "inventory.updated", agencyId });
        this.notify(this.agency(agencyId).ownerUserId, "Low stock alert", "19 kg cylinders are below the reorder threshold.", "system");
        // and one account about to run out
        const imran = this.business(this.state.demo.imranId);
        imran.outlets[0].spareFull = 0;
        this.notify(imran.userId, "Low stock at Main kitchen", "Less than a day of LPG left. Reorder now.", "stock");
        this.emit({ type: "business.updated", businessId: imran.userId });
        return { message: "19 kg agency stock below threshold; Imran's main kitchen at <1 day." };
      }
      case "order_burst": {
        const bizs = this.state.businesses.filter((b) => b.assignedAgencyId === agencyId && b.status === "verified");
        let n = 0;
        for (const biz of bizs) {
          if (n >= 5) break;
          const items = this.usualOrder(biz);
          const method: PaymentMethod = biz.credit.status === "approved" && n % 2 === 0 ? "credit" : n % 2 === 0 ? "upi" : this.agency(agencyId).codEnabled ? "cod" : "card";
          if (this.quote(biz.userId, items, "standard", method).violation) continue;
          const b = this.createBooking({ businessId: biz.userId, outletId: biz.defaultOutletId, items, slot: n % 3 === 0 ? "express" : "standard", paymentMethod: method });
          if (b.status === "PENDING_PAYMENT") this.recordPayment(b.id, { ok: true, paymentId: `pay_mock_burst${n}` });
          n++;
        }
        return { message: `${n} new orders placed.` };
      }
      case "overdue_invoice": {
        const imran = this.business(this.state.demo.imranId);
        const inv = this.state.bookings.filter((b) => b.businessId === imran.userId && b.payment.method === "credit" && b.payment.status === "CREDIT_DUE").sort((a, b) => (a.payment.dueAt ?? "").localeCompare(b.payment.dueAt ?? ""))[0];
        if (!inv) throw new EngineError("NONE", "No open credit invoice for Imran.");
        inv.payment.dueAt = new Date(this.now().getTime() - 3 * DAY).toISOString();
        inv.payment.status = "CREDIT_OVERDUE";
        this.notify(imran.userId, "Invoice overdue", `${inv.invoiceNo} (₹${Math.round(inv.charges.total).toLocaleString("en-IN")}) is 3 days overdue. Credit ordering is paused until it's cleared.`, "billing");
        this.emit({ type: "booking.updated", booking: inv });
        this.emit({ type: "business.updated", businessId: imran.userId });
        return { message: `${inv.invoiceNo} marked 3 days overdue.` };
      }
    }
  }

  setBypassRules(enabled: boolean) {
    this.demo.bypassRules = enabled;
    return this.demo;
  }
  setSpeed(speed: number) {
    this.demo.speed = Math.max(0.25, Math.min(10, speed));
    return this.demo;
  }
  personas() {
    const d = this.state.demo;
    return [
      { key: "imran", label: "Imran — Al-Madina Tiffin Centre (credit, 2 outlets)", role: "business", userId: d.imranId, phone: "9000000001" },
      { key: "fatima", label: "Fatima — Star Kitchens Cloud (credit requested)", role: "business", userId: d.fatimaId, phone: "9000000002" },
      { key: "ramesh", label: "Ramesh — delivery", role: "delivery", userId: d.rameshUserId, phone: "9000000003" },
      { key: "suresh", label: "Suresh — agency owner", role: "agency_owner", userId: d.sureshUserId, email: "suresh@demo" },
      { key: "admin", label: "Ops admin", role: "admin", userId: d.adminUserId, email: "admin@demo" },
    ];
  }
}
