export interface OperationsAgency { publicId: string; displayName: string; roleTypes: string[]; }
export interface OperationsSession {
  user: { publicId: string; fullName: string; phoneE164: string };
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
  orders: (agencyPublicId: string, status?: string) => request<{ agency: OperationsAgency; orders: OperationsOrder[] }>(`agencies/${agencyPublicId}/orders${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  staff: (agencyPublicId: string) => request<{ staff: OperationsStaff[] }>(`agencies/${agencyPublicId}/delivery-staff`),
  inventory: (agencyPublicId: string) => request<{ inventory: OperationsInventory[] }>(`agencies/${agencyPublicId}/inventory`),
  transition: (agencyPublicId: string, orderPublicId: string, body: Record<string, unknown>, idempotencyKey = `web:${orderPublicId}:${body.action}:${crypto.randomUUID()}`) => request<{ order: OperationsOrder }>(`agencies/${agencyPublicId}/orders/${orderPublicId}/transitions`, { method: "POST", body, idempotencyKey }),
};
