import assert from "node:assert/strict";
import { DemoEngine } from "./engine";

const e = new DemoEngine();
const events: string[] = [];
e.on((ev) => events.push(ev.type));
const { imranId, fatimaId, rameshStaffId, sureshAgencyId, pendingBusinessId } = e.state.demo;

// auth
assert.throws(() => e.verifyOtp("9000000001", "000000"), /Incorrect OTP/);
const login = e.verifyOtp("9000000001", "123456");
assert.equal(login.user.name, "Imran Khan");
assert.equal((login.profile as any).name, "Al-Madina Tiffin Centre");

// dashboard data
const imran = e.expandBusiness(e.business(imranId));
console.log("imran outlets", imran.outlets.map((o) => [o.label, `${o.daysLeft}d left`, o.lowStock]), "credit avail", imran.creditAvailable, "usual", imran.usualOrder);
assert.equal(imran.outlets.length, 2);
assert.ok(imran.outlets[0].daysLeft <= 2, "main kitchen is nearly out");
assert.equal(imran.credit.status, "approved");

// quote: slab pricing + credit
const q = e.quote(imranId, [{ cylinderTypeId: "cyl_19", qty: 5 }], "tomorrow_morning", "credit");
assert.equal(q.violation, null);
assert.ok(q.items[0].unitPrice < q.items[0].basePrice, "slab discount applied at 5+");
assert.ok(q.charges.slabDiscount > 0);
assert.ok(q.charges.gst > 0);
assert.equal(q.creditAllowed, true);

// credit limit rule
const big = e.quote(imranId, [{ cylinderTypeId: "cyl_47", qty: 12 }], "standard", "credit");
assert.equal(big.violation?.code, "CREDIT_LIMIT");
// quantity cap
assert.equal(e.quote(imranId, [{ cylinderTypeId: "cyl_19", qty: 25 }], "standard", "upi").violation?.code, "QTY_CAP");
// fatima: credit requested but not approved
assert.equal(e.quote(fatimaId, [{ cylinderTypeId: "cyl_19", qty: 2 }], "standard", "credit").violation?.code, "CREDIT_NOT_APPROVED");
assert.equal(e.quote(fatimaId, [{ cylinderTypeId: "cyl_19", qty: 2 }], "standard", "upi").violation, null);

// order on credit → placed immediately, two open orders allowed
const b = e.createBooking({ businessId: imranId, outletId: imran.outlets[0].id, items: [{ cylinderTypeId: "cyl_19", qty: 3 }], slot: "tomorrow_morning", paymentMethod: "credit", emptiesToCollect: 3 });
assert.equal(b.status, "PLACED");
assert.equal(b.payment.status, "CREDIT_DUE");
const b2 = e.createBooking({ businessId: imranId, outletId: imran.outlets[1].id, items: [{ cylinderTypeId: "cyl_19", qty: 1 }], slot: "standard", paymentMethod: "upi" });
assert.equal(b2.status, "PENDING_PAYMENT");
e.recordPayment(b2.id, { ok: false, error: "declined" });
assert.equal(b2.status, "PAYMENT_FAILED");
e.switchPayment(b2.id, "credit");
assert.equal(b2.status, "PLACED");

// agency accept + auto-assign → Ramesh
e.accept(b.id);
e.autoAssign(b.id);
assert.equal(b.assignedStaffId, rameshStaffId);

// delivery with empties, credit invoice, outlet stock
const spareBefore = e.business(imranId).outlets[0].spareFull;
e.startTrip(b.id);
e.tick(); e.tick();
assert.throws(() => e.completeDelivery(b.id, { otp: "0000" }), /Incorrect delivery OTP/);
const done = e.completeDelivery(b.id, { otp: b.deliveryOtp, emptiesCollected: 2 });
assert.equal(done.status, "DELIVERED");
assert.equal(done.emptiesCollected, 2);
assert.ok(b.payment.dueAt, "credit invoice has a due date");
assert.equal(e.business(imranId).outlets[0].spareFull, spareBefore + 3);
assert.ok(e.ledgerFor(imranId)[0].kind === "invoice");
console.log("credit outstanding after delivery", e.expandBusiness(e.business(imranId)).creditOutstanding);

