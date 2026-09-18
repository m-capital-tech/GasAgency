import { generateSeed } from "./seed";
const s = generateSeed();
const byStatus: Record<string, number> = {};
s.bookings.forEach((b) => (byStatus[b.status] = (byStatus[b.status] ?? 0) + 1));
const byMethod: Record<string, number> = {};
s.bookings.forEach((b) => (byMethod[b.payment.method] = (byMethod[b.payment.method] ?? 0) + 1));
const gmv = s.bookings.filter((b) => b.status === "DELIVERED").reduce((x, b) => x + b.charges.total, 0);
console.log({
  users: s.users.length,
  businesses: s.businesses.length,
  multiOutlet: s.businesses.filter((b) => b.outlets.length > 1).length,
  creditApproved: s.businesses.filter((b) => b.credit.status === "approved").length,
  bookings: s.bookings.length,
  gmvLakh: Math.round(gmv / 1e5),
  byStatus,
  byMethod,
  ledger: s.ledger.length,
  imran: s.bookings.filter((b) => b.businessId === s.demo.imranId).length + " bookings",
  imranOutlets: s.businesses.find((b) => b.userId === s.demo.imranId)!.outlets.map((o) => [o.label, o.inUse, o.spareFull, o.cylindersPerWeek]),
  todaySuresh: s.bookings.filter((b) => b.agencyId === s.demo.sureshAgencyId && new Date(b.createdAt) > new Date(Date.now() - 86400000)).map((b) => [b.code, b.status, b.assignedStaffId, b.payment.method]),
});
