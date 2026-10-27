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
    scope: { global: true, regions: ["South"], cities: ["Bengaluru", "Hyderabad", "Chennai"], agencyCount: 3, tenantCount: 3 },
    window: { currentStart: "2026-10-21T00:00:00.000+05:30", previousStart: "2026-10-20T00:00:00.000+05:30", currentEnd: "2026-10-21T23:59:59.999+05:30" },
    performance: {
      current: { orders: rounded(3 * current), gmv: String(48_540 * current), cylinders: rounded(12 * current), delivered: rounded(1 * current), collections: String(11_940 * current) },
      previous: { orders: rounded(2 * previous), gmv: String(36_600 * previous), cylinders: rounded(10 * previous), delivered: rounded(1 * previous), collections: String(14_640 * previous) },
    },
    revenue: { current: String(4_854 * current), previous: String(3_660 * previous), currency: "INR", mix: [
      { type: "commission", current: String(3_398 * current), previous: String(2_562 * previous) },
      { type: "facilitation", current: String(1_456 * current), previous: String(1_098 * previous) },
    ] },
    support: { openCases: 1, criticalOpen: 0, responseSlaBreaches: 0, opened: rounded(1 * current), resolved: rounded(1 * previous), medianResolutionMinutes: 42 },
    projection: { method: "elapsed_run_rate", basisStart: "2026-10-21T00:00:00.000+05:30", periodEnd: "2026-10-22T00:00:00.000+05:30", elapsedPercent: 62, confidence: "low", sufficientHistory: false, orders: rounded(5 * current), gmv: String(78_290 * current), revenue: String(7_829 * current) },
    footprint: { activeTenants: 3, activeAgencies: 3 },
    onboarding: { drafts: 1, pendingApprovals: 1, approvalSlaBreaches: 0, approvals: rounded(1 * current), rejections: 0, invitations: rounded(1 * current), firstLogins: rounded(1 * current), firstOrders: rounded(1 * current) },
    credit: { approvedLimit: "225000", outstanding: "36000", overdue: "0", overdueAccounts: 0, aging: { current: "36000", days_1_30: "0", days_31_60: "0", days_61_90: "0", days_90_plus: "0" } },
    attention: { approvalSlaBreaches: 0, lowStockAgencies: 1, overdueAccounts: 0, deliveryFailures: 0, messagingFailures: 0 },
    orderStates: [
      { status: "placed", count: rounded(1 * current), value: String(14_640 * current), cylinders: rounded(4 * current) },
      { status: "out_for_delivery", count: rounded(1 * current), value: String(21_960 * current), cylinders: rounded(6 * current) },
      { status: "delivered", count: rounded(1 * current), value: String(11_940 * current), cylinders: rounded(2 * current) },
    ],
    agencies: [
      { publicId: "sample-agency-1", displayName: "Central Commercial Gas", city: "Bengaluru", orders: rounded(1 * current), gmv: String(14_640 * current), delivered: 0, backlog: 1, failures: 0, medianAcceptanceMinutes: 7, lowStockItems: 0 },
      { publicId: "sample-agency-2", displayName: "Metro LPG Services", city: "Hyderabad", orders: rounded(1 * current), gmv: String(21_960 * current), delivered: 0, backlog: 1, failures: 0, medianAcceptanceMinutes: 11, lowStockItems: 1 },
      { publicId: "sample-agency-3", displayName: "Southline Gas Agency", city: "Chennai", orders: rounded(1 * current), gmv: String(11_940 * current), delivered: rounded(1 * current), backlog: 0, failures: 0, medianAcceptanceMinutes: 9, lowStockItems: 0 },
    ],
    recentActivity: [
      { publicId: "sample-audit-1", action: "tenant.approved", entityType: "tenant", entityPublicId: "sample-tenant-1", actorName: "Platform Approver", actorRole: "Platform Admin", reason: "GSTIN and outlet documents verified", occurredAt: "2026-10-21T09:42:00.000+05:30" },
      { publicId: "sample-audit-2", action: "credit.limit_updated", entityType: "credit_account", entityPublicId: "sample-credit-1", actorName: "Super Admin", actorRole: "Super Admin", reason: "Approved after payment history review", occurredAt: "2026-10-21T08:25:00.000+05:30" },
      { publicId: "sample-audit-3", action: "role.permissions_updated", entityType: "role", entityPublicId: "sample-role-1", actorName: "Super Admin", actorRole: "Super Admin", reason: "Separated reviewer and creator responsibilities", occurredAt: "2026-10-20T17:10:00.000+05:30" },
    ],
    systemHealth: { queuedJobs: 0, failedJobs: 0, activeSessions: 1, suspendedUsers: 0 },
    dataCoverage: {
      generatedAt: "2026-10-21T12:30:00.000+05:30",
      platformRevenue: { status: "available", source: "append_only_revenue_ledger", actuals: true },
      supportCases: { status: "available", source: "support_case_workflow", actuals: true },
      projection: { status: "available", source: "elapsed_period_run_rate", actuals: false },
    },
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
];

export const sampleOrders = [
  { id: "ORD-10428", tenant: "Nandi Grand Hotel", outlet: "MG Road Kitchen", cylinders: "4 × 19 kg", amount: 14640, status: "New", tone: "info" as const, time: "10:18 AM", payment: "Credit · Net 15", delivery: "Today · 2–5 PM" },
  { id: "ORD-10427", tenant: "Spice Courtyard", outlet: "Jubilee Hills", cylinders: "6 × 19 kg", amount: 21960, status: "Out for delivery", tone: "primary" as const, time: "9:54 AM", payment: "Prepaid", delivery: "ETA 28 minutes" },
  { id: "ORD-10426", tenant: "Marina Residency", outlet: "Central Kitchen", cylinders: "2 × 47.5 kg", amount: 11940, status: "Delivered", tone: "success" as const, time: "9:21 AM", payment: "Credit · Net 30", delivery: "Delivered 10:12 AM" },
];
