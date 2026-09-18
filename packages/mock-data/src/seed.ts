import { Faker, en, en_IN } from "@faker-js/faker";
import {
  DEFAULT_CONFIG,
  computeCharges,
  computeSettlement,
  estimateCylindersPerWeek,
  nextRunFor,
  slabPrice,
  type AccountPrice,
  type Agency,
  type AgencyPrice,
  type AgencyTransferRequest,
  type Booking,
  type BookingStatus,
  type Business,
  type Complaint,
  type CylinderType,
  type DeliveryStaff,
  type Inventory,
  type InventoryEntry,
  type LedgerEntry,
  type Notification,
  type Outlet,
  type PaymentMethod,
  type PlatformConfig,
  type Settlement,
  type SlotType,
  type SubscriptionInvoice,
  type User,
} from "@gassetu/shared";
import { AREAS, BASE_PRICES, BUSINESSES, CYLINDER_TYPES, FIRST_NAMES, LAST_NAMES, STREETS, VEHICLES } from "./constants";

export interface SeedData {
  config: PlatformConfig;
  users: User[];
  businesses: Business[];
  agencies: Agency[];
  cylinderTypes: CylinderType[];
  prices: AgencyPrice[];
  accountPrices: AccountPrice[];
  inventory: Inventory[];
  inventoryEntries: InventoryEntry[];
  staff: DeliveryStaff[];
  bookings: Booking[];
  settlements: Settlement[];
  ledger: LedgerEntry[];
  complaints: Complaint[];
  transferRequests: AgencyTransferRequest[];
  notifications: Notification[];
  subscriptionInvoices: SubscriptionInvoice[];
  demo: {
    imranId: string;
    fatimaId: string;
    rameshStaffId: string;
    rameshUserId: string;
    sureshUserId: string;
    sureshAgencyId: string;
    adminUserId: string;
    pendingAgencyId: string;
    pendingBusinessId: string;
  };
}

const DAY = 86_400_000;
const AVATAR_COLORS = ["#A31E21", "#C6953F", "#620A1A", "#1D1D1E", "#9C7328", "#2E7D4F", "#5F5852"];

