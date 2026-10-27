import { PLATFORM_API_URL } from "./config";
import type { PushTokenRegistration } from "./push-notifications";

export interface TenantAccess {
  publicId: string;
  displayName: string;
  membershipType: string;
}

export interface TenantSessionUser {
  publicId: string;
  fullName: string;
  phoneE164: string;
}

export interface TenantSessionResponse {
  user: TenantSessionUser;
  session: { publicId: string; authMethod: string };
  tenants: TenantAccess[];
}

export interface OtpRequestResponse {
  accepted: true;
  challengePublicId: string;
  destination: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
  localDebugCode?: string;
}

export type TenantPaymentMethod = "cod" | "credit";
export type TenantDeliverySlot = "before_opening" | "standard" | "evening" | "express";
export type TenantOrderStatus =
  | "pending_payment"
  | "payment_failed"
  | "placed"
  | "accepted"
  | "assigned"
  | "out_for_delivery"
  | "delivery_failed"
  | "delivered"
  | "rejected"
  | "cancelled";
export type TenantInvoiceStatus = "open" | "overdue" | "paid" | "void";

export interface TenantOrderSummary {
  publicId: string;
  orderNumber: string;
  status: TenantOrderStatus;
  payment: { method: TenantPaymentMethod; status: string };
  deliverySlot: TenantDeliverySlot;
  requestedDeliveryDate: string | null;
  totalAmount: string;
  currency: "INR";
  placedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  outlet: { publicId: string; label: string };
  agency: { publicId: string; displayName: string };
  cylinderCount: number;
  items: Array<{
    cylinderTypeCode: string;
    displayName: string;
    quantity: number;
    unitPrice: string;
    lineSubtotal: string;
  }>;
  invoice: null | {
    publicId: string;
    invoiceNumber: string;
    status: TenantInvoiceStatus;
    outstandingAmount: string;
    dueAt: string | null;
  };
}

export interface TenantOrderDetail extends Omit<TenantOrderSummary, "outlet" | "agency" | "invoice"> {
  subtotal: string;
  deliveryFee: string;
  slotSurcharge: string;
  taxableAmount: string;
  gstRate: number;
  gstAmount: string;
  emptiesExpected: number;
  emptiesCollected: number;
  deliveryInstructions: string | null;
  acceptedAt: string | null;
  assignedAt: string | null;
  dispatchedAt: string | null;
  cancelledAt: string | null;
  failureReason: string | null;
  outlet: {
    publicId: string;
    label: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    stateCode: string;
    pincode: string;
  };
  agency: { publicId: string; displayName: string; phoneE164: string };
  deliveryPartner: null | { name: string; vehicleType: string; vehicleNumber: string };
  invoice: null | {
    publicId: string;
    invoiceNumber: string;
    status: TenantInvoiceStatus;
    taxableAmount: string;
    gstAmount: string;
    totalAmount: string;
    outstandingAmount: string;
    issuedAt: string;
    dueAt: string | null;
    paidAt: string | null;
  };
  timeline: Array<{
    publicId: string;
    fromStatus: TenantOrderStatus | null;
    toStatus: TenantOrderStatus;
    note: string | null;
    occurredAt: string;
  }>;
}

export interface TenantInvoiceSummary {
  publicId: string;
  invoiceNumber: string;
  status: TenantInvoiceStatus;
  taxableAmount: string;
  gstAmount: string;
  totalAmount: string;
  outstandingAmount: string;
  currency: "INR";
  issuedAt: string;
  dueAt: string | null;
  paidAt: string | null;
  order: { publicId: string; orderNumber: string };
  outletLabel: string;
}

export interface TenantBillingResponse {
  tenant: { publicId: string; displayName: string; gstin: string };
  account: {
    paymentMode: "prepaid" | "credit";
    credit: null | {
      status: string;
      limit: string;
      used: string;
      available: string;
      netTermDays: number;
    };
  };
  summary: { outstandingAmount: string; overdueAmount: string; paidLast30Days: string; currency: "INR" };
  invoices: TenantInvoiceSummary[];
  nextCursor: string | null;
}

export interface TenantInvoiceDetail extends TenantInvoiceSummary {
  tenant: {
    legalName: string;
    gstin: string;
    outletLabel: string;
    addressLine1: string;
    addressLine2: string | null;
    city: string;
    stateCode: string;
    pincode: string;
  };
  agency: { displayName: string; gstin: string; city: string; stateCode: string };
  items: TenantOrderSummary["items"];
  payments: Array<{
    publicId: string;
    amount: string;
    paymentMethod: "cash" | "upi" | "bank_transfer" | "cheque" | "other";
    reference: string | null;
    receivedAt: string;
  }>;
}

