import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Kpi({ label, value, sub, icon: Icon, tone = "muted", className }: { label: string; value: string | number; sub?: string; icon?: LucideIcon; tone?: "muted" | "primary" | "success" | "warning" | "danger" | "info"; className?: string }) {
  const tones = { muted: "bg-muted text-muted-foreground", primary: "bg-primary-soft text-primary", success: "bg-success-soft text-success", warning: "bg-warning-soft text-[#9c7328] dark:text-warning", danger: "bg-danger-soft text-danger", info: "bg-info-soft text-info" };
  return (
    <div className={cn("rounded-2xl border bg-card p-4", className)}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn("flex size-7 items-center justify-center rounded-lg", tones[tone])}>
            <Icon className="size-3.5" />
          </span>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
