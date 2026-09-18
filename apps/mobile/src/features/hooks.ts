import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Booking, BookingStatus, Business, Notification, Outlet, PaymentMethod, SlotType, StandingOrder } from "@gassetu/shared";
import { useEffect } from "react";
import { del, get, onModeChange, patch, post, put } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useSession } from "@/lib/session";

export type ExpandedBooking = Omit<Booking, "items"> & {
  businessName: string;
  businessType: Business["type"];
  ownerName: string;
  contactPhone: string;
  outlet: Outlet;
  agencyName: string;
  agencyPhone: string;
  agencyOmc: string;
  agencyLocation: { lat: number; lng: number };
  cylinders: number;
  items: (Booking["items"][number] & { name: string })[];
  staff: { id: string; name: string; phone: string; vehicle: string; vehicleNo: string; location: { lat: number; lng: number }; onTimePct: number } | null;
  route: { lat: number; lng: number }[] | null;
  routeIndex: number | null;
};
export type ExpandedOutlet = Outlet & { daysLeft: number; lowStock: boolean };
export type ExpandedBusiness = Omit<Business, "outlets"> & {
  outlets: ExpandedOutlet[];
  ownerName: string;
  phone: string;
  avatarColor: string;
  agencyName: string | null;
  totalBookings: number;
  cylinders30: number;
  spend30: number;
  lastDeliveryAt: string | null;
  lastBooking: ExpandedBooking | null;
  creditOutstanding: number;
  creditOverdue: number;
  creditAvailable: number;
  lowStockOutlets: number;
  usualOrder: { cylinderTypeId: string; qty: number }[];
};
export interface Quote {
  charges: Booking["charges"];
  violation: { code: string; message: string } | null;
  items: { cylinderTypeId: string; qty: number; unitPrice: number; basePrice: number; negotiated: boolean; name: string }[];
  agency: any;
  codAllowed: boolean;
  creditAllowed: boolean;
  creditStatus: Business["credit"]["status"];
  creditAvailable: number;
  creditTermDays: number;
}

export const keys = {
  business: (id: string) => ["business", id] as const,
  bookings: (id: string) => ["bookings", id] as const,
  booking: (id: string) => ["booking", id] as const,
  notifications: (id: string) => ["notifications", id] as const,
  agency: (id: string) => ["agency", id] as const,
  complaints: (id: string) => ["complaints", id] as const,
  ledger: (id: string) => ["ledger", id] as const,
  statements: (id: string) => ["statements", id] as const,
  drops: (id: string) => ["drops", id] as const,
  staff: (id: string) => ["staff", id] as const,
};

export function useUserId() {
  return useSession((s) => s.user?.id ?? "");
}
export function useBusiness() {
  const id = useUserId();
  return useQuery({ queryKey: keys.business(id), queryFn: () => get<ExpandedBusiness>(`/businesses/${id}`), enabled: !!id });
}
export function useMyBookings() {
  const id = useUserId();
  return useQuery({ queryKey: keys.bookings(id), queryFn: () => get<ExpandedBooking[]>(`/bookings?businessId=${id}`), enabled: !!id });
}
export function useBooking(id: string | undefined) {
  return useQuery({ queryKey: keys.booking(id ?? ""), queryFn: () => get<ExpandedBooking>(`/bookings/${id}`), enabled: !!id });
}
export function useNotifications() {
  const id = useUserId();
  return useQuery({ queryKey: keys.notifications(id), queryFn: () => get<Notification[]>(`/users/${id}/notifications`), enabled: !!id });
}
export function useAgency(id: string | null | undefined) {
  return useQuery({ queryKey: keys.agency(id ?? ""), queryFn: () => get(`/agencies/${id}`), enabled: !!id });
}
export function useComplaints() {
  const id = useUserId();
  return useQuery({ queryKey: keys.complaints(id), queryFn: () => get(`/businesses/${id}/complaints`), enabled: !!id });
}
export function useLedger() {
  const id = useUserId();
  return useQuery({ queryKey: keys.ledger(id), queryFn: () => get(`/businesses/${id}/ledger`), enabled: !!id });
}
export function useStatements() {
  const id = useUserId();
  return useQuery({ queryKey: keys.statements(id), queryFn: () => get<string[]>(`/businesses/${id}/statements`), enabled: !!id });
}
export function useStatement(month: string | undefined) {
  const id = useUserId();
  return useQuery({ queryKey: [...keys.statements(id), month], queryFn: () => get(`/businesses/${id}/statements/${month}`), enabled: !!id && !!month });
}
export function useDrops(staffId: string | undefined) {
  return useQuery({ queryKey: keys.drops(staffId ?? ""), queryFn: () => get(`/staff/${staffId}/drops`), enabled: !!staffId, refetchInterval: 15000 });
}

