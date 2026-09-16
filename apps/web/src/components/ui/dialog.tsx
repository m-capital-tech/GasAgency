"use client";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, title, description, side, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { title?: string; description?: string; side?: "right" }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 bg-card text-card-foreground shadow-2xl focus:outline-none overflow-y-auto",
          side === "right" ? "inset-y-0 right-0 w-full max-w-xl border-l p-6" : "left-1/2 top-1/2 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-2xl border p-6",
          className,
        )}
        {...props}
      >
        {title ? (
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-semibold leading-tight">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="text-sm text-muted-foreground mt-1">{description}</DialogPrimitive.Description> : null}
            </div>
            <DialogPrimitive.Close className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Close">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
        ) : (
          <DialogPrimitive.Title className="sr-only">Dialog</DialogPrimitive.Title>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
