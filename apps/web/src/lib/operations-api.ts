export interface OperationsAgency { publicId: string; displayName: string; roleTypes: string[]; }
export interface OperationsSession {
  user: { publicId: string; fullName: string; phoneE164: string };
  session: { publicId: string; authMethod: string; mfaVerifiedAt: string | null };
  agencies: OperationsAgency[];
  platformAccess?: null | { roleTypes: string[]; permissions: string[]; scopes: Array<{ roleType: string; roleName: string; kind: string; value: string | null; agencyPublicIds: string[] }> };
}

export type OtpVerification =
  | ({ status: "authenticated" } & OperationsSession)
  | { status: "mfa_enrollment_required" | "mfa_verification_required"; mfaTicket: string; expiresInSeconds: number; user: OperationsSession["user"] };

export interface MfaEnrollment {
  factorPublicId: string;
  factorType: "totp";
  manualKey: string;
  otpauthUri: string;
  issuer: string;
  algorithm: "SHA1";
  digits: 6;
  periodSeconds: 30;
}

export interface MfaAuthentication extends OperationsSession {
  status: "authenticated";
  recoveryCodes?: string[];
  recoveryCodeUsed?: boolean;
}

export interface OperationsOrder {
  publicId: string;
  orderNumber: string;
  status: "placed" | "accepted" | "assigned" | "out_for_delivery" | "delivery_failed" | "delivered" | "rejected" | "cancelled";
  payment: { method: "cod" | "credit"; status: string };
  delivery: { slot: string; requestedDate: string | null; instructions: string | null; emptiesExpected: number; emptiesCollected: number; emptyCollections: Array<{ cylinderTypeCode: string; quantity: number }> };
  amounts: { subtotal: string; deliveryFee: string; slotSurcharge: string; taxableAmount: string; gstRate: number; gstAmount: string; totalAmount: string; currency: "INR" };
  tenant: { publicId: string; displayName: string; businessType: string; gstin: string };
  outlet: { publicId: string; label: string; address: string; contactName: string | null; contactPhoneE164: string | null };
  items: Array<{ cylinderTypeCode: string; displayName: string; quantity: number; unitPrice: number; priceSource: string; lineSubtotal: number }>;
  deliveryStaff: null | { publicId: string; fullName: string; vehicleType: string; vehicleNumber: string };
  invoice: null | { publicId: string; invoiceNumber: string; status: string; dueAt: string | null; outstandingAmount: string };
  timeline: Array<{ fromStatus: string | null; toStatus: string; actorName: string | null; reason: string | null; occurredAt: string }>;
  timestamps: { placedAt: string | null; acceptedAt: string | null; assignedAt: string | null; dispatchedAt: string | null; deliveredAt: string | null };
  failureReason: string | null;
}

export interface OperationsStaff { publicId: string; fullName: string; phoneE164: string; vehicleType: string; vehicleNumber: string; status: string; activeDrops: number; }
export interface OperationsInventory { publicId: string; cylinderTypeCode: string; displayName: string; fullOnHand: number; reservedFull: number; availableFull: number; emptyOnHand: number; withAccounts: number; lowStockThreshold: number; }

export interface OperationsAccountPrice {
  cylinderTypeCode: string;
  displayName: string;
  baseUnitPrice: string;
  negotiatedUnitPrice: string | null;
  negotiatedActive: boolean;
}

export interface OperationsCommercialAccount {
  publicId: string;
  status: "open" | "suspended";
  paymentMode: "prepaid" | "credit";
  tenant: { publicId: string; displayName: string; legalName: string; gstin: string; businessType: string };
  credit: null | { status: "approved" | "suspended" | "closed"; limit: string; netTermDays: number };
  receivables: { outstanding: string; overdue: string; openInvoiceCount: number };
  collections: { total: string; lastReceivedAt: string | null };
  prices: OperationsAccountPrice[];
}

export interface OperationsPayment {
  publicId: string;
  amount: string;
  paymentMethod: "cash" | "upi" | "bank_transfer" | "cheque" | "other";
  reference: string | null;
  note: string | null;
  receivedAt: string;
  recordedAt: string;
  recordedBy: string;
  account: { publicId: string };
  tenant: { publicId: string; displayName: string };
  allocations: Array<{ invoicePublicId: string; invoiceNumber: string; amount: string }>;
}

export type OperationsDashboardPeriod = "daily" | "weekly" | "monthly";

export interface OperationsDashboard {
  period: OperationsDashboardPeriod;
  periodLabel: string;
  timezone: "Asia/Kolkata";
  window: { currentStart: string; previousStart: string; currentEnd: string };
  agency: OperationsAgency & { city: string; creditEnabled: boolean };
  performance: {
    current: { orders: number; gmv: string; cylinders: number; delivered: number; deliveredValue: string; collections: string };
    previous: { orders: number; gmv: string; cylinders: number; delivered: number; deliveredValue: string; collections: string };
  };
  fulfillment: { active: number; awaitingAcceptance: number; awaitingAssignment: number; deliveryFailures: number; medianAcceptanceMinutes: number | null; medianDeliveryMinutes: number | null };
  accounts: { total: number; credit: number; approvedCreditLimit: string; outstanding: string; overdue: string; openInvoices: number };
  staff: { total: number; active: number; withActiveDrops: number };
  inventory: { fullOnHand: number; availableFull: number; reservedFull: number; emptyOnHand: number; withAccounts: number; lowStockItems: number; items: OperationsInventory[] };
  orderStates: Array<{ status: string; count: number; value: string; cylinders: number }>;
  trend: Array<{ bucketStart: string; orders: number; delivered: number; gmv: string }>;
  exceptions: Array<{ kind: string; publicId: string; label: string; detail: string; severity: "critical" | "warning"; amount: string | null; occurredAt: string }>;
  recentActivity: Array<{ publicId: string; orderPublicId: string; orderNumber: string; toStatus: string; actorName: string | null; reason: string | null; occurredAt: string }>;
}

