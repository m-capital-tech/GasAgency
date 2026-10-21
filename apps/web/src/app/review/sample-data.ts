import type { AdminDashboard, DashboardPeriod } from "@/lib/control-api";

const multipliers: Record<DashboardPeriod, number> = {
  daily: 1,
  weekly: 6.7,
  monthly: 27.5,
};

const previousMultipliers: Record<DashboardPeriod, number> = {
  daily: 0.88,
  weekly: 5.9,
  monthly: 24.2,
};

const labels: Record<DashboardPeriod, string> = {
  daily: "Today",
  weekly: "This week",
  monthly: "This month",
};

function rounded(value: number) {
  return Math.round(value);
}

export function sampleDashboard(period: DashboardPeriod): AdminDashboard {
  const current = multipliers[period];
  const previous = previousMultipliers[period];

  return {
    period,
    periodLabel: labels[period],
    timezone: "Asia/Kolkata",
    audience: "super_admin",
    scope: { global: true, regions: ["South"], cities: ["Bengaluru", "Hyderabad", "Chennai"], agencyCount: 12, tenantCount: 184 },
    window: { currentStart: "2026-10-21T00:00:00.000+05:30", previousStart: "2026-10-20T00:00:00.000+05:30", currentEnd: "2026-10-21T23:59:59.999+05:30" },
    performance: {
      current: { orders: rounded(38 * current), gmv: String(184_600 * current), cylinders: rounded(62 * current), delivered: rounded(31 * current), collections: String(126_400 * current) },
      previous: { orders: rounded(38 * previous), gmv: String(184_600 * previous), cylinders: rounded(62 * previous), delivered: rounded(31 * previous), collections: String(126_400 * previous) },
    },
    footprint: { activeTenants: 172, activeAgencies: 11 },
    onboarding: { drafts: 7, pendingApprovals: 4, approvalSlaBreaches: 1, approvals: rounded(3 * current), rejections: rounded(0.4 * current), invitations: rounded(3 * current), firstLogins: rounded(2.5 * current), firstOrders: rounded(2.1 * current) },
    credit: { approvedLimit: "8450000", outstanding: "2715000", overdue: "318000", overdueAccounts: 6, aging: { current: "1820000", days_1_30: "576000", days_31_60: "214000", days_61_90: "72000", days_90_plus: "33000" } },
    attention: { approvalSlaBreaches: 1, lowStockAgencies: 2, overdueAccounts: 6, deliveryFailures: rounded(2 * current), messagingFailures: 0 },
    orderStates: [
      { status: "placed", count: rounded(7 * current), value: String(31_000 * current), cylinders: rounded(10 * current) },
      { status: "out_for_delivery", count: rounded(5 * current), value: String(26_500 * current), cylinders: rounded(9 * current) },
      { status: "delivered", count: rounded(25 * current), value: String(122_000 * current), cylinders: rounded(41 * current) },
      { status: "delivery_failed", count: rounded(1 * current), value: String(5_100 * current), cylinders: rounded(2 * current) },
    ],
    agencies: [
      { publicId: "sample-agency-1", displayName: "Central Commercial Gas", city: "Bengaluru", orders: rounded(14 * current), gmv: String(71_200 * current), delivered: rounded(12 * current), backlog: 2, failures: 0, medianAcceptanceMinutes: 7, lowStockItems: 0 },
      { publicId: "sample-agency-2", displayName: "Metro LPG Services", city: "Hyderabad", orders: rounded(13 * current), gmv: String(62_900 * current), delivered: rounded(10 * current), backlog: 2, failures: 1, medianAcceptanceMinutes: 11, lowStockItems: 1 },
      { publicId: "sample-agency-3", displayName: "Southline Gas Agency", city: "Chennai", orders: rounded(11 * current), gmv: String(50_500 * current), delivered: rounded(9 * current), backlog: 1, failures: 0, medianAcceptanceMinutes: 9, lowStockItems: 1 },
    ],
    recentActivity: [
      { publicId: "sample-audit-1", action: "tenant.approved", entityType: "tenant", entityPublicId: "sample-tenant-1", actorName: "Platform Approver", actorRole: "Platform Admin", reason: "GSTIN and outlet documents verified", occurredAt: "2026-10-21T09:42:00.000+05:30" },
      { publicId: "sample-audit-2", action: "credit.limit_updated", entityType: "credit_account", entityPublicId: "sample-credit-1", actorName: "Super Admin", actorRole: "Super Admin", reason: "Approved after payment history review", occurredAt: "2026-10-21T08:25:00.000+05:30" },
      { publicId: "sample-audit-3", action: "role.permissions_updated", entityType: "role", entityPublicId: "sample-role-1", actorName: "Super Admin", actorRole: "Super Admin", reason: "Separated reviewer and creator responsibilities", occurredAt: "2026-10-20T17:10:00.000+05:30" },
    ],
    systemHealth: { queuedJobs: 3, failedJobs: 0, activeSessions: 28, suspendedUsers: 2 },
    dataCoverage: { platformRevenue: "pending_ledger", supportCases: "pending_integration", forecasts: "not_configured" },
  };
}