// pay off invoices
const outstanding = e.expandBusiness(e.business(imranId)).creditOutstanding;
const pay = e.recordCreditPayment(imranId, outstanding, "NEFT");
assert.ok(pay.paidInvoices.length >= 1);
assert.equal(e.expandBusiness(e.business(imranId)).creditOutstanding, 0);

// statement
const months = e.statementMonths(imranId);
const st = e.statement(imranId, months[0]);
assert.ok(st.totals.orders > 0 && st.totals.gst > 0);

// standing order run
const so = e.business(imranId).standingOrders[0];
const run = e.runStandingOrder(imranId, so.id);
assert.equal(run.status, "PLACED");
assert.equal(run.standingOrderId, so.id);

// overdue simulation blocks credit
e.simulate("overdue_invoice");
assert.equal(e.quote(imranId, [{ cylinderTypeId: "cyl_19", qty: 1 }], "standard", "credit").violation?.code, "CREDIT_OVERDUE");
e.setBypassRules(true);
assert.equal(e.quote(imranId, [{ cylinderTypeId: "cyl_19", qty: 1 }], "standard", "credit").violation, null);
e.setBypassRules(false);

// admin: verify pending business + approve credit in one go; approve Fatima's request
const pb = e.setBusinessStatus(pendingBusinessId, { status: "verified", credit: { status: "approved", limit: 100000, termDays: 30 }, by: "usr_admin" });
assert.equal(pb.status, "verified");
assert.equal(pb.credit.limit, 100000);
e.setBusinessStatus(fatimaId, { credit: { status: "approved", limit: 75000, termDays: 15 } });
assert.equal(e.quote(fatimaId, [{ cylinderTypeId: "cyl_19", qty: 2 }], "standard", "credit").violation, null);

// pending agency approval + nearest
e.setAgencyStatus(e.state.demo.pendingAgencyId, "approved");
assert.equal(e.nearestAgencies({ lat: 17.4056, lng: 78.5591 }, "500039")[0].id, e.state.demo.pendingAgencyId);

// new business onboarding
const nu = e.verifyOtp("9876501234", "123456");
assert.equal(nu.isNew, true);
const prof = e.upsertBusiness(nu.user.id, { ownerName: "Test Owner", name: "Test Dhaba", type: "restaurant", outlet: { label: "Main kitchen", line1: "1-2-3 Road", pincode: "500013", lat: 17.396, lng: 78.521, inUse: 2, spareFull: 1, cylindersPerWeek: 4 } });
assert.equal(prof.status, "pending");
const asg = e.autoAssignAgency(nu.user.id);
assert.equal(asg.agency.id, sureshAgencyId);
assert.equal(e.business(nu.user.id).status, "verified");

// dashboards
const dash = e.agencyDashboard(sureshAgencyId);
assert.ok(dash.kpis.receivables > 0 && dash.series30.some((d) => d.cylinders > 0));
const stl = e.agencySettlements(sureshAgencyId);
assert.ok(stl.receivables.length > 0 && stl.aging.length === 4);
const ov = e.adminOverview();
assert.ok(ov.kpis.gmv > 1e7 && ov.revenueSplit.length === 5);
console.log("admin", ov.kpis, ov.revenueSplit);

// burst + reset
e.simulate("order_burst");
e.reset();
assert.equal(e.business(imranId).standingOrders.length, 1);
assert.ok(events.includes("booking.created") && events.includes("staff.location") && events.includes("demo.reset"));
console.log("drops for ramesh", e.dropsFor(rameshStaffId).pending.map((d) => [d.code, d.status, d.cylinders]));
console.log("✅ engine tests passed");
e.destroy();
