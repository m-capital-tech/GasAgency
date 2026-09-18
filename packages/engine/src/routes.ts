import { createBookingSchema, standingOrderSchema, type BookingStatus } from "@gassetu/shared";
import type { DemoEngine, SimulationKind } from "./engine";
import { EngineError } from "./errors";

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export interface Req {
  method: Method;
  path: string;
  query: Record<string, string>;
  body: any;
  userId?: string;
}
type Handler = (e: DemoEngine, p: Record<string, string>, req: Req) => unknown;
interface Route {
  method: Method;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
}

const routes: Route[] = [];
function add(method: Method, path: string, handler: Handler) {
  const keys: string[] = [];
  const pattern = new RegExp("^" + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), "([^/]+)")) + "/?$");
  routes.push({ method, pattern, keys, handler });
}
const str = (v: unknown, name: string) => {
  if (typeof v !== "string" || !v) throw new EngineError("VALIDATION", `${name} is required`);
  return v;
};
const num = (v: unknown, name: string) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new EngineError("VALIDATION", `${name} must be a number`);
  return n;
};

// ---- auth
add("POST", "/auth/otp", (e, _p, r) => e.requestOtp(str(r.body?.phone, "phone")));
add("POST", "/auth/verify", (e, _p, r) => e.verifyOtp(str(r.body?.phone, "phone"), str(r.body?.otp, "otp")));
add("POST", "/auth/login", (e, _p, r) => e.loginEmail(str(r.body?.email, "email"), str(r.body?.password, "password")));
add("GET", "/me/:userId", (e, p) => {
  const user = e.user(p.userId);
  return { user, profile: e.profileFor(user) };
});

// ---- businesses (customer side)
add("GET", "/businesses/:id", (e, p) => e.expandBusiness(e.business(p.id)));
add("PUT", "/businesses/:id/profile", (e, p, r) => e.upsertBusiness(p.id, r.body));
add("POST", "/businesses/:id/outlets", (e, p, r) => e.addOutlet(p.id, r.body));
add("PATCH", "/businesses/:id/outlets/:outletId", (e, p, r) => e.updateOutlet(p.id, p.outletId, r.body));
add("POST", "/businesses/:id/outlets/:outletId/default", (e, p) => e.setDefaultOutlet(p.id, p.outletId));
add("POST", "/businesses/:id/connection", (e, p, r) => e.linkConnection(p.id, r.body.omc, str(r.body?.consumerNo, "consumerNo")));
add("POST", "/businesses/:id/assign-agency", (e, p) => e.autoAssignAgency(p.id));
add("POST", "/businesses/:id/transfer-request", (e, p, r) => e.requestTransfer(p.id, str(r.body?.reason, "reason"), r.body?.toAgencyId ?? null));
add("GET", "/businesses/:id/transfer-requests", (e, p) => e.state.transferRequests.filter((t) => t.businessId === p.id).map((t) => ({ ...t, fromAgencyName: e.agency(t.fromAgencyId).name, toAgencyName: t.toAgencyId ? e.agency(t.toAgencyId).name : null })));
add("POST", "/businesses/:id/credit/request", (e, p, r) => e.requestCredit(p.id, r.body?.note));
add("GET", "/businesses/:id/ledger", (e, p) => e.ledgerFor(p.id));
add("POST", "/businesses/:id/ledger/payment", (e, p, r) => e.recordCreditPayment(p.id, num(r.body?.amount, "amount"), r.body?.note));
add("GET", "/businesses/:id/statements", (e, p) => e.statementMonths(p.id));
add("GET", "/businesses/:id/statements/:month", (e, p) => e.statement(p.id, p.month));
add("GET", "/businesses/:id/complaints", (e, p) => e.state.complaints.filter((c) => c.businessId === p.id).map((c) => e.expandComplaint(c)));
add("POST", "/businesses/:id/complaints", (e, p, r) => e.createComplaint(p.id, r.body));
add("PUT", "/businesses/:id/standing-orders", (e, p, r) => {
  const parsed = standingOrderSchema.safeParse(r.body);
  if (!parsed.success) throw new EngineError("VALIDATION", parsed.error.issues.map((i) => i.message).join(", "));
  return e.upsertStandingOrder(p.id, { ...parsed.data, days: parsed.data.days as any, id: r.body?.id });
});
add("DELETE", "/businesses/:id/standing-orders/:soId", (e, p) => e.deleteStandingOrder(p.id, p.soId));
add("POST", "/businesses/:id/standing-orders/:soId/run", (e, p) => e.runStandingOrder(p.id, p.soId));
add("GET", "/users/:id/notifications", (e, p) => e.notificationsFor(p.id));
add("POST", "/users/:id/notifications/read", (e, p, r) => e.markRead(p.id, r.body?.id));