/** Keep TanStack caches fresh from the live event stream. */
export function useLiveSync() {
  const qc = useQueryClient();
  const userId = useUserId();
  useEffect(() => {
    const off = onModeChange(() => qc.invalidateQueries());
    return () => {
      off();
    };
  }, [qc]);
  useLive((e) => {
    switch (e.type) {
      case "booking.created":
      case "booking.updated":
        qc.setQueryData(keys.booking(e.booking.id), (old: ExpandedBooking | undefined) => (old ? { ...old, ...e.booking, items: old.items, staff: e.booking.assignedStaffId === old.assignedStaffId ? old.staff : null, route: old.route, routeIndex: old.routeIndex } : old));
        qc.invalidateQueries({ queryKey: keys.booking(e.booking.id) });
        qc.invalidateQueries({ queryKey: ["bookings"] });
        qc.invalidateQueries({ queryKey: ["drops"] });
        qc.invalidateQueries({ queryKey: ["business"] });
        qc.invalidateQueries({ queryKey: ["ledger"] });
        qc.invalidateQueries({ queryKey: ["staff"] });
        break;
      case "staff.location":
        if (e.bookingId) {
          qc.setQueryData(keys.booking(e.bookingId), (old: ExpandedBooking | undefined) =>
            old && old.staff ? { ...old, etaMinutes: e.etaMinutes, staff: { ...old.staff, location: e.location }, routeIndex: old.route ? Math.round(e.progress * (old.route.length - 1)) : old.routeIndex } : old,
          );
        }
        break;
      case "staff.updated":
        qc.invalidateQueries({ queryKey: ["drops"] });
        qc.invalidateQueries({ queryKey: ["staff"] });
        break;
      case "business.updated":
        if (e.businessId === userId) {
          qc.invalidateQueries({ queryKey: keys.business(userId) });
          qc.invalidateQueries({ queryKey: ["ledger"] });
          qc.invalidateQueries({ queryKey: ["quote"] });
        }
        break;
      case "notification":
        if (e.notification.userId === userId) qc.invalidateQueries({ queryKey: keys.notifications(userId) });
        break;
      case "demo.reset":
        qc.invalidateQueries();
        break;
    }
  }, [userId]);
}

// ---- mutations
export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { businessId: string; outletId: string; items: { cylinderTypeId: string; qty: number }[]; slot: SlotType; paymentMethod: PaymentMethod; emptiesToCollect: number }) => post<ExpandedBooking>("/bookings", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bookings"] }),
  });
}
export function useCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { bookingId: string; ok: boolean; paymentId?: string; method?: string; error?: string }) => post<ExpandedBooking>("/payments/mock/checkout", input),
    onSuccess: (b) => {
      qc.setQueryData(keys.booking(b.id), b);
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
export function useBookingAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: "retry-payment" | "switch-payment" | "start-trip" | "complete" | "fail"; body?: unknown }) => post<ExpandedBooking>(`/bookings/${id}/${action}`, body),
    onSuccess: (b) => {
      qc.setQueryData(keys.booking(b.id), b);
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["drops"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
      qc.invalidateQueries({ queryKey: ["business"] });
    },
  });
}
export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => patch<ExpandedBooking>(`/bookings/${id}/status`, { status: "CANCELLED" satisfies BookingStatus, reason, by: "business" }),
    onSuccess: (b) => {
      qc.setQueryData(keys.booking(b.id), b);
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => put<ExpandedBusiness>(`/businesses/${id}/profile`, body),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.business(v.id) }),
  });
}
export function useBusinessMutation<TInput>(fn: (id: string, input: TInput) => Promise<ExpandedBusiness>) {
  const qc = useQueryClient();
  const id = useUserId();
  return useMutation({
    mutationFn: (input: TInput) => fn(id, input),
    onSuccess: (data) => {
      qc.setQueryData(keys.business(id), data);
      qc.invalidateQueries({ queryKey: keys.business(id) });
    },
  });
}
export const useAddOutlet = () => useBusinessMutation<Partial<Outlet>>((id, input) => post(`/businesses/${id}/outlets`, input));
export const useUpdateOutlet = () => useBusinessMutation<{ outletId: string; patch: Partial<Outlet> }>((id, { outletId, patch: p }) => patch(`/businesses/${id}/outlets/${outletId}`, p));
export const useSetDefaultOutlet = () => useBusinessMutation<string>((id, outletId) => post(`/businesses/${id}/outlets/${outletId}/default`));
export const useSaveStandingOrder = () => useBusinessMutation<Partial<StandingOrder>>((id, input) => put(`/businesses/${id}/standing-orders`, input));
export const useDeleteStandingOrder = () => useBusinessMutation<string>((id, soId) => del(`/businesses/${id}/standing-orders/${soId}`));
export const useRequestCredit = () => useBusinessMutation<{ note?: string }>((id, input) => post(`/businesses/${id}/credit/request`, input));
