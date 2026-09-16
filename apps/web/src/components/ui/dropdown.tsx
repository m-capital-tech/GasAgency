"use client";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import * as React from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export function DropdownMenuContent({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content sideOffset={6} align="end" className={cn("z-[60] min-w-[10rem] overflow-hidden rounded-xl border bg-card p-1 shadow-xl", className)} {...props} />
    </DropdownMenuPrimitive.Portal>
  );
}
export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Item>) {
  return <DropdownMenuPrimitive.Item className={cn("flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-muted [&_svg]:size-4", className)} {...props} />;
}
export const DropdownMenuSeparator = () => <DropdownMenuPrimitive.Separator className="my-1 h-px bg-border" />;