// ---- agencies (public)
add("GET", "/agencies", (e, _p, r) => e.state.agencies.filter((a) => !r.query.status || a.status === r.query.status).map((a) => e.agencyCard(a)));
add("GET", "/agencies/nearest", (e, _p, r) => e.nearestAgencies({ lat: num(r.query.lat, "lat"), lng: num(r.query.lng, "lng") }, r.query.pincode));
add("GET", "/agencies/:id", (e, p) => e.agencyCard(e.agency(p.id)));
add("POST", "/agencies/register", (e, _p, r) => e.registerAgency(r.body));
add("GET", "/cylinder-types", (e) => e.state.cylinderTypes);
add("GET", "/config", (e) => e.config);

// ---- agency panel
add("GET", "/agency/:id/dashboard", (e, p) => e.agencyDashboard(p.id));
add("GET", "/agency/:id/staff", (e, p) => e.state.staff.filter((s) => s.agencyId === p.id).map((s) => e.expandStaff(s)));
add("POST", "/agency/:id/staff", (e, p, r) => e.upsertStaff(p.id, r.body));
add("GET", "/agency/:id/accounts", (e, p) => e.agencyAccounts(p.id));
add("GET", "/agency/:id/account-prices", (e, p) => e.state.accountPrices.filter((x) => x.agencyId === p.id));
add("PUT", "/agency/:id/accounts/:businessId/price", (e, p, r) => e.setAccountPrice(p.id, p.businessId, str(r.body?.cylinderTypeId, "cylinderTypeId"), r.body?.price == null ? null : num(r.body.price, "price")));
add("POST", "/agency/:id/accounts/:businessId/payment", (e, p, r) => e.recordCreditPayment(p.businessId, num(r.body?.amount, "amount"), r.body?.note ?? "Collected by agency"));
add("POST", "/agency/:id/campaign", (e, p, r) => e.runCampaign(p.id, r.body?.businessIds ?? []));
add("GET", "/agency/:id/inventory", (e, p) => e.agencyInventory(p.id));
add("POST", "/agency/:id/inventory", (e, p, r) => e.addInventoryEntry(p.id, { cylinderTypeId: str(r.body?.cylinderTypeId, "cylinderTypeId"), kind: r.body.kind, qty: num(r.body?.qty, "qty"), note: r.body?.note }));
add("GET", "/agency/:id/prices", (e, p) => e.state.prices.filter((x) => x.agencyId === p.id));
add("PUT", "/agency/:id/prices", (e, p, r) => e.updatePrices(p.id, r.body?.rows ?? []));
add("PATCH", "/agency/:id", (e, p, r) => e.updateAgency(p.id, r.body));
add("GET", "/agency/:id/settlements", (e, p) => e.agencySettlements(p.id));
add("GET", "/agency/:id/complaints", (e, p) => e.state.complaints.filter((c) => c.agencyId === p.id).map((c) => e.expandComplaint(c)));
add("GET", "/agency/:id/transfers", (e, p) => e.state.transferRequests.filter((t) => t.fromAgencyId === p.id || t.toAgencyId === p.id).map((t) => ({ ...t, businessName: e.business(t.businessId).name, contactPhone: e.user(t.businessId).phone, fromAgencyName: e.agency(t.fromAgencyId).name, toAgencyName: t.toAgencyId ? e.agency(t.toAgencyId).name : null })));
add("GET", "/agency/:id/invoices", (e, p) => e.state.subscriptionInvoices.filter((i) => i.agencyId === p.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)));
add("POST", "/transfers/:id/resolve", (e, p, r) => e.resolveTransfer(p.id, !!r.body?.approve));
add("PATCH", "/complaints/:id", (e, p, r) => e.updateComplaint(p.id, r.body.status));

