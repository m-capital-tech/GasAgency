import { OperationsApiError, operationsApi, type OperationsSession } from "./operations-api";

export interface AdminOverview {
  timezone: string;
  onboarding: { total: number; active: number; pendingApprovals: number; changesRequested: number; pendingCreditDecisions: number; approvalSlaBreaches: number };
  today: { orders: number; gmv: string; delivered: number };
  week: { orders: number; gmv: string };
  month: { orders: number; gmv: string };
  receivables: { open: string; overdue: string };
}

export type DashboardPeriod = "daily" | "weekly" | "monthly";
export interface AdminDashboard {
  period: DashboardPeriod;
  periodLabel: string;
  timezone: string;
  audience: "super_admin" | "platform_operations";
  scope: { global: boolean; regions: string[]; cities: string[]; agencyCount: number; tenantCount: number };
  window: { currentStart: string; previousStart: string; currentEnd: string };
  performance: {
    current: { orders: number; gmv: string; cylinders: number; delivered: number; collections: string };
    previous: { orders: number; gmv: string; cylinders: number; delivered: number; collections: string };
  };
  footprint: { activeTenants: number; activeAgencies: number };
  onboarding: { drafts: number; pendingApprovals: number; approvalSlaBreaches: number; approvals: number; rejections: number; invitations: number; firstLogins: number; firstOrders: number };
  credit: { approvedLimit: string; outstanding: string; overdue: string; overdueAccounts: number; aging: { current: string; days_1_30: string; days_31_60: string; days_61_90: string; days_90_plus: string } };
  attention: { approvalSlaBreaches: number; lowStockAgencies: number; overdueAccounts: number; deliveryFailures: number; messagingFailures: number };
  orderStates: Array<{ status: string; count: number; value: string; cylinders: number }>;
  agencies: Array<{ publicId: string; displayName: string; city: string; orders: number; gmv: string; delivered: number; backlog: number; failures: number; medianAcceptanceMinutes: number | null; lowStockItems: number }>;
  recentActivity: Array<{ publicId: string; action: string; entityType: string; entityPublicId: string | null; actorName: string | null; actorRole: string | null; reason: string | null; occurredAt: string }>;
  systemHealth: null | { queuedJobs: number; failedJobs: number; activeSessions: number; suspendedUsers: number };
  dataCoverage: { platformRevenue: string; supportCases: string; forecasts: string };
}

export interface AdminAgency { publicId: string; displayName: string; legalName: string; gstin: string; phoneE164: string; city: string; stateCode: string; creditEnabled: boolean; status: string; }
export interface TenantSummary {
  publicId: string; displayName: string; legalName: string; businessType: string; gstin: string; status: string; createdAt: string; submittedAt: string | null; city: string;
  owner: { fullName: string; phoneE164: string }; agency: { publicId: string; displayName: string }; creatorName: string;
  commercialProposal: { requestedPaymentMode: string; proposedCreditLimit: string | null; proposedNetTermDays: number | null; decisionStatus: string };
}
export interface TenantDetail extends TenantSummary {
  fssaiNumber: string | null; alternatePhoneE164: string | null; internalNotes: string | null; approvedAt: string | null; suspendedAt: string | null;
  creator: { publicId: string; fullName: string }; owner: { publicId: string; fullName: string; phoneE164: string; email: string | null };
  outlet: { publicId: string; label: string; addressLine1: string; addressLine2: string | null; city: string; stateCode: string; pincode: string; latitude: number; longitude: number; contactName: string | null; contactPhoneE164: string | null; deliveryInstructions: string | null; stock: { inUse: number; spareFull: number; empty: number } };
  agency: { publicId: string; displayName: string; legalName: string; creditEnabled: boolean; assignmentReason: string; assignmentStatus: string };
  requirement: { period: string; preferredDeliveryDays: number[]; preferredSlot: string | null; items: Array<{ cylinderTypeCode: string; displayName: string; expectedQuantity: number }> };
  commercialProposal: { publicId: string; requestedPaymentMode: string; proposedCreditLimit: string | null; proposedNetTermDays: number | null; proposalNote: string | null; decisionStatus: string; decisionNote: string | null };
  commercialAccount: null | {
    publicId: string; status: string; paymentMode: string;
    creditAccount: null | {
      publicId: string; status: string; creditLimit: string; netTermDays: number; suspendedAt: string | null;
      exposure: { pendingOrders: string; outstandingInvoices: string; total: string; available: string; overdueInvoices: number };
      decisions: Array<{ publicId: string; decision: string; previousLimit: string | null; newLimit: string | null; previousNetTermDays: number | null; newNetTermDays: number | null; reason: string; decidedByName: string; createdAt: string }>;
    };
  };
  reviews: Array<{ publicId: string; decision: string; fromStatus: string; toStatus: string; reason: string | null; overrideUsed: boolean; reviewerName: string; createdAt: string }>;
  capabilities: {
    canSubmit: boolean; canApprove: boolean; canOverrideApproval: boolean; canReject: boolean; canApproveCredit: boolean;
    canSuspendTenant: boolean; canReinstateTenant: boolean; canViewCredit: boolean; canApprovePostActivationCredit: boolean;
    canUpdateCredit: boolean; canSuspendCredit: boolean; canReinstateCredit: boolean;
  };
}
export interface AdminRole { publicId: string; name: string; roleType: string; status: string; managedByName: string | null; permissionKeys: string[]; }
export interface AdminPermission { key: string; resource: string; action: string; description: string; reserved: boolean; }
export interface TeamMember { assignmentPublicId: string; publicId: string; fullName: string; phoneE164: string; email: string | null; status: string; mfaRequired: boolean; rolePublicId: string; roleName: string; roleType: string; scope: { kind: string; value: string | null; agencies: Array<{ publicId: string; displayName: string }> }; assignmentStatus: string; assignedAt: string; }
export interface PlatformSetting {
  key: string;
  category: "workflow" | "operations" | "feature";
  displayName: string;
  description: string;
  value: boolean | number;
  valueType: "boolean" | "number";
  version: number;
  updatedAt: string;
  updatedByName: string | null;
}