export interface TenantHomeResponse {
  tenant: { publicId: string; displayName: string; gstin: string };
  agency: { publicId: string; displayName: string };
  outlets: Array<{ publicId: string; label: string; address: string; deliveryInstructions: string | null; stock: { inUse: number; spareFull: number; empty: number } }>;
  catalog: Array<{
    cylinderTypeCode: string;
    displayName: string;
    weightKg: number;
    baseUnitPrice: string;
    negotiatedUnitPrice: string | null;
    slabs: Array<{ minQuantity: number; unitPrice: string }>;
  }>;
  deliverySlots: Array<{ code: TenantDeliverySlot; displayName: string; surcharge: string; maxCylinders: number | null }>;
  paymentMethods: TenantPaymentMethod[];
  credit: null | {
    status: string;
    limit: string;
    used: string;
    available: string;
    netTermDays: number;
    overdue: boolean;
    eligible: boolean;
  };
  currency: "INR";
}

export interface TenantRequirement {
  period: "week" | "month";
  preferredDeliveryDays: number[];
  preferredSlot: TenantDeliverySlot | null;
  items: Array<{ cylinderTypeCode: string; displayName: string; expectedQuantity: number }>;
}

export interface TenantProfileResponse {
  tenant: {
    publicId: string;
    legalName: string;
    displayName: string;
    businessType: string;
    gstin: string;
    fssaiNumber: string | null;
    alternatePhoneE164: string | null;
    status: string;
  };
  user: TenantSessionUser & {
    preferredLanguage: "en" | "hi" | "te";
    membershipType: "owner" | "manager" | "staff";
    canManage: boolean;
  };
  agency: { publicId: string; displayName: string; phoneE164: string };
  account: { paymentMode: "prepaid" | "credit"; creditStatus: string | null; creditLimit: string | null; netTermDays: number | null };
  cylinderTypes: Array<{ code: string; displayName: string; weightKg: number }>;
  outlets: Array<{
    publicId: string;
    label: string;
    address: { line1: string; line2: string | null; city: string; stateCode: string; pincode: string };
    contact: { name: string | null; phoneE164: string | null };
    deliveryInstructions: string | null;
    stock: { inUse: number; spareFull: number; empty: number };
    requirement: TenantRequirement | null;
  }>;
}

export interface TenantDashboardResponse {
  tenant: { publicId: string; displayName: string };
  period: "daily" | "weekly" | "monthly";
  timezone: "Asia/Kolkata";
  range: { startAt: string; endAt: string; previousStartAt: string };
  current: {
    orders: number; cylinders: number; bookedValue: string; deliveredOrders: number; deliveredValue: string;
    emptiesExpected: number; emptiesCollected: number; averageDeliveryMinutes: number | null;
    taxableValue: string; gst: string; invoicedValue: string; collected: string;
  };
  previous: { orders: number; cylinders: number; bookedValue: string; deliveredOrders: number; deliveredValue: string };
  account: {
    paymentMode: "prepaid" | "credit"; creditStatus: string | null; creditLimit: string | null;
    netTermDays: number | null; outstanding: string; overdue: string; dueNext7Days: string;
  };
  activeOrders: Record<string, number>;
  outlets: Array<{
    publicId: string; label: string; stock: { inUse: number; spareFull: number; empty: number };
    requirementPeriod: "week" | "month" | null; expectedQuantity: number; estimatedDaysRemaining: number | null;
  }>;
  breakdown: {
    outlets: Array<{ publicId: string; label: string; orders: number; cylinders: number; spend: string }>;
    cylinderTypes: Array<{ code: string; displayName: string; cylinders: number; spend: string }>;
  };
  openSupportCases: number;
  definitions: { bookedValue: string; deliveredValue: string; stockEstimate: string };
}

export type TenantSupportStatus = "open" | "acknowledged" | "in_progress" | "resolved" | "closed";

export interface TenantSupportCase {
  publicId: string;
  caseNumber: string;
  category: string;
  priority: "low" | "normal" | "high";
  status: TenantSupportStatus;
  subject: string;
  description: string;
  responseDueAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  events: Array<{ publicId: string; type: string; note: string; occurredAt: string }>;
}

export interface TenantBusinessDocument {
  publicId: string;
  documentType: string;
  originalFileName: string;
  mediaType: string;
  byteSize: number;
  version: number;
  status: "available" | "quarantined" | "archived" | "failed";
  retentionClass: string;
  createdAt: string;
}

