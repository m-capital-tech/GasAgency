import assert from "node:assert/strict";
import { DemoEngine } from "./engine";

const e = new DemoEngine();
const events: string[] = [];
e.on((ev) => events.push(ev.type));
const { riyaId, imranId, rameshStaffId, sureshAgencyId } = e.state.demo;

// auth
assert.throws(() => e.verifyOtp("9000000001", "000000"), /Incorrect OTP/);
const login = e.verifyOtp("9000000001", "123456");
assert.equal(login.user.name, "Riya Sharma");

// usage gauge
const usage = e.usage(riyaId);
console.log("riya gauge", usage.pct, "% ,", usage.daysLeft, "days left, cycle", usage.cycleDays);
assert.ok(usage.pct > 5 && usage.pct < 25);

// quote + booking + payment
const q = e.quote(riyaId, [{ cylinderTypeId: "cyl_14", qty: 1 }], "express");
assert.equal(q.violation, null);
assert.equal(q.charges.express, 49);
const riya = e.customer(riyaId);
const b = e.createBooking({ customerId: riyaId, addressId: riya.defaultAddressId, items: [{ cylinderTypeId: "cyl_14", qty: 1 }], slot: "express", paymentMethod: "upi" });
assert.equal(b.status, "PENDING_PAYMENT");
// duplicate open booking blocked
assert.throws(() => e.createBooking({ customerId: riyaId, addressId: riya.defaultAddressId, items: [{ cylinderTypeId: "cyl_14", qty: 1 }], slot: "standard", paymentMethod: "cod" }), /open booking/);
// payment fail → retry → cod fallback
e.recordPayment(b.id, { ok: false, error: "declined" });
assert.equal(b.status, "PAYMENT_FAILED");
e.switchToCod(b.id);
assert.equal(b.status, "PLACED");
assert.equal(b.payment.status, "COD_PENDING");

// agency accept + auto-assign
e.accept(b.id);
e.autoAssign(b.id);
assert.equal(b.status, "ASSIGNED");
assert.ok(b.assignedStaffId);

// delivery: start trip, tick, wrong otp, right otp
e.startTrip(b.id);
assert.equal(b.status, "OUT_FOR_DELIVERY");
const eta0 = b.etaMinutes!;
e.tick(); e.tick(); e.tick();
assert.ok(b.etaMinutes! < eta0, "eta falls");
assert.throws(() => e.completeDelivery(b.id, { otp: "0000", cashCollected: true }), /Incorrect delivery OTP/);
assert.throws(() => e.completeDelivery(b.id, { otp: b.deliveryOtp }), /cash/);
const done = e.completeDelivery(b.id, { otp: b.deliveryOtp, cashCollected: true, emptyCollected: true });
assert.equal(done.status, "DELIVERED");
assert.ok(e.customer(riyaId).reminder.nextDate, "reminder scheduled");
console.log("next reminder", e.customer(riyaId).reminder.nextDate);
assert.ok(e.staff(b.assignedStaffId!).cashInHand > 0);

// min gap rule now applies
const q2 = e.quote(riyaId, [{ cylinderTypeId: "cyl_14", qty: 1 }], "standard");
assert.equal(q2.violation?.code, "MIN_GAP");

// commercial: quantity > 1 allowed, no gap
const imran = e.customer(imranId);
const b2 = e.createBooking({ customerId: imranId, addressId: imran.defaultAddressId, items: [{ cylinderTypeId: "cyl_19", qty: 3 }], slot: "standard", paymentMethod: "cod" });
assert.equal(b2.status, "PLACED");
e.advance(b2.id); e.advance(b2.id); e.advance(b2.id);
assert.equal(b2.status, "OUT_FOR_DELIVERY");
e.simulate("delivery_failure");
assert.equal(b2.status, "DELIVERY_FAILED");
e.reschedule(b2.id);
assert.equal(b2.status, "ACCEPTED");
e.cancel(b2.id, "test");
assert.equal(b2.status, "CANCELLED");

// admin approve pending agency then it is selectable
const pending = e.agency(e.state.demo.pendingAgencyId);
assert.equal(pending.status, "pending");
e.setAgencyStatus(pending.id, "approved");
assert.ok(e.nearestAgencies({ lat: 17.4056, lng: 78.5591 }, "500039")[0].id === pending.id);

// dashboards non-empty
const dash = e.agencyDashboard(sureshAgencyId);
assert.ok(dash.series30.some((d) => d.orders > 0));
const ov = e.adminOverview();
assert.ok(ov.kpis.gmv > 0 && ov.weekly.length === 13);
console.log("admin kpis", ov.kpis, ov.revenueSplit);

// burst + reset
e.simulate("order_burst");
assert.ok(e.listBookings({ agencyId: sureshAgencyId, status: ["PLACED"] }).length >= 5);
e.reset();
assert.equal(e.listBookings({ customerId: riyaId }).length, 4);
assert.ok(events.includes("booking.created") && events.includes("staff.location") && events.includes("demo.reset"));
console.log("drops for ramesh", e.dropsFor(rameshStaffId).pending.map((d) => [d.code, d.status]));
console.log("✅ engine tests passed");
e.destroy();