// ---- bookings
add("GET", "/bookings", (e, _p, r) => e.listBookings({ businessId: r.query.businessId, agencyId: r.query.agencyId, staffId: r.query.staffId, outletId: r.query.outletId, status: r.query.status ? (r.query.status.split(",") as BookingStatus[]) : undefined, since: r.query.since }));
add("POST", "/bookings/quote", (e, _p, r) => e.quote(str(r.body?.businessId, "businessId"), r.body.items, r.body.slot, r.body.paymentMethod));
add("POST", "/bookings", (e, _p, r) => {
  const parsed = createBookingSchema.safeParse(r.body);
  if (!parsed.success) throw new EngineError("VALIDATION", parsed.error.issues.map((i) => i.message).join(", "));
  return e.expandBooking(e.createBooking(parsed.data));
});
add("GET", "/bookings/:id", (e, p) => e.expandBooking(e.booking(p.id)));
add("PATCH", "/bookings/:id/status", (e, p, r) => {
  const to = r.body?.status as BookingStatus;
  const by = r.body?.by ?? "agency";
  switch (to) {
    case "ACCEPTED":
      return e.expandBooking(e.booking(p.id).status === "DELIVERY_FAILED" ? e.reschedule(p.id) : e.booking(p.id).status === "ASSIGNED" ? e.unassign(p.id) : e.accept(p.id, by));
    case "REJECTED":
      return e.expandBooking(e.reject(p.id, r.body?.reason ?? "Unable to fulfil", by));
    case "CANCELLED":
      return e.expandBooking(e.cancel(p.id, r.body?.reason ?? "Cancelled", by === "business" ? "business" : "agency"));
    default:
      throw new EngineError("VALIDATION", `Use the dedicated endpoint for ${to}`);
  }
});
add("POST", "/bookings/:id/assign", (e, p, r) => e.expandBooking(r.body?.auto || !r.body?.staffId ? e.autoAssign(p.id) : e.assign(p.id, r.body.staffId)));
add("POST", "/bookings/:id/start-trip", (e, p) => e.startTrip(p.id));
add("POST", "/bookings/:id/complete", (e, p, r) => e.completeDelivery(p.id, { otp: str(r.body?.otp, "otp"), cashCollected: !!r.body?.cashCollected, emptiesCollected: r.body?.emptiesCollected == null ? undefined : num(r.body.emptiesCollected, "emptiesCollected") }));
add("POST", "/bookings/:id/fail", (e, p, r) => e.failDelivery(p.id, r.body?.reason ?? "other", r.body?.notes));
add("POST", "/bookings/:id/retry-payment", (e, p) => e.expandBooking(e.retryPayment(p.id)));
add("POST", "/bookings/:id/switch-payment", (e, p, r) => e.expandBooking(e.switchPayment(p.id, r.body?.method === "credit" ? "credit" : "cod")));
add("POST", "/bookings/bulk", (e, _p, r) => {
  const ids: string[] = r.body?.ids ?? [];
  const action = r.body?.action as "accept" | "auto_assign";
  let updated = 0;
  for (const id of ids) {
    try {
      action === "accept" ? e.accept(id) : e.autoAssign(id);
      updated++;
    } catch {
      /* skip invalid */
    }
  }
  return { updated };
});

// ---- payments (mock Razorpay)
add("POST", "/payments/mock/order", (e, _p, r) => {
  const b = e.booking(str(r.body?.bookingId, "bookingId"));
  return { orderId: `order_mock_${b.id}`, amount: Math.round(b.charges.total * 100), currency: "INR", bookingId: b.id, key: "rzp_test_mock" };
});
add("POST", "/payments/mock/checkout", (e, _p, r) => e.expandBooking(e.recordPayment(str(r.body?.bookingId, "bookingId"), { ok: !!r.body?.ok, paymentId: r.body?.paymentId, method: r.body?.method, error: r.body?.error })));

