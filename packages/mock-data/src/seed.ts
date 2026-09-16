import { Faker, en, en_IN } from "@faker-js/faker";
import {
  DEFAULT_CONFIG,
  computeCharges,
  computeSettlement,
  estimateCycleDays,
  type Address,
  type Agency,
  type AgencyPrice,
  type AgencyTransferRequest,
  type Booking,
  type BookingStatus,
  type Complaint,
  type Customer,
  type CylinderType,
  type DeliveryStaff,
  type Inventory,
  type InventoryEntry,
  type Notification,
  type PaymentMethod,
  type PlatformConfig,
  type Settlement,
  type SlotType,
  type SubscriptionInvoice,
  type User,
} from "@gassetu/shared";
import { AREAS, BASE_PRICES, BUSINESS_NAMES, CYLINDER_TYPES, FIRST_NAMES_F, FIRST_NAMES_M, LAST_NAMES, STREETS, VEHICLES } from "./constants";

export interface SeedData {
  config: PlatformConfig;
  users: User[];
  customers: Customer[];
  agencies: Agency[];
  cylinderTypes: CylinderType[];
  prices: AgencyPrice[];
  inventory: Inventory[];
  inventoryEntries: InventoryEntry[];
  staff: DeliveryStaff[];
  bookings: Booking[];
  settlements: Settlement[];
  complaints: Complaint[];
  transferRequests: AgencyTransferRequest[];
  notifications: Notification[];
  subscriptionInvoices: SubscriptionInvoice[];
  demo: {
    riyaId: string;
    imranId: string;
    rameshStaffId: string;
    rameshUserId: string;
    sureshUserId: string;
    sureshAgencyId: string;
    adminUserId: string;
    pendingAgencyId: string;
  };
}

const DAY = 86_400_000;
const AVATAR_COLORS = ["#F26B1D", "#2F6FED", "#1E9E5A", "#9A6B00", "#6A3FC7", "#D93B3B", "#0E8A8A"];