async function request<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const response = await fetch(`/operations/api/${path}`, {
    method: options.method ?? "GET",
    headers: { accept: "application/json", ...(options.body === undefined ? {} : { "content-type": "application/json" }), ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body), cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new OperationsApiError(payload?.error?.code ?? "request_failed", payload?.error?.message ?? `Request failed (${response.status})`, response.status, payload?.error?.details);
  return payload as T;
}

export const controlApi = {
  session: (): Promise<OperationsSession> => operationsApi.session(),
  logout: () => operationsApi.logout(),
  overview: () => request<AdminOverview>("admin/overview"),
  dashboard: (period: DashboardPeriod) => request<AdminDashboard>(`admin/dashboard?period=${period}`),
  agencies: () => request<{ agencies: AdminAgency[] }>("admin/agencies"),
  tenants: (status?: string, cursor?: string) => request<{ tenants: TenantSummary[]; nextCursor: string | null }>(`admin/tenants?limit=50${status ? `&status=${encodeURIComponent(status)}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`),
  tenant: (publicId: string) => request<{ tenant: TenantDetail }>(`admin/tenants/${publicId}`),
  submitTenant: (publicId: string) => request<{ tenant: { status: string }; alreadySubmitted: boolean }>(`admin/tenants/${publicId}/submit`, { method: "POST" }),
  reviewTenant: (publicId: string, body: Record<string, unknown>) => request<{ tenant: { status: string }; invitation: unknown; commercialAccount: unknown }>(`admin/tenants/${publicId}/reviews`, { method: "POST", body }),
  changeTenantLifecycle: (publicId: string, body: { action: "suspend" | "reinstate"; reason: string }) => request<{ tenant: { publicId: string; status: string }; commercialAccount: { publicId: string; status: string }; revokedSessions: number }>(`admin/tenants/${publicId}/lifecycle`, { method: "POST", body }),
  decideTenantCredit: (publicId: string, body: Record<string, unknown>) => request<{ creditAccount: { publicId: string; status: string; creditLimit: string; netTermDays: number }; exposure: { pendingOrders: number; outstandingInvoices: number; total: number } }>(`admin/tenants/${publicId}/credit-decisions`, { method: "POST", body }),
  createTenant: (body: Record<string, unknown>, idempotencyKey: string) => request<{ tenant: { publicId: string; status: string } }>("admin/tenants", { method: "POST", body, idempotencyKey }),
  permissions: () => request<{ permissions: AdminPermission[] }>("admin/permissions"),
  roles: () => request<{ roles: AdminRole[] }>("admin/roles"),
  teamMembers: () => request<{ teamMembers: TeamMember[] }>("admin/team-members"),
  configuration: () => request<{ settings: PlatformSetting[] }>("admin/configuration"),
  updateConfiguration: (body: { changes: Array<{ key: string; value: boolean | number; expectedVersion: number }>; reason: string }) => request<{ settings: Array<{ key: string; value: boolean | number; version: number; updatedAt: string }> }>("admin/configuration", { method: "POST", body }),
  createRole: (body: Record<string, unknown>) => request<{ role: AdminRole }>("admin/roles", { method: "POST", body }),
  updateRole: (publicId: string, body: Record<string, unknown>) => request<{ role: AdminRole & { revokedSessions: number } }>(`admin/roles/${publicId}`, { method: "POST", body }),
  createTeamMember: (body: Record<string, unknown>) => request<{ user: { publicId: string }; invitation: { status: string } }>("admin/team-members", { method: "POST", body }),
  changeTeamMemberAccess: (assignmentPublicId: string, body: { action: "suspend" | "reinstate" | "revoke"; reason: string }) => request<{ assignment: { assignmentPublicId: string; userPublicId: string; status: string; revokedSessions: number } }>(`admin/team-members/${assignmentPublicId}/lifecycle`, { method: "POST", body }),
  stepUpMfa: (code: string) => request<{ verified: true; verifiedAt: string; validForSeconds: number }>("auth/mfa/step-up", { method: "POST", body: { code } }),
};
