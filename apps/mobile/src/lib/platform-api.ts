import { PLATFORM_API_URL } from "./config";

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
  outlets: Array<{ publicId: string; label: string; address: string; stock: { inUse: number; spareFull: number; empty: number } }>;
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
      user: TenantSessionUser;
      tenants: TenantAccess[];
    }
  | { status: "mfa_enrollment_required"; user: TenantSessionUser };

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
  return request("/auth/otp/verify", { method: "POST", body: { challengePublicId, code, deviceName: "GasSetu mobile app" } });
}

export function restoreTenantSession(): Promise<TenantSessionResponse> {
  return request("/auth/session", { authenticated: true });
}

export function revokeTenantSession(): Promise<void> {
  return request("/auth/logout", { method: "POST", authenticated: true });
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

export function placeTenantOrder(tenantPublicId: string, quotePublicId: string, idempotencyKey: string): Promise<TenantOrderResponse> {
  return request(`/tenants/${encodeURIComponent(tenantPublicId)}/orders`, {
    method: "POST",
    body: { quotePublicId, emptiesExpected: 0 },
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