export function generateSeed(now: Date = new Date(), seed = 4242): SeedData {
  const faker = new Faker({ locale: [en_IN, en] });
  faker.seed(seed);
  const config = { ...DEFAULT_CONFIG, reminderLeadDays: 2 };

  let idCounter = 0;
  const id = (p: string) => `${p}_${(++idCounter).toString(36).padStart(4, "0")}`;
  const iso = (d: Date) => d.toISOString();
  const daysAgo = (d: number, hour = 10, minute = 0) => {
    const x = new Date(now.getTime() - d * DAY);
    x.setHours(hour, minute, 0, 0);
    return x;
  };
  const pick = <T,>(arr: T[]): T => faker.helpers.arrayElement(arr);
  const jitter = (v: number, r: number) => v + (faker.number.float({ min: -r, max: r }));
  const bookingCode = () => `GS-${faker.string.alphanumeric({ length: 6, casing: "upper" })}`;
  const otp = () => faker.string.numeric({ length: 4 });

  const users: User[] = [];
  const customers: Customer[] = [];
  const agencies: Agency[] = [];
  const prices: AgencyPrice[] = [];
  const inventory: Inventory[] = [];
  const inventoryEntries: InventoryEntry[] = [];
  const staff: DeliveryStaff[] = [];
  const bookings: Booking[] = [];
  const settlements: Settlement[] = [];
  const complaints: Complaint[] = [];
  const transferRequests: AgencyTransferRequest[] = [];
  const notifications: Notification[] = [];
  const subscriptionInvoices: SubscriptionInvoice[] = [];

  const mkUser = (u: Omit<User, "id" | "avatarColor" | "language"> & { id?: string; language?: User["language"] }): User => {
    const { id: givenId, ...rest } = u;
    const user: User = { id: givenId ?? id("usr"), avatarColor: pick(AVATAR_COLORS), language: "en", ...rest } as User;
    users.push(user);
    return user;
  };

  // ---------- Admin ----------
  const admin = mkUser({ id: "usr_admin", role: "admin", name: "Ops Admin", phone: "9000000009", email: "admin@demo" });

  // ---------- Agencies ----------
  const plans: Agency["plan"][] = ["pro", "growth", "growth", "free", "growth", "free", "free"];
  AREAS.forEach((a, i) => {
    const ownerName = a.key === "amberpet" ? "Suresh Reddy" : `${pick(FIRST_NAMES_M)} ${pick(LAST_NAMES)}`;
    const owner = mkUser({
      id: a.key === "amberpet" ? "usr_suresh" : undefined,
      role: "agency_owner",
      name: ownerName,
      phone: a.key === "amberpet" ? "9000000004" : faker.string.numeric({ length: 10, allowLeadingZeros: false }).replace(/^[0-5]/, "9"),
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
      serviceArea: { pincodes: a.neighbours, center: { lat: a.lat, lng: a.lng }, radiusKm: 5 },
      rating: a.status === "pending" ? 0 : Number(faker.number.float({ min: 3.9, max: 4.8, fractionDigits: 1 })),
      codEnabled: a.key !== "gachibowli",
      slots: [
        { id: "standard", label: "Standard (1–2 days)", capacity: 120 },
        { id: "tomorrow_morning", label: "Tomorrow morning", capacity: 40 },
        { id: "tomorrow_evening", label: "Tomorrow evening", capacity: 40 },
        { id: "express", label: "Express (same day)", capacity: 15 },
      ],
      plan: plans[i] ?? "free",
      createdAt: iso(daysAgo(a.status === "pending" ? 2 : 200 + i * 15)),
    };
    agencies.push(agency);

    CYLINDER_TYPES.forEach((c) => {
      prices.push({
        agencyId: agency.id,
        cylinderTypeId: c.id,
        price: BASE_PRICES[c.id] + (a.omc === "HP" ? 0 : a.omc === "IOCL" ? 3 : -2),
        deliveryCharge: c.category === "domestic" ? (a.key === "amberpet" ? 0 : 20) : 30,
      });
      const filled = c.category === "domestic" ? faker.number.int({ min: 40, max: 260 }) : faker.number.int({ min: 8, max: 60 });
      inventory.push({
        agencyId: agency.id,
        cylinderTypeId: c.id,
        filled: c.id === "cyl_5" && a.key === "amberpet" ? 6 : filled,
        empty: faker.number.int({ min: 10, max: 120 }),
        lowStockThreshold: c.category === "domestic" ? 30 : 8,
      });
    });

    // staff
    const nStaff = a.status === "pending" ? 0 : a.key === "amberpet" ? 8 : 3;
    for (let s = 0; s < nStaff; s++) {
      const isRamesh = a.key === "amberpet" && s === 0;
      const u = mkUser({
        id: isRamesh ? "usr_ramesh" : undefined,
        role: "delivery",
        name: isRamesh ? "Ramesh Yadav" : `${pick(FIRST_NAMES_M)} ${pick(LAST_NAMES)}`,
        phone: isRamesh ? "9000000003" : faker.string.numeric({ length: 10 }).replace(/^[0-5]/, "8"),
      });
      staff.push({
        id: isRamesh ? "stf_ramesh" : id("stf"),
        userId: u.id,
        agencyId: agency.id,
        vehicle: isRamesh ? "Three-wheeler" : pick(VEHICLES),
        vehicleNo: `TS ${faker.string.numeric({ length: 2 })} ${faker.string.alpha({ length: 2, casing: "upper" })} ${faker.string.numeric({ length: 4 })}`,
        online: s < 2 || faker.datatype.boolean(0.6),
        currentLocation: { lat: jitter(a.lat, 0.01), lng: jitter(a.lng, 0.01) },
        onTimePct: faker.number.int({ min: 84, max: 99 }),
        failedPct: faker.number.int({ min: 1, max: 7 }),
        cashInHand: 0,
      });
    }

    // subscription invoices (3 months)
    if (agency.status === "approved") {
      for (let m = 0; m < 3; m++) {
        const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
        subscriptionInvoices.push({
          id: id("inv"),
          agencyId: agency.id,
          plan: agency.plan,
          amount: config.plans[agency.plan].monthlyFee,
          period: d.toLocaleDateString("en-IN", { month: "short", year: "numeric" }),
          status: m === 0 && agency.plan !== "free" ? "due" : "paid",
          issuedAt: iso(d),
        });
      }
    }
  });

  const approved = agencies.filter((a) => a.status === "approved");
  const sureshAgency = agencies.find((a) => a.id === "ag_amberpet")!;
  const areaOf = (agencyId: string) => AREAS.find((a) => `ag_${a.key}` === agencyId)!;

  // ---------- Customers ----------
  const mkAddress = (agencyId: string, label = "Home"): Address => {
    const a = areaOf(agencyId);
    return {
      id: id("adr"),
      label,
      line1: `${faker.number.int({ min: 1, max: 12 })}-${faker.number.int({ min: 1, max: 99 })}-${faker.number.int({ min: 1, max: 999 })}, ${pick(STREETS)}`,
      line2: a.area,
      city: "Hyderabad",
      pincode: pick(a.neighbours),
      lat: jitter(a.lat, 0.018),
      lng: jitter(a.lng, 0.018),
    };
  };

  const mkCustomer = (opts: {
    id?: string;
    name: string;
    phone: string;
    type: Customer["type"];
    agencyId: string;
    connection?: Customer["connection"];
    createdDaysAgo?: number;
  }): Customer => {
    const u = mkUser({ id: opts.id, role: "customer", name: opts.name, phone: opts.phone });
    const addr = mkAddress(opts.agencyId, opts.type === "commercial" ? "Shop" : "Home");
    const c: Customer = {
      userId: u.id,
      type: opts.type,
      addresses: [addr],
      defaultAddressId: addr.id,
      connection: opts.connection,
      assignedAgencyId: opts.agencyId,
      reminder: { enabled: true, nextDate: null, autoBook: false, avgCycleDays: config.defaultCycleDays },
      createdAt: iso(daysAgo(opts.createdDaysAgo ?? faker.number.int({ min: 95, max: 400 }))),
    };
    customers.push(c);
    return c;
  };

  // Demo personas
  const riya = mkCustomer({
    id: "usr_riya",
    name: "Riya Sharma",
    phone: "9000000001",
    type: "domestic",
    agencyId: sureshAgency.id,
    connection: { omc: "HP", consumerNo: "614302877", lpgId: "17203456789012345" },
    createdDaysAgo: 380,
  });
  riya.addresses[0] = { ...riya.addresses[0], line1: "12-2-417/8, Street No. 4, Vidyanagar", line2: "Amberpet", pincode: "500013", lat: 17.3961, lng: 78.5211 };
  riya.defaultAddressId = riya.addresses[0].id;

  const imran = mkCustomer({
    id: "usr_imran",
    name: "Imran Khan",
    phone: "9000000002",
    type: "commercial",
    agencyId: sureshAgency.id,
    createdDaysAgo: 200,
  });
  imran.addresses[0] = { ...imran.addresses[0], label: "Al-Madina Tiffin Centre", line1: "3-5-1093, Nallakunta Main Road", line2: "Amberpet", pincode: "500044", lat: 17.4012, lng: 78.5089 };
  imran.defaultAddressId = imran.addresses[0].id;

  // 60 customers total (45 domestic / 15 commercial) — see DECISIONS.md
  const weights = approved.map((a) => (a.id === sureshAgency.id ? 3 : 1));
  const weightedAgency = () => faker.helpers.weightedArrayElement(approved.map((a, i) => ({ value: a, weight: weights[i] })));
  let bizIdx = 0;
  for (let i = 0; i < 43; i++) {
    const female = faker.datatype.boolean();
    const ag = weightedAgency();
    mkCustomer({
      name: `${pick(female ? FIRST_NAMES_F : FIRST_NAMES_M)} ${pick(LAST_NAMES)}`,
      phone: faker.string.numeric({ length: 9 }).replace(/^./, "") + faker.string.numeric({ length: 2 }),
      type: "domestic",
      agencyId: ag.id,
      connection: faker.datatype.boolean(0.8)
        ? { omc: ag.omc, consumerNo: faker.string.numeric({ length: 9 }), lpgId: `17${faker.string.numeric({ length: 15 })}` }
        : undefined,
    });
  }
  for (let i = 0; i < 14; i++) {
    const ag = weightedAgency();
    mkCustomer({
      name: BUSINESS_NAMES[bizIdx++ % BUSINESS_NAMES.length],
      phone: "9" + faker.string.numeric({ length: 9 }),
      type: "commercial",
      agencyId: ag.id,
    });
  }
  // fix phones to valid Indian mobiles
  users.forEach((u) => {
    if (!/^[6-9]\d{9}$/.test(u.phone)) u.phone = "9" + u.phone.replace(/\D/g, "").padEnd(9, "1").slice(0, 9);
  });

  // ---------- Bookings (90-day history) ----------
  const priceOf = (agencyId: string, cyl: string) => prices.find((p) => p.agencyId === agencyId && p.cylinderTypeId === cyl)!;
  const staffOf = (agencyId: string) => staff.filter((s) => s.agencyId === agencyId);
  const methodsOnline: PaymentMethod[] = ["upi", "upi", "upi", "card", "netbanking", "wallet"];

  const mkBooking = (opts: {
    customer: Customer;
    cylinderTypeId: string;
    qty: number;
    createdAt: Date;
    status: BookingStatus;
    slot?: SlotType;
    method?: PaymentMethod;
    staffId?: string | null;
    deliveredAt?: Date;
    failReason?: Booking["failReason"];
  }): Booking => {
    const agencyId = opts.customer.assignedAgencyId!;
    const agency = agencies.find((a) => a.id === agencyId)!;
    const p = priceOf(agencyId, opts.cylinderTypeId);
    const slot = opts.slot ?? faker.helpers.weightedArrayElement<SlotType>([
      { value: "standard", weight: 5 },
      { value: "tomorrow_morning", weight: 2 },
      { value: "tomorrow_evening", weight: 2 },
      { value: "express", weight: 1 },
    ]);
    const method = opts.method ?? (agency.codEnabled && faker.datatype.boolean(0.3) ? "cod" : pick(methodsOnline));
    const items = [{ cylinderTypeId: opts.cylinderTypeId, qty: opts.qty, unitPrice: p.price }];
    const charges = computeCharges(items, slot, p.deliveryCharge, config);
    const created = opts.createdAt;
    const history: Booking["statusHistory"] = [];
    const push = (status: BookingStatus, at: Date, by: string, note?: string) => history.push({ status, at: iso(at), by, note });
    const t = (min: number) => new Date(created.getTime() + min * 60_000);
    const online = method !== "cod";
    let paymentStatus: Booking["payment"]["status"] = online ? "PAID" : "COD_PENDING";

    if (online) push("PENDING_PAYMENT", created, "customer");
    const s = opts.status;
    const seq: BookingStatus[] = ["PLACED", "ACCEPTED", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED"];
    const mins = [1, 12, 25, 90, 150];
    if (s === "PAYMENT_FAILED") {
      push("PAYMENT_FAILED", t(1), "gateway");
      paymentStatus = "FAILED";
    } else if (s === "PENDING_PAYMENT") {
      // nothing more
    } else {
      const upto = s === "REJECTED" || s === "CANCELLED" ? 1 : s === "DELIVERY_FAILED" ? 4 : seq.indexOf(s) + 1;
      for (let i = 0; i < upto; i++) push(seq[i], t(mins[i]), i === 0 ? "customer" : i <= 2 ? "agency" : "delivery");
      if (s === "REJECTED") {
        push("REJECTED", t(15), "agency", "Out of stock for requested slot");
        if (online) paymentStatus = "REFUNDED";
      }
      if (s === "CANCELLED") {
        push("CANCELLED", t(20), "customer", "Changed my mind");
        if (online) paymentStatus = "REFUNDED";
      }
      if (s === "DELIVERY_FAILED") {
        push("DELIVERY_FAILED", t(140), "delivery", opts.failReason ?? "customer_not_home");
        // historical failures were later cancelled so they don't linger as open orders
        if (now.getTime() - created.getTime() > DAY) {
          push("CANCELLED", t(400), "agency", "Customer unreachable after failed delivery");
          if (online) paymentStatus = "REFUNDED";
        }
      }
      if (s === "DELIVERED") {
        if (opts.deliveredAt) history[history.length - 1].at = iso(opts.deliveredAt);
        if (!online) paymentStatus = "COD_COLLECTED";
      }
    }
    const finalStatus: BookingStatus = history.length ? history[history.length - 1].status : s;
    const needsStaff = ["ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_FAILED"].includes(s);
    const staffId = opts.staffId !== undefined ? opts.staffId : needsStaff ? pick(staffOf(agencyId))?.id ?? null : null;
    const deliveredAt = s === "DELIVERED" ? (opts.deliveredAt ?? t(150)) : undefined;
    const b: Booking = {
      id: id("bk"),
      code: bookingCode(),
      customerId: opts.customer.userId,
      agencyId,
      addressId: opts.customer.defaultAddressId,
      items,
      slot,
      charges,
      payment: {
        method,
        status: paymentStatus,
        gatewayRef: online ? `pay_mock_${faker.string.alphanumeric({ length: 14 })}` : undefined,
        paidAt: online && paymentStatus === "PAID" ? iso(t(1)) : undefined,
      },
      status: finalStatus,
      statusHistory: history,
      deliveryOtp: otp(),
      assignedStaffId: staffId,
      eta: null,
      etaMinutes: null,
      emptyCollected: s === "DELIVERED",
      failReason: s === "DELIVERY_FAILED" ? (opts.failReason ?? "customer_not_home") : undefined,
      rejectReason: s === "REJECTED" ? "Out of stock for requested slot" : undefined,
      cancelReason: finalStatus === "CANCELLED" ? (s === "CANCELLED" ? "Changed my mind" : "Customer unreachable after failed delivery") : undefined,
      createdAt: iso(created),
      deliveredAt: deliveredAt ? iso(deliveredAt) : undefined,
    };
    bookings.push(b);
    if (s === "DELIVERED" && online) {
      const econ = computeSettlement(b, config);
      const ageDays = (now.getTime() - created.getTime()) / DAY;
      settlements.push({
        id: id("stl"),
        bookingId: b.id,
        agencyId,
        amount: b.charges.total,
        commission: econ.commission,
        convenienceFee: econ.convenienceFee,
        expressShare: econ.expressShare,
        netToAgency: econ.netToAgency,
        status: ageDays > 3 ? "settled" : "pending",
        settledAt: ageDays > 3 ? iso(new Date(created.getTime() + 3 * DAY)) : null,
        createdAt: iso(created),
      });
    }
    return b;
  };

  const histStatus = (): BookingStatus =>
    faker.helpers.weightedArrayElement<BookingStatus>([
      { value: "DELIVERED", weight: 90 },
      { value: "CANCELLED", weight: 4 },
      { value: "REJECTED", weight: 2 },
      { value: "PAYMENT_FAILED", weight: 2 },
      { value: "DELIVERY_FAILED", weight: 2 },
    ]);

  const randomTime = (d: number) => daysAgo(d, faker.number.int({ min: 7, max: 20 }), faker.number.int({ min: 0, max: 59 }));

  for (const c of customers) {
    if (c.userId === riya.userId) continue; // scripted below
    if (c.type === "domestic") {
      // roughly every 28–40 days
      let d = faker.number.int({ min: 2, max: 30 });
      while (d < 90) {
        const created = randomTime(d);
        const st = d < 1 ? "PLACED" : histStatus();
        mkBooking({ customer: c, cylinderTypeId: faker.datatype.boolean(0.9) ? "cyl_14" : "cyl_5", qty: 1, createdAt: created, status: st });
        d += faker.number.int({ min: 26, max: 40 });
      }
    } else {
      // commercial: 2–3 bookings per week
      let d = faker.number.int({ min: 1, max: 4 });
      while (d < 90) {
        const created = randomTime(d);
        mkBooking({
          customer: c,
          cylinderTypeId: faker.datatype.boolean(0.85) ? "cyl_19" : "cyl_47",
          qty: faker.number.int({ min: 1, max: 3 }),
          createdAt: created,
          status: histStatus(),
        });
        d += faker.number.int({ min: 2, max: 4 });
      }
    }
  }

  // Riya: 30-day cycle history, last delivered 26 days ago → gauge ≈ 13%, due in ~4 days
  for (const d of [26, 56, 86, 116]) {
    const created = daysAgo(d + 1, 9, 30);
    mkBooking({ customer: riya, cylinderTypeId: "cyl_14", qty: 1, createdAt: created, status: "DELIVERED", method: "upi", deliveredAt: daysAgo(d, 11, 20), staffId: "stf_ramesh" });
  }
  riya.reminder = { enabled: true, nextDate: iso(daysAgo(-4, 9)), autoBook: false, avgCycleDays: 30 };

  // Today's live board for Suresh's agency
  const sureshCustomers = customers.filter((c) => c.assignedAgencyId === sureshAgency.id && c.userId !== riya.userId && c.userId !== imran.userId);
  const openCust = faker.helpers.shuffle(sureshCustomers).slice(0, 9);
  const todayStatuses: { status: BookingStatus; hourAgo: number; staff?: string | null; slot?: SlotType; method?: PaymentMethod }[] = [
    { status: "PLACED", hourAgo: 0.3, slot: "express" },
    { status: "PLACED", hourAgo: 0.8 },
    { status: "ACCEPTED", hourAgo: 1.5 },
    { status: "ASSIGNED", hourAgo: 2, staff: "stf_ramesh" },
    { status: "ASSIGNED", hourAgo: 2.5, staff: "stf_ramesh", method: "cod" },
    { status: "ASSIGNED", hourAgo: 3 },
    { status: "OUT_FOR_DELIVERY", hourAgo: 3.5 },
    { status: "DELIVERED", hourAgo: 5, staff: "stf_ramesh" },
    { status: "DELIVERY_FAILED", hourAgo: 6 },
  ];
  // remove any open bookings those customers already have to respect the "one open booking" rule
  todayStatuses.forEach((ts, i) => {
    const c = openCust[i];
    if (!c) return;
    for (let k = bookings.length - 1; k >= 0; k--) {
      const b = bookings[k];
      if (b.customerId === c.userId && !["DELIVERED", "REJECTED", "CANCELLED", "PAYMENT_FAILED"].includes(b.status)) bookings.splice(k, 1);
    }
    mkBooking({
      customer: c,
      cylinderTypeId: c.type === "domestic" ? "cyl_14" : "cyl_19",
      qty: c.type === "domestic" ? 1 : 2,
      createdAt: new Date(now.getTime() - ts.hourAgo * 3_600_000),
      status: ts.status,
      slot: ts.slot,
      method: ts.method,
      staffId: ts.staff,
    });
  });

  // Make sure demo customers have no open bookings
  for (let k = bookings.length - 1; k >= 0; k--) {
    const b = bookings[k];
    if ((b.customerId === riya.userId || b.customerId === imran.userId) && !["DELIVERED", "REJECTED", "CANCELLED", "PAYMENT_FAILED"].includes(b.status)) bookings.splice(k, 1);
  }

  bookings.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // Customer reminder estimates
  for (const c of customers) {
    if (c.userId === riya.userId) continue;
    const mine = bookings.filter((b) => b.customerId === c.userId);
    const cycle = estimateCycleDays(mine, c.type === "domestic" ? config.defaultCycleDays : 4);
    const last = mine.filter((b) => b.status === "DELIVERED").sort((a, b) => b.deliveredAt!.localeCompare(a.deliveredAt!))[0];
    c.reminder = {
      enabled: c.type === "domestic",
      autoBook: false,
      avgCycleDays: cycle,
      nextDate: last ? iso(new Date(new Date(last.deliveredAt!).getTime() + (cycle - config.reminderLeadDays) * DAY)) : null,
    };
  }

  // Cash in hand for staff with COD deliveries today
  for (const b of bookings) {
    if (b.status === "DELIVERED" && b.payment.method === "cod" && b.assignedStaffId && new Date(b.createdAt) > daysAgo(1)) {
      const s = staff.find((x) => x.id === b.assignedStaffId);
      if (s) s.cashInHand += b.charges.total;
    }
  }

  // ---------- Inventory entries (last 7 days) ----------
  for (const ag of approved) {
    for (let d = 6; d >= 0; d--) {
      inventoryEntries.push({ id: id("ie"), agencyId: ag.id, cylinderTypeId: "cyl_14", kind: "in", qty: faker.number.int({ min: 40, max: 120 }), note: "OMC truck", at: iso(daysAgo(d, 8)) });
      inventoryEntries.push({ id: id("ie"), agencyId: ag.id, cylinderTypeId: "cyl_14", kind: "out", qty: faker.number.int({ min: 35, max: 110 }), note: "Deliveries", at: iso(daysAgo(d, 19)) });
      if (d % 2 === 0) inventoryEntries.push({ id: id("ie"), agencyId: ag.id, cylinderTypeId: "cyl_19", kind: "in", qty: faker.number.int({ min: 10, max: 30 }), note: "OMC truck", at: iso(daysAgo(d, 8, 30)) });
    }
  }

  // ---------- Complaints ----------
  const complaintTexts: Record<Complaint["category"], string[]> = {
    delivery_delay: ["Booked express but cylinder came next day.", "Waited all morning, no update from the delivery boy."],
    wrong_cylinder: ["Received a 5 kg cylinder instead of 14.2 kg."],
    leak: ["Regulator seems loose, slight smell near the valve.", "Cylinder seal was broken on arrival."],
    staff_behaviour: ["Delivery person demanded ₹50 extra as tip."],
    payment: ["Paid via UPI but app showed payment failed; money deducted.", "COD amount charged more than the invoice."],
    other: ["Please update my registered address.", "Can I get an invoice with GST number?"],
  };
  const deliveredBookings = bookings.filter((b) => b.status === "DELIVERED" || b.status === "DELIVERY_FAILED");
  for (let i = 0; i < 14; i++) {
    const b = pick(deliveredBookings.slice(-120));
    const category = faker.helpers.weightedArrayElement<Complaint["category"]>([
      { value: "delivery_delay", weight: 4 },
      { value: "wrong_cylinder", weight: 1 },
      { value: "leak", weight: 2 },
      { value: "staff_behaviour", weight: 1 },
      { value: "payment", weight: 3 },
      { value: "other", weight: 2 },
    ]);
    const createdAt = new Date(new Date(b.createdAt).getTime() + 5 * 3_600_000);
    complaints.push({
      id: id("cmp"),
      bookingId: b.id,
      customerId: b.customerId,
      agencyId: b.agencyId,
      category,
      text: pick(complaintTexts[category]),
      status: faker.helpers.weightedArrayElement<Complaint["status"]>([
        { value: "open", weight: 3 },
        { value: "in_progress", weight: 2 },
        { value: "resolved", weight: 6 },
        { value: "escalated", weight: 2 },
      ]),
      createdAt: iso(createdAt),
      updatedAt: iso(new Date(createdAt.getTime() + 2 * 3_600_000)),
    });
  }
  complaints.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // ---------- Transfer requests ----------
  const movers = customers.filter((c) => c.assignedAgencyId !== sureshAgency.id).slice(0, 2);
  movers.forEach((c, i) => {
    transferRequests.push({
      id: id("trf"),
      customerId: c.userId,
      fromAgencyId: c.assignedAgencyId!,
      toAgencyId: sureshAgency.id,
      reason: i === 0 ? "Moved to Amberpet last month" : "Current agency is always late",
      status: "pending",
      createdAt: iso(daysAgo(i + 1, 14)),
    });
  });
  const leaver = customers.find((c) => c.assignedAgencyId === sureshAgency.id && c.userId !== riya.userId && c.userId !== imran.userId)!;
  transferRequests.push({
    id: id("trf"),
    customerId: leaver.userId,
    fromAgencyId: sureshAgency.id,
    toAgencyId: "ag_secunderabad",
    reason: "Shifting house to Secunderabad",
    status: "pending",
    createdAt: iso(daysAgo(3, 11)),
  });

  // ---------- Notifications for Riya ----------
  const riyaLast = bookings.filter((b) => b.customerId === riya.userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const notes: [number, string, string, Notification["type"]][] = [
    [0.1, "Refill due soon", "Your gas is running low — about 4 days left. Book now to avoid running out.", "reminder"],
    [2, "Monsoon safety tip", "Keep the regulator knob off when not cooking. Call 1906 for any leak emergency.", "system"],
    [9, "₹20 off on Express", "Try Express delivery this week and get ₹20 off the express fee.", "offer"],
    [26, "Delivered ✅", `Booking ${riyaLast?.code} delivered by Ramesh. Next refill reminder set.`, "status"],
    [26.1, "Out for delivery", `Ramesh is on the way with your 14.2 kg cylinder. OTP ${riyaLast?.deliveryOtp}.`, "status"],
    [27, "Booking accepted", `${sureshAgency.name} accepted booking ${riyaLast?.code}.`, "status"],
  ];
  notes.forEach(([d, title, body, type]) => {
    notifications.push({ id: id("ntf"), userId: riya.userId, title, body, type, read: d > 5, bookingId: type === "status" ? riyaLast?.id : undefined, createdAt: iso(new Date(now.getTime() - d * DAY)) });
  });

  return {
    config,
    users,
    customers,
    agencies,
    cylinderTypes: CYLINDER_TYPES,
    prices,
    inventory,
    inventoryEntries,
    staff,
    bookings,
    settlements,
    complaints,
    transferRequests,
    notifications,
    subscriptionInvoices,
    demo: {
      riyaId: riya.userId,
      imranId: imran.userId,
      rameshStaffId: "stf_ramesh",
      rameshUserId: "usr_ramesh",
      sureshUserId: "usr_suresh",
      sureshAgencyId: sureshAgency.id,
      adminUserId: admin.id,
      pendingAgencyId: "ag_uppal",
    },
  };
}
