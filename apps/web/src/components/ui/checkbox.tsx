"use client";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root className={cn("peer size-4 shrink-0 rounded border bg-card data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40", className)} {...props}>
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        <Check className="size-3" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