export interface TenantQuote {
  publicId: string;
  expiresAt: string;
  currency: "INR";
  deliverySlot: TenantDeliverySlot;
  paymentMethod: TenantPaymentMethod;
  items: Array<{
    cylinderTypeCode: string;
    displayName: string;
    weightKg: number;
    quantity: number;
    unitPrice: string;
    priceSource: "base" | "slab" | "negotiated";
    lineSubtotal: string;
  }>;
  subtotal: string;
  deliveryFee: string;
  slotSurcharge: string;
  taxableAmount: string;
  gstRate: number;
  gstAmount: string;
  totalAmount: string;
}

export interface TenantOrderResponse {
  order: {
    publicId: string;
    orderNumber: string;
    status: "placed";
    paymentMethod: TenantPaymentMethod;
    paymentStatus: "cod_pending" | "credit_reserved";
    totalAmount: string;
    currency: "INR";
    placedAt: string;
  };
}

export type OtpVerificationResponse =
  | {
      status: "authenticated";
      accessToken: string;
      tokenType: "Bearer";
      expiresInSeconds: number;
      firstLogin: boolean;
      user: TenantSessionUser;
      tenants: TenantAccess[];
    }
  | {
      status: "mfa_enrollment_required" | "mfa_verification_required";
      mfaTicket: string;
      expiresInSeconds: number;
      user: TenantSessionUser;
    };

export interface MfaEnrollmentResponse {
  factorPublicId: string;
  factorType: "totp";
  manualKey: string;
  otpauthUri: string;
  issuer: string;
  algorithm: "SHA1";
  digits: 6;
  periodSeconds: 30;
}

export interface MfaAuthenticationResponse {
  status: "authenticated";
  accessToken: string;
  tokenType: "Bearer";
  expiresInSeconds: number;
  firstLogin: boolean;
  user: TenantSessionUser;
  tenants: TenantAccess[];
  recoveryCodes?: string[];
  recoveryCodeUsed?: boolean;
}

export class PlatformApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

let accessToken: string | null = null;

export function setPlatformAccessToken(token: string | null): void {
  accessToken = token;
}

async function request<T>(path: string, options: { method?: "GET" | "POST"; body?: unknown; authenticated?: boolean; headers?: Record<string, string> } = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${PLATFORM_API_URL}/v1${path}`, {
      method: options.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...(options.authenticated && accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new PlatformApiError(
        payload?.error?.code ?? "request_failed",
        payload?.error?.message ?? `Request failed (${response.status})`,
        response.status,
        payload?.error?.details,
      );
    }
    return payload as T;
  } catch (error) {
    if (error instanceof PlatformApiError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new PlatformApiError("request_timeout", "The service took too long to respond. Please try again.", 0);
    }
    throw new PlatformApiError("service_unavailable", "The service is currently unreachable. Please try again.", 0);
  } finally {
    clearTimeout(timeout);
  }
}

export function requestTenantOtp(phoneE164: string): Promise<OtpRequestResponse> {
  return request("/auth/otp/request", { method: "POST", body: { phoneE164 } });
}

export function verifyTenantOtp(challengePublicId: string, code: string): Promise<OtpVerificationResponse> {
  return request("/auth/otp/verify", { method: "POST", body: { challengePublicId, code, deviceName: "Munna Gas Connect mobile app" } });
}

export function beginMfaEnrollment(mfaTicket: string): Promise<MfaEnrollmentResponse> {
  return request("/auth/mfa/enroll", { method: "POST", body: { mfaTicket, label: "Munna Gas Connect authenticator" } });
}

export function confirmMfaEnrollment(mfaTicket: string, factorPublicId: string, code: string): Promise<MfaAuthenticationResponse> {
  return request("/auth/mfa/enroll/verify", { method: "POST", body: { mfaTicket, factorPublicId, code } });
}

export function verifyMfa(mfaTicket: string, code: string): Promise<MfaAuthenticationResponse> {
  return request("/auth/mfa/verify", { method: "POST", body: { mfaTicket, code } });
}

export function restoreTenantSession(): Promise<TenantSessionResponse> {
  return request("/auth/session", { authenticated: true });
}

export function revokeTenantSession(): Promise<void> {
  return request("/auth/logout", { method: "POST", authenticated: true });
}

/**
 * Authenticated boundary for associating an Expo token with the current user.
 * The mobile bridge calls this only when push registration is explicitly enabled.
 */
export function registerPlatformPushToken(registration: PushTokenRegistration): Promise<void> {
  return request("/auth/push-devices", { method: "POST", body: registration, authenticated: true });
}

export function revokePlatformPushToken(registration: PushTokenRegistration): Promise<void> {
  return request("/auth/push-devices", {
    method: "POST",
    body: { ...registration, action: "revoke" },
    authenticated: true,
  });
}

export function loadTenantHome(tenantPublicId: string): Promise<TenantHomeResponse> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/home`, { authenticated: true });
}

