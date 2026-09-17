import {
  assertTransition,
  buildRoute,
  canCancel,
  checkRefillRules,
  computeCharges,
  computeSettlement,
  estimateCycleDays,
  haversineKm,
  isOpen,
  nearestAgency,
  nextHappyStatus,
  slotEtaHours,
  STATUS_LABELS,
  type Address,
  type Agency,
  type Booking,
  type BookingStatus,
  type Complaint,
  type CreateBookingInput,
  type Customer,
  type DeliveryFailReason,
  type DeliveryStaff,
  type LatLng,
  type LiveEvent,
  type Notification,
  type PaymentMethod,
  type PlatformConfig,
  type Settlement,
  type SlotType,
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

export type SimulationKind = "payment_failure" | "delivery_failure" | "low_stock" | "order_burst";

export interface DemoState {
  speed: number;
  forceNextPaymentFail: boolean;
  /** Demo switch (§6.5): skip the min-gap / quota / duplicate-open checks so a persona can rebook freely on stage. */
  bypassRules: boolean;
}

/**
 * DemoEngine — the whole prototype's business logic in one in-memory object.
 * mock-api wraps it over HTTP/WS; the mobile app can run it locally as an offline fallback.
 */
export class DemoEngine {
  state!: SeedData;
  trips = new Map<string, TripRuntime>(); // keyed by staffId
  demo: DemoState = { speed: 1, forceNextPaymentFail: false, bypassRules: false };
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private counter = 1000;

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
    // seeded out-for-delivery orders get an in-progress trip so their markers move immediately
    for (const b of this.state.bookings) {
      if (b.status === "OUT_FOR_DELIVERY" && b.assignedStaffId && !this.trips.has(b.assignedStaffId)) {
        const s = this.staff(b.assignedStaffId);
        const route = buildRoute(s.currentLocation, this.addressOf(b), ROUTE_POINTS, b.id.length);
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
  customer(userId: string): Customer {
    const c = this.state.customers.find((x) => x.userId === userId);
    if (!c) throw notFound("Customer");
    return c;
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
  addressOf(b: Booking): Address {
    const c = this.customer(b.customerId);
    return c.addresses.find((a) => a.id === b.addressId) ?? c.addresses[0];
  }

  /** Booking expanded with names for display. */
  expandBooking(b: Booking) {
    const customer = this.customer(b.customerId);
    const user = this.user(b.customerId);
    const agency = this.agency(b.agencyId);
    const staff = b.assignedStaffId ? this.state.staff.find((s) => s.id === b.assignedStaffId) : undefined;
    const staffUser = staff ? this.user(staff.userId) : undefined;
    const trip = staff ? this.trips.get(staff.id) : undefined;
    return {
      ...b,
      customerName: user.name,
      customerPhone: user.phone,
      customerType: customer.type,
      address: this.addressOf(b),
      agencyName: agency.name,
      agencyPhone: agency.phone,
      agencyOmc: agency.omc,
      agencyLocation: agency.serviceArea.center,
      items: b.items.map((i) => ({ ...i, name: this.state.cylinderTypes.find((c) => c.id === i.cylinderTypeId)?.name ?? i.cylinderTypeId })),
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
      todayAssigned: todayBookings.length,
      todayDelivered: todayBookings.filter((b) => b.status === "DELIVERED").length,
      todayFailed: todayBookings.filter((b) => b.status === "DELIVERY_FAILED" || (b.status === "CANCELLED" && b.failReason)).length,
      activeBookingId: trip?.bookingId ?? mine.find((b) => b.status === "OUT_FOR_DELIVERY")?.id ?? null,
      tripProgress: trip ? trip.index / (trip.route.length - 1) : null,
    };
  }
  expandCustomer(c: Customer) {
    const u = this.user(c.userId);
    const mine = this.state.bookings.filter((b) => b.customerId === c.userId);
    const delivered = mine.filter((b) => b.status === "DELIVERED").sort((a, b) => (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""));
    const last = delivered[0];
    return {
      ...c,
      name: u.name,
      phone: u.phone,
      avatarColor: u.avatarColor,
      agencyName: c.assignedAgencyId ? this.agency(c.assignedAgencyId).name : null,
      totalBookings: mine.length,
      lastRefillAt: last?.deliveredAt ?? null,
      lastBooking: last ? this.expandBooking(last) : null,
    };
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
      user = { id: this.id("usr"), role: "customer", name: "", phone, language: "en", avatarColor: "#F26B1D" };
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
      case "customer": {
        const c = this.state.customers.find((x) => x.userId === user.id);
        return c ? this.expandCustomer(c) : null;
      }
      case "delivery":
        return this.expandStaff(this.staffByUser(user.id));
      case "agency_owner":
        return this.agencyByOwner(user.id);
      default:
        return null;
    }
  }

  // ---------- customer profile ----------
  upsertProfile(userId: string, input: { name: string; type: Customer["type"]; address: Omit<Address, "id" | "label" | "city"> & { label?: string } }) {
    const user = this.user(userId);
    user.name = input.name;
    let c = this.state.customers.find((x) => x.userId === userId);
    const addr: Address = { id: this.id("adr"), label: input.address.label ?? (input.type === "commercial" ? "Shop" : "Home"), city: "Hyderabad", ...input.address };
    if (!c) {
      c = {
        userId,
        type: input.type,
        addresses: [addr],
        defaultAddressId: addr.id,
        assignedAgencyId: null,
        reminder: { enabled: true, nextDate: null, autoBook: false, avgCycleDays: this.config.defaultCycleDays },
        createdAt: this.iso(),
      };
      this.state.customers.push(c);
    } else {
      c.type = input.type;
      c.addresses = [addr, ...c.addresses.slice(1)];
      c.defaultAddressId = addr.id;
    }
    return this.expandCustomer(c);
  }

  /** Mock consumer-number lookup: any consumer number maps to the OMC's agency nearest the customer. */
  linkConnection(userId: string, omc: Agency["omc"], consumerNo: string) {
    const c = this.customer(userId);
    if (consumerNo.replace(/\D/g, "").length < 6) throw new EngineError("BAD_CONSUMER", "Consumer number should be at least 6 digits.");
    const addr = c.addresses.find((a) => a.id === c.defaultAddressId) ?? c.addresses[0];
    const candidates = this.state.agencies.filter((a) => a.omc === omc && a.status === "approved");
    const agency = nearestAgency(candidates, addr, addr.pincode) ?? nearestAgency(this.state.agencies, addr, addr.pincode);
    if (!agency) throw new EngineError("NO_AGENCY", "No distributor found for this connection.");
    c.connection = { omc, consumerNo, lpgId: `17${consumerNo.padStart(15, "0").slice(-15)}` };
    c.assignedAgencyId = agency.id;
    return { agency: this.agencyCard(agency, addr), customer: this.expandCustomer(c) };
  }

  autoAssignAgency(userId: string) {
    const c = this.customer(userId);
    const addr = c.addresses.find((a) => a.id === c.defaultAddressId) ?? c.addresses[0];
    const agency = nearestAgency(this.state.agencies, addr, addr.pincode);
    if (!agency) throw new EngineError("NO_AGENCY", "No agency serves this area yet.");
    c.assignedAgencyId = agency.id;
    c.connection = undefined;
    return { agency: this.agencyCard(agency, addr), customer: this.expandCustomer(c) };
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
    const c = this.customer(userId);
    if (!c.assignedAgencyId) throw new EngineError("NO_AGENCY", "No agency assigned yet.");
    const existing = this.state.transferRequests.find((t) => t.customerId === userId && t.status === "pending");
    if (existing) throw new EngineError("DUPLICATE", "You already have a pending transfer request.");
    const req = { id: this.id("trf"), customerId: userId, fromAgencyId: c.assignedAgencyId, toAgencyId, reason, status: "pending" as const, createdAt: this.iso() };
    this.state.transferRequests.push(req);
    this.notify(userId, "Transfer request received", "Your agency and our team will review it within 2 working days.", "system");
    return req;
  }
  resolveTransfer(id: string, approve: boolean) {
    const t = this.state.transferRequests.find((x) => x.id === id);
    if (!t) throw notFound("Transfer request");
    t.status = approve ? "approved" : "rejected";
    if (approve) {
      const c = this.customer(t.customerId);
      c.assignedAgencyId = t.toAgencyId ?? c.assignedAgencyId;
      this.notify(t.customerId, "Agency changed", `You are now served by ${this.agency(c.assignedAgencyId!).name}.`, "system");
    } else {
      this.notify(t.customerId, "Transfer request declined", "Please contact support if you need help.", "system");
    }
    return t;
  }

  updateReminder(userId: string, patch: Partial<Customer["reminder"]>) {
    const c = this.customer(userId);
    c.reminder = { ...c.reminder, ...patch };
    return this.expandCustomer(c);
  }

  /** Gauge data for the home dashboard (PRD §5.6). */
  usage(userId: string) {
    const c = this.customer(userId);
    const mine = this.state.bookings.filter((b) => b.customerId === userId);
    const cycle = estimateCycleDays(mine, c.type === "domestic" ? this.config.defaultCycleDays : 4);
    const last = mine.filter((b) => b.status === "DELIVERED").sort((a, b) => (b.deliveredAt ?? "").localeCompare(a.deliveredAt ?? ""))[0];
    const lastAt = last?.deliveredAt ?? null;
    const used = lastAt ? (this.now().getTime() - new Date(lastAt).getTime()) / DAY : cycle;
    const pct = lastAt ? Math.max(0, Math.min(100, Math.round((1 - used / cycle) * 100))) : 0;
    const daysLeft = lastAt ? Math.max(0, Math.round(cycle - used)) : 0;
    return { pct, daysLeft, cycleDays: cycle, lastDeliveredAt: lastAt, reminder: c.reminder, deliveries: mine.filter((b) => b.status === "DELIVERED").length };
  }

  // ---------- bookings ----------
  listBookings(filter: { customerId?: string; agencyId?: string; staffId?: string; status?: BookingStatus[]; since?: string } = {}) {
    return this.state.bookings
      .filter((b) => (!filter.customerId || b.customerId === filter.customerId))
      .filter((b) => (!filter.agencyId || b.agencyId === filter.agencyId))
      .filter((b) => (!filter.staffId || b.assignedStaffId === filter.staffId))
      .filter((b) => (!filter.status || filter.status.includes(b.status)))
      .filter((b) => (!filter.since || b.createdAt >= filter.since))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((b) => this.expandBooking(b));
  }

  quote(customerId: string, items: { cylinderTypeId: string; qty: number }[], slot: SlotType) {
    const c = this.customer(customerId);
    if (!c.assignedAgencyId) throw new EngineError("NO_AGENCY", "No agency assigned yet.");
    const agency = this.agency(c.assignedAgencyId);
    if (agency.status !== "approved") throw new EngineError("AGENCY_UNAVAILABLE", "Your agency is not accepting bookings right now.");
    const cylinder = this.state.cylinderTypes.find((t) => t.id === items[0].cylinderTypeId);
    if (!cylinder) throw notFound("Cylinder type");
    const violation = this.demo.bypassRules ? null : checkRefillRules(c, this.state.bookings, cylinder, items[0].qty, this.config, this.now());
    const priced = items.map((i) => {
      const p = this.state.prices.find((x) => x.agencyId === agency.id && x.cylinderTypeId === i.cylinderTypeId);
      if (!p) throw notFound("Price");
      return { ...i, unitPrice: p.price, deliveryCharge: p.deliveryCharge, name: this.state.cylinderTypes.find((t) => t.id === i.cylinderTypeId)?.name ?? i.cylinderTypeId };
    });
    const charges = computeCharges(priced, slot, Math.max(...priced.map((p) => p.deliveryCharge)), this.config);
    return { charges, violation, agency: this.agencyCard(agency), codAllowed: agency.codEnabled, items: priced };
  }

  createBooking(input: CreateBookingInput): Booking {
    const q = this.quote(input.customerId, input.items, input.slot);
    if (q.violation) throw new EngineError(q.violation.code, q.violation.message, 422);
    if (input.paymentMethod === "cod" && !q.codAllowed) throw new EngineError("COD_DISABLED", "This agency does not accept cash on delivery.");
    const c = this.customer(input.customerId);
    const cod = input.paymentMethod === "cod";
    const addressId = c.addresses.some((a) => a.id === input.addressId) ? input.addressId : c.defaultAddressId;
    const now = this.now();
    const b: Booking = {
      id: this.id("bk"),
      code: `GS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      customerId: input.customerId,
      agencyId: c.assignedAgencyId!,
      addressId,
      items: q.items.map(({ cylinderTypeId, qty, unitPrice }) => ({ cylinderTypeId, qty, unitPrice })),
      slot: input.slot,
      charges: q.charges,
      payment: { method: input.paymentMethod, status: cod ? "COD_PENDING" : "PENDING" },
      status: cod ? "PLACED" : "PENDING_PAYMENT",
      statusHistory: [],
      deliveryOtp: String(1000 + Math.floor(Math.random() * 9000)),
      assignedStaffId: null,
      eta: new Date(now.getTime() + slotEtaHours(input.slot) * 3_600_000).toISOString(),
      etaMinutes: null,
      emptyCollected: false,
      createdAt: this.iso(now),
    };
    b.statusHistory.push({ status: b.status, at: b.createdAt, by: "customer" });
    this.state.bookings.push(b);
    if (cod) this.afterPlaced(b);
    else this.emit({ type: "booking.updated", booking: b }); // "created" is only broadcast once the order is PLACED
    return b;
  }

  /** Called by the mock gateway when checkout completes. */
  recordPayment(bookingId: string, result: { ok: boolean; paymentId?: string; method?: PaymentMethod; error?: string }) {
    const b = this.booking(bookingId);
    if (!["PENDING_PAYMENT", "PAYMENT_FAILED"].includes(b.status)) throw new EngineError("BAD_STATE", "Booking is not awaiting payment.");
    const ok = this.demo.forceNextPaymentFail ? false : result.ok;
    this.demo.forceNextPaymentFail = false;
    if (result.method) b.payment.method = result.method;
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
    this.transition(b, "PENDING_PAYMENT", "customer");
    return b;
  }

  switchToCod(bookingId: string) {
    const b = this.booking(bookingId);
    if (!["PENDING_PAYMENT", "PAYMENT_FAILED"].includes(b.status)) throw new EngineError("BAD_STATE", "Booking is not awaiting payment.");
    if (!this.agency(b.agencyId).codEnabled) throw new EngineError("COD_DISABLED", "This agency does not accept cash on delivery.");
    b.payment = { method: "cod", status: "COD_PENDING" };
    this.transition(b, "PLACED", "customer", "Switched to cash on delivery");
    this.afterPlaced(b);
    return b;
  }

  private afterPlaced(b: Booking) {
    const agency = this.agency(b.agencyId);
    this.emit({ type: "booking.created", booking: b });
    this.notify(b.customerId, "Booking placed", `${agency.name} has received booking ${b.code}. Delivery OTP: ${b.deliveryOtp}.`, "status", b.id);
    this.notify(agency.ownerUserId, "New booking", `${this.user(b.customerId).name} booked ${this.describeItems(b)} (${b.slot === "express" ? "Express" : "Standard"}).`, "status", b.id);
  }

  private describeItems(b: Booking) {
    return b.items.map((i) => `${i.qty} × ${this.state.cylinderTypes.find((c) => c.id === i.cylinderTypeId)?.name ?? "cylinder"}`).join(", ");
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
    this.notify(b.customerId, "Booking accepted", `${this.agency(b.agencyId).name} accepted booking ${b.code}. We'll assign a delivery partner shortly.`, "status", b.id);
    return b;
  }

  reject(bookingId: string, reason: string, by = "agency") {
    const b = this.booking(bookingId);
    b.rejectReason = reason;
    if (b.payment.status === "PAID") b.payment.status = "REFUNDED";
    this.transition(b, "REJECTED", by, reason);
    this.notify(b.customerId, "Booking rejected", `${this.agency(b.agencyId).name} could not take booking ${b.code}: ${reason}.${b.payment.status === "REFUNDED" ? " Refund initiated." : ""}`, "status", b.id);
    return b;
  }

  cancel(bookingId: string, reason: string, by: "customer" | "agency" = "customer") {
    const b = this.booking(bookingId);
    if (!canCancel(b.status)) throw new EngineError("BAD_STATE", `Cannot cancel a booking that is ${STATUS_LABELS[b.status].toLowerCase()}.`);
    b.cancelReason = reason;
    if (b.payment.status === "PAID") b.payment.status = "REFUNDED";
    b.assignedStaffId = null;
    this.transition(b, "CANCELLED", by, reason);
    this.notify(b.customerId, "Booking cancelled", `Booking ${b.code} was cancelled.${b.payment.status === "REFUNDED" ? " Refund of " + b.charges.total + " initiated." : ""}`, "status", b.id);
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
    this.notify(b.customerId, "Delivery partner assigned", `${this.user(s.userId).name} will deliver booking ${b.code}.`, "status", b.id);
    this.notify(s.userId, "New drop assigned", `${this.user(b.customerId).name} · ${this.addressOf(b).line2 ?? ""}`, "status", b.id);
    return b;
  }

  /** Fewest current drops wins; ties → online staff first, then higher on-time %. */
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
    const dest = this.addressOf(b);
    const route = buildRoute(s.currentLocation, dest, ROUTE_POINTS, b.id.length);
    this.trips.set(s.id, { staffId: s.id, bookingId: b.id, agencyId: b.agencyId, route, index: 0, startedAt: this.iso() });
    s.online = true;
    b.etaMinutes = this.etaFor(0, route.length);
    b.eta = new Date(this.now().getTime() + b.etaMinutes * 60_000).toISOString();
    if (b.status !== "OUT_FOR_DELIVERY") this.transition(b, "OUT_FOR_DELIVERY", by);
    else this.emit({ type: "booking.updated", booking: b });
    this.emit({ type: "staff.updated", staff: s });
    this.notify(b.customerId, "Out for delivery", `${this.user(s.userId).name} is on the way with your ${this.describeItems(b)}. Share OTP ${b.deliveryOtp} on delivery.`, "status", b.id);
    return this.expandBooking(b);
  }

  private etaFor(index: number, total: number) {
    // 18-minute trip, falls as the marker moves
    return Math.max(0, Math.round(18 * (1 - index / (total - 1))));
  }

  completeDelivery(bookingId: string, input: { otp: string; cashCollected?: boolean; emptyCollected?: boolean }, by = "delivery") {
    const b = this.booking(bookingId);
    if (b.status !== "OUT_FOR_DELIVERY") throw new EngineError("BAD_STATE", "Booking is not out for delivery.");
    if (input.otp.trim() !== b.deliveryOtp) throw new EngineError("BAD_OTP", "Incorrect delivery OTP. Ask the customer for the 4-digit code in their app.", 422);
    if (b.payment.method === "cod" && !input.cashCollected) throw new EngineError("CASH", "Confirm that cash was collected.", 422);
    const now = this.now();
    b.deliveredAt = this.iso(now);
    b.emptyCollected = !!input.emptyCollected;
    b.etaMinutes = 0;
    if (b.payment.method === "cod") {
      b.payment.status = "COD_COLLECTED";
      if (b.assignedStaffId) this.staff(b.assignedStaffId).cashInHand += b.charges.total;
    }
    this.transition(b, "DELIVERED", by);
    // inventory
    for (const i of b.items) {
      const inv = this.state.inventory.find((x) => x.agencyId === b.agencyId && x.cylinderTypeId === i.cylinderTypeId);
      if (inv) {
        inv.filled = Math.max(0, inv.filled - i.qty);
        if (b.emptyCollected) inv.empty += i.qty;
      }
    }
    this.emit({ type: "inventory.updated", agencyId: b.agencyId });
    // settlement
    if (b.payment.method !== "cod") {
      const econ = computeSettlement(b, this.config);
      const stl: Settlement = { id: this.id("stl"), bookingId: b.id, agencyId: b.agencyId, amount: b.charges.total, commission: econ.commission, convenienceFee: econ.convenienceFee, expressShare: econ.expressShare, netToAgency: econ.netToAgency, status: "pending", settledAt: null, createdAt: this.iso(now) };
      this.state.settlements.push(stl);
    }
    // trip: park the staff at the customer's location
    if (b.assignedStaffId) {
      const s = this.staff(b.assignedStaffId);
      const trip = this.trips.get(s.id);
      if (trip && trip.bookingId === b.id) {
        s.currentLocation = trip.route[trip.route.length - 1];
        this.trips.delete(s.id);
        this.emit({ type: "staff.updated", staff: s });
      }
    }
    // reminder (PRD §5.6)
    const c = this.customer(b.customerId);
    const cycle = estimateCycleDays(this.state.bookings.filter((x) => x.customerId === c.userId), c.type === "domestic" ? this.config.defaultCycleDays : 4);
    const nextDate = new Date(now.getTime() + (cycle - this.config.reminderLeadDays) * DAY);
    c.reminder = { ...c.reminder, avgCycleDays: cycle, nextDate: nextDate.toISOString() };
    const nextLabel = nextDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    this.notify(b.customerId, "Delivered ✅", `Booking ${b.code} delivered. Next refill reminder set for ${nextLabel}.`, "status", b.id);
    this.notify(this.agency(b.agencyId).ownerUserId, "Delivered", `${b.code} delivered by ${b.assignedStaffId ? this.user(this.staff(b.assignedStaffId).userId).name : "staff"}.`, "status", b.id);
    return this.expandBooking(b);
  }

  failDelivery(bookingId: string, reason: DeliveryFailReason, notes?: string, by = "delivery") {
    const b = this.booking(bookingId);
    if (b.status !== "OUT_FOR_DELIVERY") throw new EngineError("BAD_STATE", "Booking is not out for delivery.");
    b.failReason = reason;
    const label: Record<DeliveryFailReason, string> = { customer_not_home: "Customer not at home", wrong_address: "Wrong address", refused: "Customer refused", other: "Other" };
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
    this.notify(b.customerId, "Delivery attempt failed", `${label[reason]}. Your agency will reschedule booking ${b.code}.`, "status", b.id);
    this.notify(this.agency(b.agencyId).ownerUserId, "Delivery failed", `${b.code}: ${label[reason]}. Back in your queue.`, "status", b.id);
    return this.expandBooking(b);
  }

  reschedule(bookingId: string) {
    const b = this.booking(bookingId);
    if (b.status !== "DELIVERY_FAILED") throw new EngineError("BAD_STATE", "Only failed deliveries can be rescheduled.");
    b.assignedStaffId = null;
    b.failReason = undefined;
    this.transition(b, "ACCEPTED", "agency", "Rescheduled");
    this.notify(b.customerId, "Delivery rescheduled", `Booking ${b.code} will be delivered again soon.`, "status", b.id);
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

  /** Drops for a delivery person, sorted by route (nearest-first greedy). */
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
      cur = this.addressOf(active);
    }
    while (pool.length) {
      pool.sort((a, b) => haversineKm(cur, this.addressOf(a)) - haversineKm(cur, this.addressOf(b)));
      const next = pool.shift()!;
      ordered.push(next);
      cur = this.addressOf(next);
    }
    const today = this.startOfToday();
    const done = this.state.bookings.filter((b) => b.assignedStaffId === staffId && new Date(b.createdAt) >= today && ["DELIVERED", "DELIVERY_FAILED"].includes(b.status));
    return { pending: ordered.map((b) => this.expandBooking(b)), done: done.map((b) => this.expandBooking(b)), staff: this.expandStaff(s) };
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
    // don't keep a Node process alive just for the ticker
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
      if (trip.index === trip.route.length - 1) {
        this.notify(b.customerId, "Arriving now", `${this.user(s.userId).name} has reached your location. Keep OTP ${b.deliveryOtp} ready.`, "status", b.id);
      }
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
  createComplaint(customerId: string, input: { category: Complaint["category"]; text: string; bookingId?: string }) {
    const c = this.customer(customerId);
    const cmp: Complaint = { id: this.id("cmp"), customerId, agencyId: c.assignedAgencyId ?? (input.bookingId ? this.booking(input.bookingId).agencyId : ""), category: input.category, text: input.text, bookingId: input.bookingId, status: "open", createdAt: this.iso(), updatedAt: this.iso() };
    this.state.complaints.unshift(cmp);
    this.notify(customerId, "Complaint registered", `Ticket ${cmp.id.toUpperCase()} is open. We usually respond within 4 hours.`, "system");
    if (cmp.agencyId) this.notify(this.agency(cmp.agencyId).ownerUserId, "New complaint", `${this.user(customerId).name}: ${input.text.slice(0, 60)}`, "system");
    return cmp;
  }
  updateComplaint(id: string, status: Complaint["status"]) {
    const cmp = this.state.complaints.find((x) => x.id === id);
    if (!cmp) throw notFound("Complaint");
    cmp.status = status;
    cmp.updatedAt = this.iso();
    if (status === "resolved") this.notify(cmp.customerId, "Complaint resolved", `Ticket ${cmp.id.toUpperCase()} has been resolved. Thank you for your patience.`, "system");
    return cmp;
  }
  expandComplaint(c: Complaint) {
    const b = c.bookingId ? this.state.bookings.find((x) => x.id === c.bookingId) : undefined;
    return { ...c, customerName: this.user(c.customerId).name, customerPhone: this.user(c.customerId).phone, bookingCode: b?.code ?? null, agencyName: c.agencyId ? this.agency(c.agencyId).name : null };
  }

  // ---------- agency ops ----------
  agencyDashboard(agencyId: string) {
    const agency = this.agency(agencyId);
    const today = this.startOfToday();
    const all = this.state.bookings.filter((b) => b.agencyId === agencyId);
    const todays = all.filter((b) => new Date(b.createdAt) >= today);
    const openAll = all.filter((b) => isOpen(b.status));
    const revenueToday = todays.filter((b) => b.status === "DELIVERED").reduce((s, b) => s + b.charges.total, 0);
    const codOutstanding = all.filter((b) => b.payment.status === "COD_COLLECTED" && b.assignedStaffId && this.state.staff.find((s) => s.id === b.assignedStaffId)?.cashInHand).reduce((s, b) => s + b.charges.total, 0);
    const days = (n: number) => {
      const out: { date: string; label: string; orders: number; revenue: number; delivered: number }[] = [];
      for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today.getTime() - i * DAY);
        const next = new Date(d.getTime() + DAY);
        const inDay = all.filter((b) => new Date(b.createdAt) >= d && new Date(b.createdAt) < next);
        out.push({ date: d.toISOString(), label: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), orders: inDay.length, revenue: Math.round(inDay.filter((b) => b.status === "DELIVERED").reduce((s, b) => s + b.charges.total, 0)), delivered: inDay.filter((b) => b.status === "DELIVERED").length });
      }
      return out;
    };
    const mix = this.state.cylinderTypes.map((t) => ({ id: t.id, name: t.name, qty: all.filter((b) => new Date(b.createdAt) > new Date(today.getTime() - 30 * DAY)).reduce((s, b) => s + b.items.filter((i) => i.cylinderTypeId === t.id).reduce((x, i) => x + i.qty, 0), 0) }));
    return {
      agency,
      kpis: {
        todayOrders: todays.length,
        pending: openAll.filter((b) => b.status === "PLACED").length,
        accepted: openAll.filter((b) => ["ACCEPTED", "ASSIGNED"].includes(b.status)).length,
        outForDelivery: openAll.filter((b) => b.status === "OUT_FOR_DELIVERY").length,
        deliveredToday: todays.filter((b) => b.status === "DELIVERED").length,
        revenueToday,
        revenue30: all.filter((b) => b.status === "DELIVERED" && new Date(b.createdAt) > new Date(today.getTime() - 30 * DAY)).reduce((s, b) => s + b.charges.total, 0),
        codOutstanding: this.state.staff.filter((s) => s.agencyId === agencyId).reduce((s, x) => s + x.cashInHand, 0) || codOutstanding,
        failedToday: todays.filter((b) => b.status === "DELIVERY_FAILED").length,
      },
      series7: days(7),
      series30: days(30),
      cylinderMix: mix,
      staff: this.state.staff.filter((s) => s.agencyId === agencyId).map((s) => this.expandStaff(s)),
      lowStock: this.state.inventory.filter((i) => i.agencyId === agencyId && i.filled <= i.lowStockThreshold).map((i) => ({ ...i, name: this.state.cylinderTypes.find((t) => t.id === i.cylinderTypeId)?.name })),
      recent: all.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6).map((b) => this.expandBooking(b)),
    };
  }

  agencyCustomers(agencyId: string) {
    const now = this.now();
    return this.state.customers
      .filter((c) => c.assignedAgencyId === agencyId)
      .map((c) => {
        const x = this.expandCustomer(c);
        const due = c.reminder.nextDate ? new Date(c.reminder.nextDate) <= new Date(now.getTime() + 3 * DAY) : false;
        return { ...x, dueForRefill: due && !this.state.bookings.some((b) => b.customerId === c.userId && isOpen(b.status)) };
      })
      .sort((a, b) => (b.lastRefillAt ?? "").localeCompare(a.lastRefillAt ?? ""));
  }

  runCampaign(agencyId: string, customerIds: string[]) {
    const agency = this.agency(agencyId);
    let sent = 0;
    for (const id of customerIds) {
      const c = this.state.customers.find((x) => x.userId === id && x.assignedAgencyId === agencyId);
      if (!c) continue;
      this.notify(id, "Time for a refill?", `${agency.name}: your cylinder is likely running low. Book now and get delivery by tomorrow.`, "offer");
      sent++;
    }
    return { sent };
  }

  agencyInventory(agencyId: string) {
    return {
      stock: this.state.inventory.filter((i) => i.agencyId === agencyId).map((i) => ({ ...i, name: this.state.cylinderTypes.find((t) => t.id === i.cylinderTypeId)?.name, low: i.filled <= i.lowStockThreshold })),
      entries: this.state.inventoryEntries.filter((e) => e.agencyId === agencyId).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40).map((e) => ({ ...e, name: this.state.cylinderTypes.find((t) => t.id === e.cylinderTypeId)?.name })),
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

  updateAgency(agencyId: string, patch: Partial<Pick<Agency, "name" | "phone" | "codEnabled" | "slots" | "serviceArea" | "plan">>) {
    const a = this.agency(agencyId);
    Object.assign(a, patch);
    this.emit({ type: "agency.updated", agencyId });
    return a;
  }
  updatePrices(agencyId: string, rows: { cylinderTypeId: string; price: number; deliveryCharge: number }[]) {
    for (const r of rows) {
      const p = this.state.prices.find((x) => x.agencyId === agencyId && x.cylinderTypeId === r.cylinderTypeId);
      if (p) {
        p.price = r.price;
        p.deliveryCharge = r.deliveryCharge;
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
    const u: User = { id: this.id("usr"), role: "delivery", name: input.name, phone: input.phone, language: "en", avatarColor: "#2F6FED" };
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
    // group payouts by settlement date
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
    return {
      summary: { gross: sum(rows, "amount"), commission: sum(rows, "commission"), convenience: sum(rows, "convenienceFee"), expressShare: sum(rows, "expressShare"), net: sum(rows, "netToAgency"), pendingNet: sum(pending, "netToAgency"), settledNet: sum(settled, "netToAgency") },
      rows: rows.slice(0, 60).map((r) => ({ ...r, bookingCode: this.state.bookings.find((b) => b.id === r.bookingId)?.code ?? r.bookingId })),
      payouts: [...payoutMap.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
      cod: cod.map((b) => this.expandBooking(b)),
      codCollected: cod.filter((b) => b.payment.status === "COD_COLLECTED").reduce((s, b) => s + b.charges.total, 0),
      codPending: cod.filter((b) => b.payment.status === "COD_PENDING").reduce((s, b) => s + b.charges.total, 0),
    };
  }

  registerAgency(input: { name: string; omc: Agency["omc"]; distributorCode: string; gstin: string; ownerName: string; ownerPhone: string; ownerEmail: string; pincodes: string[]; center: LatLng; radiusKm: number; area: string }) {
    const owner: User = { id: this.id("usr"), role: "agency_owner", name: input.ownerName, phone: input.ownerPhone, email: input.ownerEmail, language: "en", avatarColor: "#6A3FC7" };
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
      slots: [
        { id: "standard", label: "Standard (1–2 days)", capacity: 100 },
        { id: "tomorrow_morning", label: "Tomorrow morning", capacity: 30 },
        { id: "tomorrow_evening", label: "Tomorrow evening", capacity: 30 },
        { id: "express", label: "Express (same day)", capacity: 10 },
      ],
      plan: "free",
      createdAt: this.iso(),
    };
    this.state.agencies.push(a);
    for (const t of this.state.cylinderTypes) {
      this.state.prices.push({ agencyId: a.id, cylinderTypeId: t.id, price: { cyl_14: 905, cyl_5: 340, cyl_19: 1750, cyl_47: 4350 }[t.id] ?? 900, deliveryCharge: t.category === "domestic" ? 20 : 30 });
      this.state.inventory.push({ agencyId: a.id, cylinderTypeId: t.id, filled: 0, empty: 0, lowStockThreshold: t.category === "domestic" ? 30 : 8 });
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
    this.notify(a.ownerUserId, status === "approved" ? "Agency approved 🎉" : status === "suspended" ? "Agency suspended" : "Agency status updated", status === "approved" ? "You can now receive bookings on GasSetu." : "Please contact platform support.", "system");
    this.emit({ type: "agency.updated", agencyId });
    return a;
  }
  updateConfig(patch: Partial<PlatformConfig>) {
    Object.assign(this.state.config, patch);
    return this.state.config;
  }

  adminOverview() {
    const today = this.startOfToday();
    const all = this.state.bookings;
    const delivered = all.filter((b) => b.status === "DELIVERED");
    const gmv = delivered.reduce((s, b) => s + b.charges.total, 0);
    let commission = 0, convenience = 0, express = 0;
    for (const b of delivered) {
      const e = computeSettlement(b, this.config);
      commission += e.commission;
      convenience += e.convenienceFee;
      express += e.expressPlatform;
    }
    const subscriptions = this.state.subscriptionInvoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
    const weeks: { label: string; orders: number; gmv: number; revenue: number }[] = [];
    for (let w = 12; w >= 0; w--) {
      const start = new Date(today.getTime() - (w * 7 + 6) * DAY);
      const end = new Date(start.getTime() + 7 * DAY);
      const inW = all.filter((b) => new Date(b.createdAt) >= start && new Date(b.createdAt) < end);
      const dW = inW.filter((b) => b.status === "DELIVERED");
      weeks.push({
        label: start.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        orders: inW.length,
        gmv: Math.round(dW.reduce((s, b) => s + b.charges.total, 0)),
        revenue: Math.round(dW.reduce((s, b) => s + computeSettlement(b, this.config).platformRevenue, 0)),
      });
    }
    const activeCustomers = new Set(all.filter((b) => new Date(b.createdAt) > new Date(today.getTime() - 30 * DAY)).map((b) => b.customerId)).size;
    const cityHeat = this.state.agencies.map((a) => ({ id: a.id, name: a.name, area: a.area, omc: a.omc, status: a.status, center: a.serviceArea.center, orders30: all.filter((b) => b.agencyId === a.id && new Date(b.createdAt) > new Date(today.getTime() - 30 * DAY)).length, gmv30: Math.round(all.filter((b) => b.agencyId === a.id && b.status === "DELIVERED" && new Date(b.createdAt) > new Date(today.getTime() - 30 * DAY)).reduce((s, b) => s + b.charges.total, 0)), rating: a.rating, plan: a.plan }));
    return {
      kpis: {
        gmv,
        orders: all.length,
        ordersToday: all.filter((b) => new Date(b.createdAt) >= today).length,
        activeCustomers,
        totalCustomers: this.state.customers.length,
        activeAgencies: this.state.agencies.filter((a) => a.status === "approved").length,
        pendingAgencies: this.state.agencies.filter((a) => a.status === "pending").length,
        platformRevenue: Math.round(commission + convenience + express + subscriptions),
        openComplaints: this.state.complaints.filter((c) => c.status !== "resolved").length,
      },
      revenueSplit: [
        { stream: "Commission (2% online)", amount: Math.round(commission) },
        { stream: "Convenience fees", amount: Math.round(convenience) },
        { stream: "Express fee share", amount: Math.round(express) },
        { stream: "SaaS subscriptions", amount: Math.round(subscriptions) },
      ],
      weekly: weeks,
      cityHeat,
      config: this.config,
    };
  }

  // ---------- demo controls (§6.5) ----------
  advance(bookingId: string) {
    const b = this.booking(bookingId);
    const next = nextHappyStatus(b.status);
    if (!next) throw new EngineError("TERMINAL", `Booking is already ${STATUS_LABELS[b.status].toLowerCase()}.`);
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
        return this.completeDelivery(b.id, { otp: b.deliveryOtp, cashCollected: true, emptyCollected: true }, "demo");
      }
      default:
        throw new EngineError("TERMINAL", "No next step.");
    }
  }

  simulate(kind: SimulationKind, agencyId = this.state.demo.sureshAgencyId) {
    switch (kind) {
      case "payment_failure": {
        this.demo.forceNextPaymentFail = true;
        const pending = this.state.bookings.filter((b) => b.status === "PENDING_PAYMENT").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (pending) {
          this.demo.forceNextPaymentFail = false;
          this.recordPayment(pending.id, { ok: false, error: "Simulated: bank declined the transaction" });
          return { message: `Payment for ${pending.code} marked failed.` };
        }
        return { message: "Next checkout will fail." };
      }
      case "delivery_failure": {
        const b = this.state.bookings.filter((x) => x.agencyId === agencyId && x.status === "OUT_FOR_DELIVERY").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        if (!b) throw new EngineError("NONE", "No order is out for delivery right now.");
        this.failDelivery(b.id, "customer_not_home", "Simulated from demo controls");
        return { message: `${b.code} marked delivery failed.` };
      }
      case "low_stock": {
        const inv = this.state.inventory.find((i) => i.agencyId === agencyId && i.cylinderTypeId === "cyl_14");
        if (inv) inv.filled = Math.max(0, Math.min(inv.filled, inv.lowStockThreshold - 8));
        this.emit({ type: "inventory.updated", agencyId });
        this.notify(this.agency(agencyId).ownerUserId, "Low stock alert", "14.2 kg domestic cylinders are below the reorder threshold.", "system");
        return { message: "14.2 kg stock set below threshold." };
      }
      case "order_burst": {
        const custs = this.state.customers.filter((c) => c.assignedAgencyId === agencyId && !this.state.bookings.some((b) => b.customerId === c.userId && isOpen(b.status)));
        let n = 0;
        for (const c of custs) {
          if (n >= 5) break;
          const dom = c.type === "domestic";
          if (this.quote(c.userId, [{ cylinderTypeId: dom ? "cyl_14" : "cyl_19", qty: 1 }], "standard").violation) continue;
          const b = this.createBooking({ customerId: c.userId, addressId: c.defaultAddressId, items: [{ cylinderTypeId: dom ? "cyl_14" : "cyl_19", qty: dom ? 1 : 2 }], slot: n % 3 === 0 ? "express" : "standard", paymentMethod: n % 2 === 0 ? "upi" : (this.agency(agencyId).codEnabled ? "cod" : "card") });
          if (b.status === "PENDING_PAYMENT") this.recordPayment(b.id, { ok: true, paymentId: `pay_mock_burst${n}` });
          n++;
        }
        return { message: `${n} new orders placed.` };
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
      { key: "riya", label: "Riya — home customer", role: "customer", userId: d.riyaId, phone: "9000000001" },
      { key: "imran", label: "Imran — tiffin centre", role: "customer", userId: d.imranId, phone: "9000000002" },
      { key: "ramesh", label: "Ramesh — delivery", role: "delivery", userId: d.rameshUserId, phone: "9000000003" },
      { key: "suresh", label: "Suresh — agency owner", role: "agency_owner", userId: d.sureshUserId, email: "suresh@demo" },
      { key: "admin", label: "Ops admin", role: "admin", userId: d.adminUserId, email: "admin@demo" },
    ];
  }
}
