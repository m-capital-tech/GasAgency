import type { PaymentMethod, SlotType } from "@gassetu/shared";
import { create } from "zustand";

interface Draft {
  cylinderTypeId: string | null;
  qty: number;
  slot: SlotType;
  paymentMethod: PaymentMethod;
  set: (p: Partial<Omit<Draft, "set" | "reset">>) => void;
  reset: () => void;
}

export const useDraft = create<Draft>((set) => ({
  cylinderTypeId: null,
  qty: 1,
  slot: "standard",
  paymentMethod: "upi",
  set: (p) => set(p),
  reset: () => set({ cylinderTypeId: null, qty: 1, slot: "standard", paymentMethod: "upi" }),
}));