export function requestTenantQuote(tenantPublicId: string, body: {
  outletPublicId: string;
  deliverySlot: TenantDeliverySlot;
  paymentMethod: TenantPaymentMethod;
  items: Array<{ cylinderTypeCode: string; quantity: number }>;
}): Promise<{ quote: TenantQuote }> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/quotes`, { method: "POST", body, authenticated: true });
}

export function placeTenantOrder(tenantPublicId: string, quotePublicId: string, idempotencyKey: string, options: { emptiesExpected?: number; deliveryInstructions?: string } = {}): Promise<TenantOrderResponse> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/orders`, {
    method: "POST",
    body: { quotePublicId, emptiesExpected: options.emptiesExpected ?? 0, ...(options.deliveryInstructions ? { deliveryInstructions: options.deliveryInstructions } : {}) },
    authenticated: true,
    headers: { "idempotency-key": idempotencyKey },
  });
}

export function loadTenantOrders(
  tenantPublicId: string,
  options: { limit?: number; cursor?: string; status?: TenantOrderStatus } = {},
): Promise<{ orders: TenantOrderSummary[]; nextCursor: string | null }> {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit ?? 20));
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.status) query.set("status", options.status);
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/orders?${query.toString()}`, { authenticated: true });
}

export function loadTenantOrder(tenantPublicId: string, orderPublicId: string): Promise<{ order: TenantOrderDetail }> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/orders/${encodeURIComponent(orderPublicId)}`, { authenticated: true });
}

export function loadTenantBilling(
  tenantPublicId: string,
  options: { limit?: number; cursor?: string; status?: TenantInvoiceStatus } = {},
): Promise<TenantBillingResponse> {
  const query = new URLSearchParams();
  query.set("limit", String(options.limit ?? 20));
  if (options.cursor) query.set("cursor", options.cursor);
  if (options.status) query.set("status", options.status);
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/billing?${query.toString()}`, { authenticated: true });
}

export function loadTenantInvoice(tenantPublicId: string, invoicePublicId: string): Promise<{ invoice: TenantInvoiceDetail }> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/invoices/${encodeURIComponent(invoicePublicId)}`, { authenticated: true });
}

export function loadTenantProfile(tenantPublicId: string): Promise<TenantProfileResponse> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/profile`, { authenticated: true });
}

export function updateTenantOutlet(tenantPublicId: string, outletPublicId: string, body: {
  contactName?: string | null;
  contactPhoneE164?: string | null;
  deliveryInstructions?: string | null;
  stock?: { inUse: number; spareFull: number; empty: number };
  requirement?: {
    period: "week" | "month";
    preferredDeliveryDays: number[];
    preferredSlot: TenantDeliverySlot | null;
    items: Array<{ cylinderTypeCode: string; expectedQuantity: number }>;
  };
}): Promise<{ outlet: { publicId: string } }> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/outlets/${encodeURIComponent(outletPublicId)}`, { method: "POST", body, authenticated: true });
}

export function loadTenantDashboard(tenantPublicId: string, period: TenantDashboardResponse["period"]): Promise<TenantDashboardResponse> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/dashboard?period=${period}`, { authenticated: true });
}

export function loadTenantSupportCases(tenantPublicId: string): Promise<{ cases: TenantSupportCase[] }> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/support-cases`, { authenticated: true });
}

export function createTenantSupportCase(tenantPublicId: string, body: {
  kind: "support" | "change_request";
  category?: "onboarding" | "ordering" | "delivery" | "billing" | "credit" | "agency" | "technical" | "other";
  priority?: "low" | "normal" | "high";
  subject: string;
  description: string;
  orderPublicId?: string;
  changeField?: "business_name" | "gstin_fssai" | "registered_phone" | "outlet_address" | "serving_agency";
}): Promise<{ case: { publicId: string; caseNumber: string; status: TenantSupportStatus; responseDueAt: string; createdAt: string } }> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/support-cases`, { method: "POST", body, authenticated: true });
}

export function loadTenantDocuments(tenantPublicId: string): Promise<{ documents: TenantBusinessDocument[] }> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/documents`, { authenticated: true });
}