export class OperationsApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) { super(message); }
}

async function request<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const response = await fetch(`/operations/api/${path}`, {
    method: options.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new OperationsApiError(payload?.error?.code ?? "request_failed", payload?.error?.message ?? `Request failed (${response.status})`, response.status, payload?.error?.details);
  return payload as T;
}

export const operationsApi = {
  requestOtp: (phoneE164: string) => request<{ accepted: true; challengePublicId: string; destination: string; localDebugCode?: string }>("auth/otp/request", { method: "POST", body: { phoneE164 } }),
  verifyOtp: (challengePublicId: string, code: string) => request<OtpVerification>("auth/otp/verify", { method: "POST", body: { challengePublicId, code, deviceName: "Commercial LPG web" } }),
  beginMfaEnrollment: (mfaTicket: string) => request<MfaEnrollment>("auth/mfa/enroll", { method: "POST", body: { mfaTicket, label: "Authenticator app" } }),
  confirmMfaEnrollment: (mfaTicket: string, factorPublicId: string, code: string) => request<MfaAuthentication>("auth/mfa/enroll/verify", { method: "POST", body: { mfaTicket, factorPublicId, code } }),
  verifyMfa: (mfaTicket: string, code: string) => request<MfaAuthentication>("auth/mfa/verify", { method: "POST", body: { mfaTicket, code } }),
  session: () => request<OperationsSession>("auth/session"),
  logout: () => request<void>("auth/logout", { method: "POST" }),
  dashboard: (agencyPublicId: string, period: OperationsDashboardPeriod) => request<OperationsDashboard>(`agencies/${agencyPublicId}/dashboard?period=${period}`),
  orders: (agencyPublicId: string, status?: string) => request<{ agency: OperationsAgency; orders: OperationsOrder[] }>(`agencies/${agencyPublicId}/orders${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  staff: (agencyPublicId: string) => request<{ staff: OperationsStaff[] }>(`agencies/${agencyPublicId}/delivery-staff`),
  createStaff: (agencyPublicId: string, body: { fullName: string; phoneE164: string; email?: string; vehicleType: string; vehicleNumber: string; reason: string }) => request<{ staff: OperationsStaff }>(`agencies/${agencyPublicId}/delivery-staff`, { method: "POST", body }),
  changeStaffLifecycle: (agencyPublicId: string, staffPublicId: string, body: { action: "suspend" | "reinstate"; reason: string }) => request<{ staff: { publicId: string; status: string; revokedSessions: number } }>(`agencies/${agencyPublicId}/delivery-staff/${staffPublicId}/lifecycle`, { method: "POST", body }),
  inventory: (agencyPublicId: string) => request<{ inventory: OperationsInventory[] }>(`agencies/${agencyPublicId}/inventory`),
  adjustInventory: (agencyPublicId: string, body: { cylinderTypeCode: string; fullDelta: number; emptyDelta: number; lowStockThreshold?: number; reason: string }) => request<{ inventory: OperationsInventory }>(`agencies/${agencyPublicId}/inventory/adjustments`, { method: "POST", body }),
  transition: (agencyPublicId: string, orderPublicId: string, body: Record<string, unknown>, idempotencyKey = `web:${orderPublicId}:${body.action}:${crypto.randomUUID()}`) => request<{ order: OperationsOrder }>(`agencies/${agencyPublicId}/orders/${orderPublicId}/transitions`, { method: "POST", body, idempotencyKey }),
  accounts: (agencyPublicId: string) => request<{ agency: OperationsAgency & { creditEnabled: boolean }; accounts: OperationsCommercialAccount[]; nextCursor: string | null }>(`agencies/${agencyPublicId}/accounts`),
  payments: (agencyPublicId: string) => request<{ payments: OperationsPayment[] }>(`agencies/${agencyPublicId}/payments`),
  setCreditPolicy: (agencyPublicId: string, body: { creditEnabled: boolean; reason: string }, idempotencyKey = `web:${agencyPublicId}:credit-policy:${crypto.randomUUID()}`) => request<{ agency: OperationsAgency & { creditEnabled: boolean } }>(`agencies/${agencyPublicId}/credit-policy`, { method: "POST", body, idempotencyKey }),
  setNegotiatedPrice: (agencyPublicId: string, accountPublicId: string, body: { cylinderTypeCode: string; active: true; unitPrice: string; reason: string } | { cylinderTypeCode: string; active: false; reason: string }, idempotencyKey = `web:${accountPublicId}:price:${body.cylinderTypeCode}:${crypto.randomUUID()}`) => request<{ price: { publicId: string; cylinderTypeCode: string; displayName: string; baseUnitPrice: string; unitPrice: string | null; active: boolean } }>(`agencies/${agencyPublicId}/accounts/${accountPublicId}/prices`, { method: "POST", body, idempotencyKey }),
  recordPayment: (agencyPublicId: string, accountPublicId: string, body: { amount: string; paymentMethod: OperationsPayment["paymentMethod"]; reference?: string; note?: string; receivedAt?: string }, idempotencyKey = `web:${accountPublicId}:payment:${crypto.randomUUID()}`) => request<{ payment: OperationsPayment }>(`agencies/${agencyPublicId}/accounts/${accountPublicId}/payments`, { method: "POST", body, idempotencyKey }),
};
