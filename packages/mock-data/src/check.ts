import { generateSeed } from "./seed";
const s = generateSeed();
const byStatus: Record<string, number> = {};
s.bookings.forEach((b) => (byStatus[b.status] = (byStatus[b.status] ?? 0) + 1));
console.log({
  users: s.users.length,
  customers: s.customers.length,
  agencies: s.agencies.length,
  staff: s.staff.length,
  bookings: s.bookings.length,
  settlements: s.settlements.length,
  complaints: s.complaints.length,
  byStatus,
  riyaBookings: s.bookings.filter((b) => b.customerId === s.demo.riyaId).map((b) => [b.code, b.status, b.deliveredAt]),
  todaySuresh: s.bookings.filter((b) => b.agencyId === s.demo.sureshAgencyId && new Date(b.createdAt) > new Date(Date.now() - 86400000)).map((b) => [b.code, b.status, b.assignedStaffId]),
});
