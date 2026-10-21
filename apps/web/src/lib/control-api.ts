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
  revenue: null | { current: string; previous: string; currency: "INR"; mix: Array<{ type: string; current: string; previous: string }> };
  support: { openCases: number; criticalOpen: number; responseSlaBreaches: number; opened: number; resolved: number; medianResolutionMinutes: number | null };
  projection: { method: "elapsed_run_rate"; basisStart: string; periodEnd: string; elapsedPercent: number; confidence: "low" | "medium" | "high"; sufficientHistory: boolean; orders: number | null; gmv: string | null; revenue: string | null };
  footprint: { activeTenants: number; activeAgencies: number };
  onboarding: { drafts: number; pendingApprovals: number; approvalSlaBreaches: number; approvals: number; rejections: number; invitations: number; firstLogins: number; firstOrders: number };
  credit: { approvedLimit: string; outstanding: string; overdue: string; overdueAccounts: number; aging: { current: string; days_1_30: string; days_31_60: string; days_61_90: string; days_90_plus: string } };
  attention: { approvalSlaBreaches: number; lowStockAgencies: number; overdueAccounts: number; deliveryFailures: number; messagingFailures: number };
  orderStates: Array<{ status: string; count: number; value: string; cylinders: number }>;
  agencies: Array<{ publicId: string; displayName: string; city: string; orders: number; gmv: string; delivered: number; backlog: number; failures: number; medianAcceptanceMinutes: number | null; lowStockItems: number }>;
  recentActivity: Array<{ publicId: string; action: string; entityType: string; entityPublicId: string | null; actorName: string | null; actorRole: string | null; reason: string | null; occurredAt: string }>;
  systemHealth: null | { queuedJobs: number; failedJobs: number; activeSessions: number; suspendedUsers: number };
  dataCoverage: {
    generatedAt: string;
    platformRevenue: { status: "available" | "restricted"; source: string; actuals: true };
    supportCases: { status: "available"; source: string; actuals: true };
    projection: { status: "available" | "insufficient_history"; source: string; actuals: false };
  };
}

export interface AdminAgency { publicId: string; displayName: string; legalName: string; gstin: string; phoneE164: string; city: string; stateCode: string; creditEnabled: boolean; status: string; }
export interface AgencyRegistryItem {
  publicId: string; displayName: string; legalName: string; gstin: string; omc: string | null; distributorCode: string | null;
  phoneE164: string; city: string; stateCode: string; status: string; submittedAt: string | null; approvedAt: string | null;
  ownerName: string | null; tenantCount: number; staffCount: number; servicePincodes: string[];
}
export interface AgencyRegistryDetail {
  publicId: string; legalName: string; displayName: string; gstin: string; distributorCode: string | null; omc: string | null;
  phoneE164: string; city: string; stateCode: string; status: string; creditEnabled: boolean;
  address: { addressLine1: string | null; addressLine2: string | null; pincode: string | null; latitude: number | null; longitude: number | null };
  serviceArea: { pincodes: string[]; radiusKm: number | null };
  owner: null | { publicId: string; fullName: string; phoneE164: string; email: string | null };
  submittedAt: string | null; approvedAt: string | null; suspendedAt: string | null;
  reviews: Array<{ publicId: string; decision: string; fromStatus: string; toStatus: string; reason: string; overrideUsed: boolean; reviewerName: string; createdAt: string }>;
}
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
export interface BusinessDocument {
  publicId: string;
  documentType: string;
  version: number;
  status: "available" | "quarantined" | "archived" | "failed";
  originalFileName: string;
  mediaType: string;
  byteSize: number;
  retentionClass: string;
  legalHold: boolean;
  uploadedByName: string;
  createdAt: string;
  archivedAt: string | null;
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

async function uploadDocument(path: string, file: File, documentType: string, reason: string): Promise<{ document: BusinessDocument }> {
  const response = await fetch(`/operations/api/${path}`, {
    method: "POST",
    headers: { "content-type": file.type, "x-document-type": documentType, "x-file-name": encodeURIComponent(file.name), "x-upload-reason": encodeURIComponent(reason) },
    body: file,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new OperationsApiError(payload?.error?.code ?? "request_failed", payload?.error?.message ?? `Request failed (${response.status})`, response.status, payload?.error?.details);
  return payload as { document: BusinessDocument };
}

export const controlApi = {
  session: (): Promise<OperationsSession> => operationsApi.session(),
  logout: () => operationsApi.logout(),
  overview: () => request<AdminOverview>("admin/overview"),
  dashboard: (period: DashboardPeriod) => request<AdminDashboard>(`admin/dashboard?period=${period}`),
  agencies: () => request<{ agencies: AdminAgency[] }>("admin/agencies"),
  agencyRegistry: (status = "all") => request<{ agencies: AgencyRegistryItem[] }>(`admin/agency-registry?status=${encodeURIComponent(status)}`),
  agencyRecord: (publicId: string) => request<{ agency: AgencyRegistryDetail }>(`admin/agency-registry/${publicId}`),
  createAgency: (body: Record<string, unknown>, idempotencyKey = `web:agency:${crypto.randomUUID()}`) => request<{ agency: { publicId: string; status: string; displayName: string } }>("admin/agencies", { method: "POST", body, idempotencyKey }),
  reviewAgency: (publicId: string, body: { decision: "approved" | "rejected"; reason: string; override?: boolean }) => request<{ agency: { publicId: string; status: string } }>(`admin/agencies/${publicId}/reviews`, { method: "POST", body }),
  changeAgencyLifecycle: (publicId: string, body: { action: "suspend" | "reinstate"; reason: string }) => request<{ agency: { publicId: string; status: string; revokedSessions: number } }>(`admin/agencies/${publicId}/lifecycle`, { method: "POST", body }),
  tenantDocuments: (publicId: string) => request<{ documents: BusinessDocument[] }>(`admin/tenants/${publicId}/documents`),
  agencyDocuments: (publicId: string) => request<{ documents: BusinessDocument[] }>(`admin/agencies/${publicId}/documents`),
  uploadTenantDocument: (publicId: string, file: File, documentType: string, reason: string) => uploadDocument(`admin/tenants/${publicId}/documents`, file, documentType, reason),
  uploadAgencyDocument: (publicId: string, file: File, documentType: string, reason: string) => uploadDocument(`admin/agencies/${publicId}/documents`, file, documentType, reason),
  archiveDocument: (publicId: string, reason: string) => request<{ document: BusinessDocument }>(`documents/${publicId}/archive`, { method: "POST", body: { reason } }),
  documentContentUrl: (publicId: string, disposition: "inline" | "attachment" = "inline") => `/operations/api/documents/${publicId}/content?disposition=${disposition}`,
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