export function generateSeed(now: Date = new Date(), seed = 4242): SeedData {
  const faker = new Faker({ locale: [en_IN, en] });
  faker.seed(seed);
  const config = { ...DEFAULT_CONFIG };

  let idCounter = 0;
  const id = (p: string) => `${p}_${(++idCounter).toString(36).padStart(4, "0")}`;
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (d: number, hour = 10, minute = 0) => {
    const x = new Date(now.getTime() - d * DAY);
    x.setHours(hour, minute, 0, 0);
    return x;
  };
  const pick = <T,>(arr: T[]): T => faker.helpers.arrayElement(arr);
  const jitter = (v: number, r: number) => v + faker.number.float({ min: -r, max: r });
  const bookingCode = () => `GS-${faker.string.alphanumeric({ length: 6, casing: "upper" })}`;
  const otp = () => faker.string.numeric({ length: 4 });
  let invoiceSeq = 1040;

  const users: User[] = [];
  const businesses: Business[] = [];
  const agencies: Agency[] = [];
  const prices: AgencyPrice[] = [];
  const accountPrices: AccountPrice[] = [];
  const inventory: Inventory[] = [];
  const inventoryEntries: InventoryEntry[] = [];
  const staff: DeliveryStaff[] = [];
  const bookings: Booking[] = [];
  const settlements: Settlement[] = [];
  const ledger: LedgerEntry[] = [];
  const complaints: Complaint[] = [];
  const transferRequests: AgencyTransferRequest[] = [];
  const notifications: Notification[] = [];
  const subscriptionInvoices: SubscriptionInvoice[] = [];

  const mkUser = (u: Omit<User, "id" | "avatarColor" | "language"> & { id?: string }): User => {
    const { id: givenId, ...rest } = u;
    const user: User = { id: givenId ?? id("usr"), avatarColor: pick(AVATAR_COLORS), language: "en", ...rest };
    users.push(user);
    return user;
  };
  const phone = () => "9" + faker.string.numeric({ length: 9 });

  // ---------- Admin ----------
  const admin = mkUser({ id: "usr_admin", role: "admin", name: "Ops Admin", phone: "9000000009", email: "admin@demo" });

  // ---------- Agencies ----------
  const plans: Agency["plan"][] = ["pro", "growth", "growth", "free", "growth", "free", "free"];
  AREAS.forEach((a, i) => {
    const owner = mkUser({
      id: a.key === "amberpet" ? "usr_suresh" : undefined,
      role: "agency_owner",
      name: a.key === "amberpet" ? "Suresh Reddy" : `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: a.key === "amberpet" ? "9000000004" : phone(),
      email: a.key === "amberpet" ? "suresh@demo" : `${a.key}@demo`,
    });
    const agency: Agency = {
      id: `ag_${a.key}`,
      name: a.name,
      omc: a.omc,
      area: a.area,
      distributorCode: `${a.omc}-${faker.string.numeric({ length: 6 })}`,
      gstin: `36${faker.string.alphanumeric({ length: 10, casing: "upper" })}1Z${faker.string.numeric({ length: 1 })}`,
      ownerUserId: owner.id,
      phone: owner.phone,
      status: a.status,
      serviceArea: { pincodes: a.neighbours, center: { lat: a.lat, lng: a.lng }, radiusKm: 6 },
      rating: a.status === "pending" ? 0 : Number(faker.number.float({ min: 3.9, max: 4.8, fractionDigits: 1 })),
      codEnabled: a.key !== "gachibowli",
      creditEnabled: a.key !== "lbnagar",
      slots: [
        { id: "standard", label: "Standard (next day)", capacity: 150 },
        { id: "tomorrow_morning", label: "Before opening (6–9 AM)", capacity: 60 },
        { id: "tomorrow_evening", label: "Evening (4–8 PM)", capacity: 60 },
        { id: "express", label: "Express (3 hrs)", capacity: 20 },
      ],
      plan: plans[i] ?? "free",
      createdAt: iso(daysAgo(a.status === "pending" ? 2 : 200 + i * 15)),
    };
    agencies.push(agency);

    CYLINDER_TYPES.forEach((c) => {
      const base = BASE_PRICES[c.id] + (a.omc === "HP" ? 0 : a.omc === "IOCL" ? 5 : -5);
      prices.push({
        agencyId: agency.id,
        cylinderTypeId: c.id,
        price: base,
        slabs: c.id === "cyl_19" ? [{ minQty: 5, price: base - 25 }, { minQty: 10, price: base - 50 }] : [{ minQty: 3, price: base - 60 }],
        deliveryCharge: a.key === "amberpet" ? 0 : 40,
      });
      inventory.push({
        agencyId: agency.id,
        cylinderTypeId: c.id,
        filled: c.id === "cyl_19" ? faker.number.int({ min: 60, max: 260 }) : a.key === "amberpet" ? 7 : faker.number.int({ min: 12, max: 60 }),
        empty: faker.number.int({ min: 20, max: 140 }),
        withAccounts: 0,
        lowStockThreshold: c.id === "cyl_19" ? 40 : 10,
      });
    });

    const nStaff = a.status === "pending" ? 0 : a.key === "amberpet" ? 8 : 3;
    for (let s = 0; s < nStaff; s++) {
      const isRamesh = a.key === "amberpet" && s === 0;
      const u = mkUser({ id: isRamesh ? "usr_ramesh" : undefined, role: "delivery", name: isRamesh ? "Ramesh Yadav" : `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`, phone: isRamesh ? "9000000003" : phone() });
      staff.push({
        id: isRamesh ? "stf_ramesh" : id("stf"),
        userId: u.id,
        agencyId: agency.id,
        vehicle: isRamesh ? "Mini truck" : pick(VEHICLES),
        vehicleNo: `TS ${faker.string.numeric({ length: 2 })} ${faker.string.alpha({ length: 2, casing: "upper" })} ${faker.string.numeric({ length: 4 })}`,
        online: s < 2 || faker.datatype.boolean(0.6),
        currentLocation: { lat: jitter(a.lat, 0.01), lng: jitter(a.lng, 0.01) },
        onTimePct: isRamesh ? 99 : faker.number.int({ min: 84, max: 97 }),
        failedPct: isRamesh ? 1 : faker.number.int({ min: 1, max: 7 }),
        cashInHand: 0,
      });
    }

    if (agency.status === "approved") {
      for (let m = 0; m < 3; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        subscriptionInvoices.push({ id: id("inv"), agencyId: agency.id, plan: agency.plan, amount: config.plans[agency.plan].monthlyFee, period: d.toLocaleDateString("en-IN", { month: "short", year: "numeric" }), status: m === 0 && agency.plan !== "free" ? "due" : "paid", issuedAt: iso(d) });
      }
    }
  });

  const approved = agencies.filter((a) => a.status === "approved");
  const sureshAgency = agencies.find((a) => a.id === "ag_amberpet")!;
  const areaOf = (agencyId: string) => AREAS.find((a) => `ag_${a.key}` === agencyId)!;

  // ---------- Businesses ----------
  const mkOutlet = (agencyId: string, label: string, perWeek: number, big?: boolean): Outlet => {
    const a = areaOf(agencyId);
    return {
      id: id("out"),
      label,
      line1: `${faker.number.int({ min: 1, max: 12 })}-${faker.number.int({ min: 1, max: 99 })}-${faker.number.int({ min: 1, max: 999 })}, ${pick(STREETS)}`,
      line2: a.area,
      city: "Hyderabad",
      pincode: pick(a.neighbours),
      lat: jitter(a.lat, 0.018),
      lng: jitter(a.lng, 0.018),
      contactName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      contactPhone: phone(),
      inUse: big ? faker.number.int({ min: 3, max: 6 }) : faker.number.int({ min: 1, max: 3 }),
      spareFull: big ? faker.number.int({ min: 1, max: 4 }) : faker.number.int({ min: 0, max: 2 }),
      emptiesHeld: faker.number.int({ min: 0, max: 3 }),
      cylindersPerWeek: perWeek,
    };
  };

  const mkBusiness = (opts: { id?: string; ownerName: string; ownerPhone: string; name: string; type: Business["type"]; agencyId: string; perWeek: number; big?: boolean; outlets?: number; credit?: Partial<Business["credit"]>; status?: Business["status"]; connection?: boolean; createdDaysAgo?: number }): Business => {
    const u = mkUser({ id: opts.id, role: "business", name: opts.ownerName, phone: opts.ownerPhone });
    const n = opts.outlets ?? 1;
    const outlets = Array.from({ length: n }).map((_, i) => mkOutlet(opts.agencyId, n === 1 ? "Main kitchen" : i === 0 ? "Main kitchen" : `Branch ${i + 1}`, i === 0 ? opts.perWeek : Math.max(1, Math.round(opts.perWeek / 2)), opts.big));
    const b: Business = {
      userId: u.id,
      name: opts.name,
      type: opts.type,
      gstin: faker.datatype.boolean(0.7) ? `36${faker.string.alphanumeric({ length: 10, casing: "upper" })}1Z${faker.string.numeric({ length: 1 })}` : undefined,
      fssai: faker.datatype.boolean(0.6) ? faker.string.numeric({ length: 14 }) : undefined,
      status: opts.status ?? "verified",
      outlets,
      defaultOutletId: outlets[0].id,
      connection: opts.connection ? { omc: agencies.find((a) => a.id === opts.agencyId)!.omc, consumerNo: faker.string.numeric({ length: 9 }) } : undefined,
      assignedAgencyId: opts.agencyId,
      credit: { status: "none", limit: 0, termDays: config.defaultCreditDays, ...opts.credit },
      standingOrders: [],
      lowStockAlertDays: config.lowStockDays,
      createdAt: iso(daysAgo(opts.createdDaysAgo ?? faker.number.int({ min: 95, max: 400 }))),
    };
    businesses.push(b);
    return b;
  };

  // Demo personas
  const imran = mkBusiness({ id: "usr_imran", ownerName: "Imran Khan", ownerPhone: "9000000001", name: "Al-Madina Tiffin Centre", type: "tiffin_centre", agencyId: sureshAgency.id, perWeek: 3, outlets: 2, credit: { status: "approved", limit: 40000, termDays: 15, approvedBy: admin.id, approvedAt: iso(daysAgo(60)) }, connection: true, createdDaysAgo: 210 });
  imran.outlets[0] = { ...imran.outlets[0], label: "Main kitchen", line1: "3-5-1093, Nallakunta Main Road", line2: "Amberpet", pincode: "500044", lat: 17.4012, lng: 78.5089, inUse: 2, spareFull: 0, emptiesHeld: 2, cylindersPerWeek: 3 };
  imran.outlets[1] = { ...imran.outlets[1], label: "Vidyanagar branch", line1: "12-2-417, Street No. 4, Vidyanagar", line2: "Amberpet", pincode: "500013", lat: 17.3961, lng: 78.5211, inUse: 1, spareFull: 1, emptiesHeld: 1, cylindersPerWeek: 1.5 };
  imran.defaultOutletId = imran.outlets[0].id;

  const fatima = mkBusiness({ id: "usr_fatima", ownerName: "Fatima Begum", ownerPhone: "9000000002", name: "Star Kitchens Cloud", type: "cloud_kitchen", agencyId: sureshAgency.id, perWeek: 6, big: true, credit: { status: "requested", limit: 0, termDays: 15 }, createdDaysAgo: 40 });

  // remaining businesses
  const weights = approved.map((a) => (a.id === sureshAgency.id ? 4 : 1));
  const weightedAgency = () => faker.helpers.weightedArrayElement(approved.map((a, i) => ({ value: a, weight: weights[i] })));
  const rest = BUSINESSES.filter((b) => b.name !== imran.name && b.name !== fatima.name);
  const suffixes = ["", " II", " Annexe", " Express"];
  for (let round = 0; round < 3; round++) {
    for (const spec of rest) {
      if (businesses.length >= 100) break;
      const ag = weightedAgency();
      const creditRoll = faker.number.float({ min: 0, max: 1 });
      mkBusiness({
        ownerName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        ownerPhone: phone(),
        name: `${spec.name}${suffixes[round]}`,
        type: spec.type,
        agencyId: ag.id,
        perWeek: spec.perWeek,
        big: spec.big,
        outlets: spec.big && faker.datatype.boolean(0.5) ? 2 : 1,
        credit: creditRoll < 0.4 && ag.creditEnabled ? { status: "approved", limit: spec.big ? 150000 : 50000, termDays: pick([15, 30]), approvedBy: admin.id, approvedAt: iso(daysAgo(faker.number.int({ min: 20, max: 120 }))) } : creditRoll < 0.5 ? { status: "requested" } : {},
        connection: faker.datatype.boolean(0.6),
      });
    }
  }
  // one pending KYC business for the admin demo
  const pendingBiz = mkBusiness({ ownerName: "Naveen Goud", ownerPhone: phone(), name: "Nizampet Food Court", type: "canteen", agencyId: "ag_kukatpally", perWeek: 6, big: true, status: "pending", credit: { status: "requested" }, createdDaysAgo: 1 });

  // ---------- Bookings (90-day history) ----------
  const priceOf = (agencyId: string, cyl: string) => prices.find((p) => p.agencyId === agencyId && p.cylinderTypeId === cyl)!;
  const staffOf = (agencyId: string) => staff.filter((s) => s.agencyId === agencyId);
  const methodsOnline: PaymentMethod[] = ["upi", "upi", "netbanking", "card"];

  const mkBooking = (opts: { business: Business; outlet?: Outlet; items: { cylinderTypeId: string; qty: number }[]; createdAt: Date; status: BookingStatus; slot?: SlotType; method?: PaymentMethod; staffId?: string | null; deliveredAt?: Date; failReason?: Booking["failReason"]; cleanCredit?: boolean }): Booking => {
    const agencyId = opts.business.assignedAgencyId!;
    const agency = agencies.find((a) => a.id === agencyId)!;
    const outlet = opts.outlet ?? opts.business.outlets[0];
    const slot = opts.slot ?? faker.helpers.weightedArrayElement<SlotType>([{ value: "standard", weight: 5 }, { value: "tomorrow_morning", weight: 3 }, { value: "tomorrow_evening", weight: 1 }, { value: "express", weight: 1 }]);
    const method: PaymentMethod = opts.method ?? (opts.business.credit.status === "approved" && faker.datatype.boolean(0.7) ? "credit" : agency.codEnabled && faker.datatype.boolean(0.25) ? "cod" : pick(methodsOnline));
    const items = opts.items.map((i) => {
      const p = priceOf(agencyId, i.cylinderTypeId);
      return { cylinderTypeId: i.cylinderTypeId, qty: i.qty, unitPrice: slabPrice(p, i.qty) };
    });
    const bases = opts.items.map((i) => priceOf(agencyId, i.cylinderTypeId).price);
    const charges = computeCharges(items, bases, slot, priceOf(agencyId, "cyl_19").deliveryCharge, config);
    const created = opts.createdAt;
    const history: Booking["statusHistory"] = [];
    const push = (status: BookingStatus, at: Date, by: string, note?: string) => history.push({ status, at: iso(at), by, note });
    const t = (min: number) => new Date(created.getTime() + min * 60_000);
    const online = method === "upi" || method === "card" || method === "netbanking";
    let paymentStatus: Booking["payment"]["status"] = online ? "PAID" : method === "cod" ? "COD_PENDING" : "CREDIT_DUE";

    if (online) push("PENDING_PAYMENT", created, "business");
    const s = opts.status;
    const seq: BookingStatus[] = ["PLACED", "ACCEPTED", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"];
    const mins = [1, 12, 25, 90, 150];
    if (s === "PAYMENT_FAILED") {
      push("PAYMENT_FAILED", t(1), "gateway");
      paymentStatus = "FAILED";
    } else if (s !== "PENDING_PAYMENT") {
      const upto = s === "REJECTED" || s === "CANCELLED" ? 1 : s === "DELIVERY_FAILED" ? 4 : seq.indexOf(s) + 1;
      for (let i = 0; i < upto; i++) push(seq[i], t(mins[i]), i === 0 ? "business" : i <= 2 ? "agency" : "delivery");
      if (s === "REJECTED") {
        push("REJECTED", t(15), "agency", "Out of stock for requested slot");
        if (online) paymentStatus = "REFUNDED";
      }
      if (s === "CANCELLED") {
        push("CANCELLED", t(20), "business", "Changed requirement");
        if (online) paymentStatus = "REFUNDED";
      }
      if (s === "DELIVERY_FAILED") {
        push("DELIVERY_FAILED", t(140), "delivery", opts.failReason ?? "outlet_closed");
        if (now.getTime() - created.getTime() > DAY) {
          push("CANCELLED", t(400), "agency", "Outlet unreachable after failed delivery");
          if (online) paymentStatus = "REFUNDED";
        }
      }
      if (s === "DELIVERED") {
        if (opts.deliveredAt) history[history.length - 1].at = iso(opts.deliveredAt);
        if (method === "cod") paymentStatus = "COD_COLLECTED";
      }
    }
    const finalStatus: BookingStatus = history.length ? history[history.length - 1].status : s;
    const needsStaff = ["ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_FAILED"].includes(s);
    const staffId = opts.staffId !== undefined ? opts.staffId : needsStaff ? (pick(staffOf(agencyId))?.id ?? null) : null;
    const deliveredAt = s === "DELIVERED" ? (opts.deliveredAt ?? t(150)) : undefined;
    const dueAt = method === "credit" ? new Date((deliveredAt ?? t(150)).getTime() + opts.business.credit.termDays * DAY) : undefined;
    if (method === "credit" && s === "DELIVERED" && dueAt) {
      // invoices older than the term + a few days are paid; a couple are overdue for the demo
      if (dueAt.getTime() < now.getTime() - 3 * DAY || (opts.cleanCredit && dueAt.getTime() < now.getTime())) paymentStatus = "CREDIT_PAID";
      else if (dueAt.getTime() < now.getTime()) paymentStatus = "CREDIT_OVERDUE";
    }
    const qty = items.reduce((x, i) => x + i.qty, 0);
    const b: Booking = {
      id: id("bk"),
      code: bookingCode(),
      businessId: opts.business.userId,
      agencyId,
      outletId: outlet.id,
      items,
      slot,
      charges,
      payment: { method, status: paymentStatus, gatewayRef: online ? `pay_mock_${faker.string.alphanumeric({ length: 14 })}` : undefined, paidAt: online && paymentStatus === "PAID" ? iso(t(1)) : method === "credit" && paymentStatus === "CREDIT_PAID" ? iso(new Date(dueAt!.getTime() - 2 * DAY)) : undefined, dueAt: dueAt ? iso(dueAt) : undefined },
      status: finalStatus,
      statusHistory: history,
      deliveryOtp: otp(),
      assignedStaffId: staffId,
      eta: null,
      etaMinutes: null,
      emptiesToCollect: qty,
      emptiesCollected: s === "DELIVERED" ? Math.max(0, qty - faker.number.int({ min: 0, max: 1 })) : 0,
      invoiceNo: `INV-${String(invoiceSeq++).padStart(5, "0")}`,
      failReason: s === "DELIVERY_FAILED" ? (opts.failReason ?? "outlet_closed") : undefined,
      rejectReason: s === "REJECTED" ? "Out of stock for requested slot" : undefined,
      cancelReason: finalStatus === "CANCELLED" ? (s === "CANCELLED" ? "Changed requirement" : "Outlet unreachable after failed delivery") : undefined,
      createdAt: iso(created),
      deliveredAt: deliveredAt ? iso(deliveredAt) : undefined,
    };
    bookings.push(b);
    if (s === "DELIVERED" && method !== "cod") {
      const econ = computeSettlement(b, config);
      const ageDays = (now.getTime() - created.getTime()) / DAY;
      settlements.push({ id: id("stl"), bookingId: b.id, agencyId, amount: b.charges.total, commission: econ.commission + econ.creditFee, convenienceFee: econ.convenienceFee, expressShare: econ.expressShare, netToAgency: econ.netToAgency, status: ageDays > 3 ? "settled" : "pending", settledAt: ageDays > 3 ? iso(new Date(created.getTime() + 3 * DAY)) : null, createdAt: iso(created) });
    }
    if (method === "credit" && s === "DELIVERED") {
      ledger.push({ id: id("led"), businessId: b.businessId, agencyId, kind: "invoice", bookingId: b.id, amount: b.charges.total, dueAt: b.payment.dueAt, note: b.invoiceNo, at: iso(deliveredAt!) });
      if (paymentStatus === "CREDIT_PAID") ledger.push({ id: id("led"), businessId: b.businessId, agencyId, kind: "payment", bookingId: b.id, amount: -b.charges.total, note: `Paid ${b.invoiceNo} via NEFT`, at: b.payment.paidAt! });
    }
    return b;
  };

  const histStatus = (): BookingStatus =>
    faker.helpers.weightedArrayElement<BookingStatus>([{ value: "DELIVERED", weight: 92 }, { value: "CANCELLED", weight: 3 }, { value: "REJECTED", weight: 2 }, { value: "PAYMENT_FAILED", weight: 1 }, { value: "DELIVERY_FAILED", weight: 2 }]);
  const randomTime = (d: number) => daysAgo(d, faker.number.int({ min: 6, max: 19 }), faker.number.int({ min: 0, max: 59 }));
  const itemsFor = (spec: { perWeek: number; big?: boolean }, outlet: Outlet) => {
    const qty = Math.max(1, Math.round(outlet.cylindersPerWeek / (spec.perWeek >= 5 ? 2 : 1)) + faker.number.int({ min: 0, max: 1 }));
    return spec.big && faker.datatype.boolean(0.4) ? [{ cylinderTypeId: "cyl_47", qty: Math.max(1, Math.round(qty / 2)) }, { cylinderTypeId: "cyl_19", qty }] : [{ cylinderTypeId: "cyl_19", qty }];
  };

  for (const biz of businesses) {
    if (biz.userId === imran.userId || biz.status === "pending") continue;
    const spec = BUSINESSES.find((s) => biz.name.startsWith(s.name)) ?? { perWeek: 3, type: "other" as const };
    for (const outlet of biz.outlets) {
      const perWeek = outlet.cylindersPerWeek;
      const ordersPerWeek = perWeek >= 5 ? 2.5 : perWeek >= 2 ? 1.5 : 0.7;
      let d = faker.number.int({ min: 1, max: 6 });
      while (d < 90) {
        mkBooking({ business: biz, outlet, items: itemsFor({ perWeek: spec.perWeek, big: (spec as any).big }, outlet), createdAt: randomTime(d), status: histStatus() });
        d += Math.max(1, Math.round(7 / ordersPerWeek + faker.number.int({ min: -1, max: 1 })));
      }
    }
  }

  // Imran: regular Tue/Fri 3 × 19 kg on credit to the main kitchen, weekly 1 × 19 kg to the branch. Last delivery 3 days ago → ~1 day of stock left.
  for (let d = 3; d < 90; d += d % 7 === 3 ? 4 : 3) {
    mkBooking({ business: imran, outlet: imran.outlets[0], items: [{ cylinderTypeId: "cyl_19", qty: 3 }], createdAt: daysAgo(d + 1, 17, 30), status: "DELIVERED", method: "credit", deliveredAt: daysAgo(d, 8, 40), staffId: "stf_ramesh", cleanCredit: true });
  }
  for (let d = 5; d < 90; d += 7) {
    mkBooking({ business: imran, outlet: imran.outlets[1], items: [{ cylinderTypeId: "cyl_19", qty: 1 }], createdAt: daysAgo(d + 1, 17, 0), status: "DELIVERED", method: "upi", deliveredAt: daysAgo(d, 9, 15), staffId: "stf_ramesh" });
  }
  imran.standingOrders.push({ id: id("so"), outletId: imran.outlets[0].id, items: [{ cylinderTypeId: "cyl_19", qty: 3 }], days: [2, 5], slot: "tomorrow_morning", paymentMethod: "credit", active: false, lastRunAt: null, nextRunAt: iso(nextRunFor([2, 5], now)!) });

  // Today's live board for Suresh's agency — every other partner carries ≥1 drop so auto-assign picks Ramesh.
  const sureshBiz = businesses.filter((b) => b.assignedAgencyId === sureshAgency.id && b.userId !== imran.userId && b.status !== "pending");
  const openBiz = faker.helpers.shuffle(sureshBiz).slice(0, 14);
  const sureshStaff = staff.filter((x) => x.agencyId === sureshAgency.id && x.id !== "stf_ramesh");
  const todayStatuses: { status: BookingStatus; hourAgo: number; staff?: string | null; slot?: SlotType; method?: PaymentMethod }[] = [
    { status: "PLACED", hourAgo: 0.3, slot: "express" },
    { status: "PLACED", hourAgo: 0.8, method: "credit" },
    { status: "ACCEPTED", hourAgo: 1.5 },
    { status: "ASSIGNED", hourAgo: 2, staff: "stf_ramesh", method: "cod" },
    { status: "DELIVERED", hourAgo: 5, staff: "stf_ramesh", method: "credit" },
    { status: "ASSIGNED", hourAgo: 2.2, staff: sureshStaff[0]?.id },
    { status: "ASSIGNED", hourAgo: 2.4, staff: sureshStaff[1]?.id },
    { status: "ASSIGNED", hourAgo: 2.6, staff: sureshStaff[2]?.id, method: "cod" },
    { status: "ASSIGNED", hourAgo: 2.8, staff: sureshStaff[3]?.id },
    { status: "ASSIGNED", hourAgo: 3.0, staff: sureshStaff[4]?.id },
    { status: "ASSIGNED", hourAgo: 3.2, staff: sureshStaff[5]?.id },
    { status: "OUT_FOR_DELIVERY", hourAgo: 3.5, staff: sureshStaff[6]?.id },
    { status: "ASSIGNED", hourAgo: 1.2, staff: sureshStaff[6]?.id },
    { status: "DELIVERY_FAILED", hourAgo: 6, staff: sureshStaff[1]?.id },
  ];
  todayStatuses.forEach((ts, i) => {
    const biz = openBiz[i];
    if (!biz) return;
    const spec = BUSINESSES.find((s) => biz.name.startsWith(s.name)) ?? { perWeek: 3, type: "other" as const };
    mkBooking({ business: biz, items: itemsFor({ perWeek: spec.perWeek, big: (spec as any).big }, biz.outlets[0]), createdAt: new Date(now.getTime() - ts.hourAgo * 3_600_000), status: ts.status, slot: ts.slot, method: ts.method && (ts.method !== "credit" || biz.credit.status === "approved") ? ts.method : undefined, staffId: ts.staff });
  });

  bookings.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // consumption estimates from history
  for (const biz of businesses) {
    for (const o of biz.outlets) {
      o.cylindersPerWeek = estimateCylindersPerWeek(bookings.filter((b) => b.outletId === o.id), o.cylindersPerWeek, now);
    }
  }
  // cylinders out with accounts
  for (const inv of inventory) {
    inv.withAccounts = businesses.filter((b) => b.assignedAgencyId === inv.agencyId).reduce((s, b) => s + b.outlets.reduce((x, o) => x + o.inUse + o.spareFull + o.emptiesHeld, 0), 0);
  }
  // COD cash with staff today
  for (const b of bookings) {
    if (b.status === "DELIVERED" && b.payment.method === "cod" && b.assignedStaffId && new Date(b.createdAt) > daysAgo(1)) {
      const s = staff.find((x) => x.id === b.assignedStaffId);
      if (s) s.cashInHand += b.charges.total;
    }
  }
  // negotiated prices for a few big accounts
  for (const biz of businesses.filter((b) => b.credit.limit >= 100000).slice(0, 6)) {
    accountPrices.push({ agencyId: biz.assignedAgencyId!, businessId: biz.userId, cylinderTypeId: "cyl_19", price: priceOf(biz.assignedAgencyId!, "cyl_19").price - 40 });
  }

  // ---------- Inventory entries ----------
  for (const ag of approved) {
    for (let d = 6; d >= 0; d--) {
      inventoryEntries.push({ id: id("ie"), agencyId: ag.id, cylinderTypeId: "cyl_19", kind: "in", qty: faker.number.int({ min: 40, max: 120 }), note: "OMC truck", at: iso(daysAgo(d, 8)) });
      inventoryEntries.push({ id: id("ie"), agencyId: ag.id, cylinderTypeId: "cyl_19", kind: "out", qty: faker.number.int({ min: 35, max: 110 }), note: "Deliveries", at: iso(daysAgo(d, 19)) });
      if (d % 2 === 0) inventoryEntries.push({ id: id("ie"), agencyId: ag.id, cylinderTypeId: "cyl_47", kind: "in", qty: faker.number.int({ min: 6, max: 20 }), note: "OMC truck", at: iso(daysAgo(d, 8, 30)) });
    }
  }

  // ---------- Complaints ----------
  const complaintTexts: Record<Complaint["category"], string[]> = {
    delivery_delay: ["Ordered for 6 AM slot, cylinders came at 11 — lunch service was hit.", "No update from the delivery partner for two hours."],
    short_supply: ["Ordered 4 × 19 kg, received 3."],
    leak: ["Regulator seal on one cylinder looks damaged.", "Smell near the valve on delivery — sent it back."],
    staff_behaviour: ["Driver refused to carry cylinders to the first-floor kitchen."],
    billing: ["Invoice shows 18% GST but our GSTIN is missing on it.", "Credit statement double-counted last week's order."],
    other: ["Please add our second outlet to the account.", "Need a cylinder deposit receipt for audit."],
  };
  const deliveredBookings = bookings.filter((b) => b.status === "DELIVERED" || b.status === "DELIVERY_FAILED");
  for (let i = 0; i < 14; i++) {
    const b = pick(deliveredBookings.slice(-150));
    const category = faker.helpers.weightedArrayElement<Complaint["category"]>([{ value: "delivery_delay", weight: 4 }, { value: "short_supply", weight: 2 }, { value: "leak", weight: 2 }, { value: "staff_behaviour", weight: 1 }, { value: "billing", weight: 3 }, { value: "other", weight: 2 }]);
    const createdAt = new Date(new Date(b.createdAt).getTime() + 5 * 3_600_000);
    complaints.push({ id: id("cmp"), bookingId: b.id, businessId: b.businessId, agencyId: b.agencyId, category, text: pick(complaintTexts[category]), status: faker.helpers.weightedArrayElement<Complaint["status"]>([{ value: "open", weight: 3 }, { value: "in_progress", weight: 2 }, { value: "resolved", weight: 6 }, { value: "escalated", weight: 2 }]), createdAt: iso(createdAt), updatedAt: iso(new Date(createdAt.getTime() + 2 * 3_600_000)) });
  }
  complaints.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ---------- Transfer requests ----------
  const movers = businesses.filter((b) => b.assignedAgencyId !== sureshAgency.id && b.status !== "pending").slice(0, 2);
  movers.forEach((b, i) => transferRequests.push({ id: id("trf"), businessId: b.userId, fromAgencyId: b.assignedAgencyId!, toAgencyId: sureshAgency.id, reason: i === 0 ? "Opened a new outlet in Amberpet" : "Current agency keeps missing our 6 AM slot", status: "pending", createdAt: iso(daysAgo(i + 1, 14)) }));

  // ---------- Notifications for Imran ----------
  const lastMain = bookings.filter((b) => b.businessId === imran.userId && b.outletId === imran.outlets[0].id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const notes: [number, string, string, Notification["type"]][] = [
    [0.05, "Low stock at Main kitchen", "About 1 day of LPG left. Reorder your usual 3 × 19 kg before tomorrow's service.", "stock"],
    [1, `Invoice ${lastMain?.invoiceNo} on credit`, `₹${Math.round(lastMain?.charges.total ?? 0).toLocaleString("en-IN")} due in ${imran.credit.termDays} days.`, "billing"],
    [3, "Delivered ✅", `${lastMain?.code} · 3 × 19 kg delivered by Ramesh, 3 empties collected.`, "status"],
    [3.05, "Out for delivery", `Ramesh is on the way with 3 × 19 kg. OTP ${lastMain?.deliveryOtp}.`, "status"],
    [9, "Slab pricing on 10+ cylinders", `${sureshAgency.name}: ₹50 off per 19 kg cylinder on orders of 10 or more.`, "offer"],
    [12, "Monthly statement ready", "Your August credit statement is available under Invoices.", "billing"],
  ];
  notes.forEach(([d, title, body, type]) => notifications.push({ id: id("ntf"), userId: imran.userId, title, body, type, read: d > 2, bookingId: type === "status" ? lastMain?.id : undefined, createdAt: iso(new Date(now.getTime() - d * DAY)) }));
  notifications.push({ id: id("ntf"), userId: admin.id, title: "Credit request", body: `${fatima.name} has requested a credit account.`, type: "system", read: false, createdAt: iso(daysAgo(1, 11)) });
  notifications.push({ id: id("ntf"), userId: admin.id, title: "New business registration", body: `${pendingBiz.name} is awaiting verification.`, type: "system", read: false, createdAt: iso(daysAgo(1, 9)) });

  return {
    config,
    users,
    businesses,
    agencies,
    cylinderTypes: CYLINDER_TYPES,
    prices,
    accountPrices,
    inventory,
    inventoryEntries,
    staff,
    bookings,
    settlements,
    ledger,
    complaints,
    transferRequests,
    notifications,
    subscriptionInvoices,
    demo: { imranId: imran.userId, fatimaId: fatima.userId, rameshStaffId: "stf_ramesh", rameshUserId: "usr_ramesh", sureshUserId: "usr_suresh", sureshAgencyId: sureshAgency.id, adminUserId: admin.id, pendingAgencyId: "ag_uppal", pendingBusinessId: pendingBiz.userId },
  };
}