export const sampleTenants = [
  { name: "Nandi Grand Hotel", type: "Hotel", city: "Bengaluru", gstin: "GSTIN ••••K1Z4", agency: "Central Commercial Gas", requirement: "8 × 19 kg / week", payment: "Credit · ₹75,000 · Net 15", status: "Pending approval" },
  { name: "Spice Courtyard", type: "Restaurant", city: "Hyderabad", gstin: "GSTIN ••••P1Z8", agency: "Metro LPG Services", requirement: "12 × 19 kg / week", payment: "Prepaid", status: "Changes requested" },
  { name: "Marina Residency", type: "Hotel", city: "Chennai", gstin: "GSTIN ••••T1Z2", agency: "Southline Gas Agency", requirement: "4 × 47.5 kg / month", payment: "Credit · ₹1,50,000 · Net 30", status: "Active" },
];

export const sampleRoles = [
  { role: "Super Admin", members: 1, scope: "Global", permissions: "All platform, security, finance and reporting controls" },
  { role: "Platform Admin", members: 3, scope: "Assigned regions", permissions: "Tenant approval, agency oversight and analytics" },
  { role: "Onboarding Executive", members: 7, scope: "Assigned agencies", permissions: "Create and submit tenant registrations" },
  { role: "Finance Reviewer", members: 2, scope: "Global finance", permissions: "Credit review, collections and account visibility" },
];

export const sampleOrders = [
  { id: "ORD-10428", tenant: "Nandi Grand Hotel", outlet: "MG Road Kitchen", cylinders: "4 × 19 kg", amount: 14640, status: "New", tone: "info" as const, time: "10:18 AM", payment: "Credit · Net 15", delivery: "Today · 2–5 PM" },
  { id: "ORD-10427", tenant: "Spice Courtyard", outlet: "Jubilee Hills", cylinders: "6 × 19 kg", amount: 21960, status: "Assigned", tone: "warning" as const, time: "9:54 AM", payment: "Prepaid", delivery: "Today · 2–5 PM" },
  { id: "ORD-10426", tenant: "Marina Residency", outlet: "Central Kitchen", cylinders: "2 × 47.5 kg", amount: 11940, status: "Out for delivery", tone: "primary" as const, time: "9:21 AM", payment: "Credit · Net 30", delivery: "ETA 28 minutes" },
  { id: "ORD-10425", tenant: "Oak Table Bistro", outlet: "Indiranagar", cylinders: "3 × 19 kg", amount: 10980, status: "Delivered", tone: "success" as const, time: "8:47 AM", payment: "COD collected", delivery: "Delivered 10:12 AM" },
];
