import type { TenantInvoiceStatus, TenantOrderStatus } from "@/lib/platform-api";
import { Badge } from "@/ui";
import { t } from "@/ui/theme";

export const tenantOrderStatusLabel: Record<TenantOrderStatus, string> = {
  pending_payment: "Payment pending",
  payment_failed: "Payment failed",
  placed: "Placed",
  accepted: "Accepted",
  assigned: "Partner assigned",
  out_for_delivery: "Out for delivery",
  delivery_failed: "Delivery failed",
  delivered: "Delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const orderTone: Record<TenantOrderStatus, { bg: string; fg: string }> = {
  pending_payment: { bg: t.colors.goldSoft, fg: t.colors.goldDark },
  payment_failed: { bg: t.colors.dangerSoft, fg: t.colors.danger },
  placed: { bg: t.colors.primarySoft, fg: t.colors.primary },
  accepted: { bg: t.colors.primarySoft, fg: t.colors.primary },
  assigned: { bg: t.colors.primarySoft, fg: t.colors.primary },
  out_for_delivery: { bg: t.colors.goldSoft, fg: t.colors.goldDark },
  delivery_failed: { bg: t.colors.dangerSoft, fg: t.colors.danger },
  delivered: { bg: t.colors.successSoft, fg: t.colors.success },
  rejected: { bg: t.colors.dangerSoft, fg: t.colors.danger },
  cancelled: { bg: t.colors.surfaceAlt, fg: t.colors.inkMuted },
};

export function TenantOrderStatusBadge({ status }: { status: TenantOrderStatus }) {
  return <Badge label={tenantOrderStatusLabel[status]} {...orderTone[status]} dot />;
}

export const tenantInvoiceStatusLabel: Record<TenantInvoiceStatus, string> = {
  open: "Open",
  overdue: "Overdue",
  paid: "Paid",
  void: "Void",
};

const invoiceTone: Record<TenantInvoiceStatus, { bg: string; fg: string }> = {
  open: { bg: t.colors.goldSoft, fg: t.colors.goldDark },
  overdue: { bg: t.colors.dangerSoft, fg: t.colors.danger },
  paid: { bg: t.colors.successSoft, fg: t.colors.success },
  void: { bg: t.colors.surfaceAlt, fg: t.colors.inkMuted },
};

export function TenantInvoiceStatusBadge({ status }: { status: TenantInvoiceStatus }) {
  return <Badge label={tenantInvoiceStatusLabel[status]} {...invoiceTone[status]} dot />;
}