// ---- delivery
add("GET", "/staff/:id", (e, p) => e.expandStaff(e.staff(p.id)));
add("GET", "/staff/:id/drops", (e, p) => e.dropsFor(p.id));
add("PATCH", "/staff/:id/online", (e, p, r) => e.setStaffOnline(p.id, !!r.body?.online));
add("POST", "/staff/:id/deposit", (e, p) => e.depositCash(p.id));

// ---- admin
add("GET", "/admin/overview", (e) => e.adminOverview());
add("GET", "/admin/agencies", (e) => e.state.agencies.map((a) => ({ ...e.agencyCard(a), ownerName: e.user(a.ownerUserId).name, ownerEmail: e.user(a.ownerUserId).email, staffCount: e.state.staff.filter((s) => s.agencyId === a.id).length, accountCount: e.state.businesses.filter((b) => b.assignedAgencyId === a.id).length, orders30: e.state.bookings.filter((b) => b.agencyId === a.id && Date.now() - new Date(b.createdAt).getTime() < 30 * 86400000).length, onTimePct: Math.round(e.state.staff.filter((s) => s.agencyId === a.id).reduce((s, x) => s + x.onTimePct, 0) / Math.max(1, e.state.staff.filter((s) => s.agencyId === a.id).length)) })));
add("POST", "/admin/agencies/:id/status", (e, p, r) => e.setAgencyStatus(p.id, r.body.status));
add("GET", "/admin/businesses", (e, _p, r) => e.adminBusinesses(r.query.q ?? ""));
add("POST", "/admin/businesses/:id/status", (e, p, r) => e.setBusinessStatus(p.id, { status: r.body?.status, credit: r.body?.credit, by: r.userId ?? "admin" }));
add("GET", "/admin/complaints", (e) => e.state.complaints.map((c) => e.expandComplaint(c)));
add("GET", "/admin/transfers", (e) => e.state.transferRequests.map((t) => ({ ...t, businessName: e.business(t.businessId).name, fromAgencyName: e.agency(t.fromAgencyId).name, toAgencyName: t.toAgencyId ? e.agency(t.toAgencyId).name : null })));
add("GET", "/admin/config", (e) => e.config);
add("PATCH", "/admin/config", (e, _p, r) => e.updateConfig(r.body));

// ---- demo controls
add("GET", "/demo/personas", (e) => e.personas());
add("GET", "/demo/state", (e) => ({ ...e.demo, trips: [...e.trips.values()].map((t) => ({ staffId: t.staffId, bookingId: t.bookingId, index: t.index, total: t.route.length })) }));
add("POST", "/demo/reset", (e) => (e.reset(), { ok: true }));
add("POST", "/demo/advance/:bookingId", (e, p) => {
  e.advance(p.bookingId);
  return e.expandBooking(e.booking(p.bookingId));
});
add("POST", "/demo/simulate", (e, _p, r) => e.simulate(r.body?.kind as SimulationKind, r.body?.agencyId));
add("POST", "/demo/speed", (e, _p, r) => e.setSpeed(num(r.body?.speed, "speed")));
add("POST", "/demo/bypass-rules", (e, _p, r) => e.setBypassRules(!!r.body?.enabled));
add("GET", "/health", () => ({ ok: true, ts: Date.now() }));

export function handle(engine: DemoEngine, req: Req): { status: number; body: unknown } {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.pattern.exec(req.path);
    if (!m) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    try {
      const body = r.handler(engine, params, req);
      return { status: 200, body: body ?? { ok: true } };
    } catch (err) {
      if (err instanceof EngineError) return { status: err.status, body: { error: { code: err.code, message: err.message } } };
      if (err instanceof Error && /Invalid transition/.test(err.message)) return { status: 409, body: { error: { code: "BAD_TRANSITION", message: err.message } } };
      console.error(err);
      return { status: 500, body: { error: { code: "INTERNAL", message: (err as Error).message } } };
    }
  }
  return { status: 404, body: { error: { code: "NO_ROUTE", message: `No route ${req.method} ${req.path}` } } };
}

export const routeList = () => routes.map((r) => `${r.method} ${r.pattern.source}`);
