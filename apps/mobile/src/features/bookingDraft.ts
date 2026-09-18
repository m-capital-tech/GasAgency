import type { PaymentMethod, SlotType } from "@gassetu/shared";
import { create } from "zustand";

/** Cart for one order: a mix of 19 kg and 47.5 kg cylinders for one outlet. */
interface Draft {
  outletId: string | null;
  qty: Record<string, number>; // cylinderTypeId → qty
  emptiesToCollect: number | null; // null = same as cylinders ordered
  slot: SlotType;
  paymentMethod: PaymentMethod;
  set: (p: Partial<Omit<Draft, "set" | "reset" | "setQty">>) => void;
  setQty: (cylinderTypeId: string, qty: number) => void;
  reset: () => void;
}

export const useDraft = create<Draft>((set) => ({
  outletId: null,
  qty: {},
  emptiesToCollect: null,
  slot: "tomorrow_morning",
  paymentMethod: "credit",
  set: (p) => set(p),
  setQty: (id, qty) => set((s) => ({ qty: { ...s.qty, [id]: Math.max(0, Math.min(20, qty)) } })),
  reset: () => set({ outletId: null, qty: {}, emptiesToCollect: null, slot: "tomorrow_morning", paymentMethod: "credit" }),
}));

export const draftItems = (qty: Record<string, number>) =>
  Object.entries(qty)
    .filter(([, q]) => q > 0)
    .map(([cylinderTypeId, q]) => ({ cylinderTypeId, qty: q }));
export const draftCount = (qty: Record<string, number>) => Object.values(qty).reduce((s, q) => s + q, 0);
