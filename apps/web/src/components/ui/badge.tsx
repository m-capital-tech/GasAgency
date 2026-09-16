import { STATUS_LABELS, type BookingStatus } from "@gassetu/shared";
import { cn } from "@/lib/utils";

const STATUS_CLASSES: Record<BookingStatus, string> = {
  PENDING_PAYMENT: "bg-warning-soft text-[#9c7328] dark:text-warning",
  PAYMENT_FAILED: "bg-danger-soft text-danger",
  PLACED: "bg-info-soft text-info",
  ACCEPTED: "bg-info-soft text-[#3a3633] dark:text-info",
  ASSIGNED: "bg-gold-soft text-[#9c7328] dark:text-gold",
  OUT_FOR_DELIVERY: "bg-primary-soft text-primary",
  DELIVERED: "bg-success-soft text-success",
  DELIVERY_FAILED: "bg-danger-soft text-danger",
  REJECTED: "bg-danger-soft text-danger",
  CANCELLED: "bg-muted text-muted-foreground",
};

export function Badge({ className, children, tone = "muted", dot }: { className?: string; children: React.ReactNode; tone?: "muted" | "primary" | "success" | "warning" | "danger" | "info"; dot?: boolean }) {
  const tones = {
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary-soft text-primary",
    success: "bg-success-soft text-success",
    warning: "bg-warning-soft text-[#9c7328] dark:text-warning",
    danger: "bg-danger-soft text-danger",
    info: "bg-info-soft text-info",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", tones[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap", STATUS_CLASSES[status], className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function OmcBadge({ omc }: { omc: string }) {
  const c: Record<string, string> = { HP: "bg-info-soft text-info", IOCL: "bg-primary-soft text-primary", BPCL: "bg-warning-soft text-[#9c7328] dark:text-warning" };
  return <span className={cn("inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-bold tracking-wide", c[omc] ?? "bg-muted")}>{omc}</span>;
}
