import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Booking, BookingStatus, Customer, Notification, SlotType } from "@gassetu/shared";
import { get, patch, post, put } from "@/lib/api";
import { useLive } from "@/lib/live";
import { useSession } from "@/lib/session";

export type ExpandedBooking = Omit<Booking, "items"> & {
  customerName: string;
  customerPhone: string;
  customerType: "domestic" | "commercial";
  address: Customer["addresses"][number];
  agencyName: string;
  agencyPhone: string;
  agencyOmc: string;
  agencyLocation: { lat: number; lng: number };
  items: (Booking["items"][number] & { name: string })[];
  staff: { id: string; name: string; phone: string; vehicle: string; vehicleNo: string; location: { lat: number; lng: number }; onTimePct: number } | null;
  route: { lat: number; lng: number }[] | null;
  routeIndex: number | null;
};
export type ExpandedCustomer = Customer & { name: string; phone: string; avatarColor: string; agencyName: string | null; totalBookings: number; lastRefillAt: string | null; lastBooking: ExpandedBooking | null };

export const keys = {
  customer: (id: string) => ["customer", id] as const,
  usage: (id: string) => ["usage", id] as const,
  bookings: (id: string) => ["bookings", id] as const,
  booking: (id: string) => ["booking", id] as const,
  notifications: (id: string) => ["notifications", id] as const,
  agency: (id: string) => ["agency", id] as const,
  complaints: (id: string) => ["complaints", id] as const,
  drops: (id: string) => ["drops", id] as const,
  staff: (id: string) => ["staff", id] as const,
};

export function useUserId() {
  return useSession((s) => s.user?.id ?? "");
}

export function useCustomer() {
  const id = useUserId();
  return useQuery({ queryKey: keys.customer(id), queryFn: () => get<ExpandedCustomer>(`/customers/${id}`), enabled: !!id });
}
export function useUsage() {
  const id = useUserId();
  return useQuery({ queryKey: keys.usage(id), queryFn: () => get(`/customers/${id}/usage`), enabled: !!id });
}
export function useMyBookings() {
  const id = useUserId();
  return useQuery({ queryKey: keys.bookings(id), queryFn: () => get<ExpandedBooking[]>(`/bookings?customerId=${id}`), enabled: !!id });
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
  return useQuery({ queryKey: keys.complaints(id), queryFn: () => get(`/customers/${id}/complaints`), enabled: !!id });
}
export function useDrops(staffId: string | undefined) {
  return useQuery({ queryKey: keys.drops(staffId ?? ""), queryFn: () => get(`/staff/${staffId}/drops`), enabled: !!staffId, refetchInterval: 15000 });
}

/** Keep TanStack caches fresh from the live event stream. */
export function useLiveSync() {
  const qc = useQueryClient();
  const userId = useUserId();
  useLive((e) => {
    switch (e.type) {
      case "booking.created":
      case "booking.updated": {
        qc.setQueryData(keys.booking(e.booking.id), (old: ExpandedBooking | undefined) => (old ? { ...old, ...e.booking, route: old.route, routeIndex: old.routeIndex } : old));
        qc.invalidateQueries({ queryKey: keys.booking(e.booking.id) });
        qc.invalidateQueries({ queryKey: ["bookings"] });
        qc.invalidateQueries({ queryKey: ["drops"] });
        qc.invalidateQueries({ queryKey: ["usage"] });
        qc.invalidateQueries({ queryKey: ["customer"] });
        qc.invalidateQueries({ queryKey: ["staff"] });
        break;
      }
      case "staff.location": {
        if (e.bookingId) {
          qc.setQueryData(keys.booking(e.bookingId), (old: ExpandedBooking | undefined) =>
            old && old.staff ? { ...old, etaMinutes: e.etaMinutes, staff: { ...old.staff, location: e.location }, routeIndex: old.route ? Math.round(e.progress * (old.route.length - 1)) : old.routeIndex } : old,
          );
        }
        break;
      }
      case "staff.updated":
        qc.invalidateQueries({ queryKey: ["drops"] });
        qc.invalidateQueries({ queryKey: ["staff"] });
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
    mutationFn: (input: { customerId: string; addressId: string; items: { cylinderTypeId: string; qty: number }[]; slot: SlotType; paymentMethod: string }) => post<ExpandedBooking>("/bookings", input),
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
    mutationFn: ({ id, action, body }: { id: string; action: "retry-payment" | "switch-cod" | "start-trip" | "complete" | "fail"; body?: unknown }) => post<ExpandedBooking>(`/bookings/${id}/${action}`, body),
    onSuccess: (b) => {
      qc.setQueryData(keys.booking(b.id), b);
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["drops"] });
      qc.invalidateQueries({ queryKey: ["staff"] });
    },
  });
}
export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => patch<ExpandedBooking>(`/bookings/${id}/status`, { status: "CANCELLED" satisfies BookingStatus, reason, by: "customer" }),
    onSuccess: (b) => {
      qc.setQueryData(keys.booking(b.id), b);
      qc.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
}
export function useUpdateReminder() {
  const qc = useQueryClient();
  const id = useUserId();
  return useMutation({
    mutationFn: (body: Partial<Customer["reminder"]>) => patch(`/customers/${id}/reminder`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.customer(id) });
      qc.invalidateQueries({ queryKey: keys.usage(id) });
    },
  });
}
export function useSaveProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) => put<ExpandedCustomer>(`/customers/${id}/profile`, body),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: keys.customer(v.id) }),
  });
}
