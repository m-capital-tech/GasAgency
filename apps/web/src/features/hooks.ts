"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Agency, Booking, BookingStatus, Customer, DeliveryStaff } from "@gassetu/shared";
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
export type ExpandedStaff = DeliveryStaff & { name: string; phone: string; avatarColor: string; currentDrops: number; todayAssigned: number; todayDelivered: number; todayFailed: number; activeBookingId: string | null; tripProgress: number | null };
export type ExpandedCustomer = Customer & { name: string; phone: string; avatarColor: string; agencyName: string | null; totalBookings: number; lastRefillAt: string | null; dueForRefill?: boolean };

export function useAgencyId() {
  return useSession((s) => s.agency?.id ?? "");
}

export const q = {
  dashboard: (id: string) => ({ queryKey: ["dashboard", id], queryFn: () => get(`/agency/${id}/dashboard`), enabled: !!id }),
  orders: (id: string) => ({ queryKey: ["orders", id], queryFn: () => get<ExpandedBooking[]>(`/bookings?agencyId=${id}`), enabled: !!id }),
  booking: (id: string) => ({ queryKey: ["booking", id], queryFn: () => get<ExpandedBooking>(`/bookings/${id}`), enabled: !!id }),
  staff: (id: string) => ({ queryKey: ["staff", id], queryFn: () => get<ExpandedStaff[]>(`/agency/${id}/staff`), enabled: !!id }),
  customers: (id: string) => ({ queryKey: ["customers", id], queryFn: () => get<ExpandedCustomer[]>(`/agency/${id}/customers`), enabled: !!id }),
  inventory: (id: string) => ({ queryKey: ["inventory", id], queryFn: () => get(`/agency/${id}/inventory`), enabled: !!id }),
  prices: (id: string) => ({ queryKey: ["prices", id], queryFn: () => get(`/agency/${id}/prices`), enabled: !!id }),
  agency: (id: string) => ({ queryKey: ["agency", id], queryFn: () => get<Agency>(`/agencies/${id}`), enabled: !!id }),
  settlements: (id: string) => ({ queryKey: ["settlements", id], queryFn: () => get(`/agency/${id}/settlements`), enabled: !!id }),
  complaints: (id: string) => ({ queryKey: ["complaints", id], queryFn: () => get(`/agency/${id}/complaints`), enabled: !!id }),
  transfers: (id: string) => ({ queryKey: ["transfers", id], queryFn: () => get(`/agency/${id}/transfers`), enabled: !!id }),
  invoices: (id: string) => ({ queryKey: ["invoices", id], queryFn: () => get(`/agency/${id}/invoices`), enabled: !!id }),
  notifications: (userId: string) => ({ queryKey: ["notifications", userId], queryFn: () => get(`/users/${userId}/notifications`), enabled: !!userId }),
  adminOverview: () => ({ queryKey: ["admin", "overview"], queryFn: () => get("/admin/overview") }),
  adminAgencies: () => ({ queryKey: ["admin", "agencies"], queryFn: () => get("/admin/agencies") }),
  adminCustomers: (s: string) => ({ queryKey: ["admin", "customers", s], queryFn: () => get(`/admin/customers?q=${encodeURIComponent(s)}`) }),
  adminComplaints: () => ({ queryKey: ["admin", "complaints"], queryFn: () => get("/admin/complaints") }),
  adminTransfers: () => ({ queryKey: ["admin", "transfers"], queryFn: () => get("/admin/transfers") }),
  config: () => ({ queryKey: ["config"], queryFn: () => get("/admin/config") }),
};

export const useDashboard = () => useQuery(q.dashboard(useAgencyId()));
export const useOrders = () => useQuery(q.orders(useAgencyId()));
export const useBooking = (id: string) => useQuery(q.booking(id));
export const useStaff = () => useQuery(q.staff(useAgencyId()));
export const useCustomers = () => useQuery(q.customers(useAgencyId()));
export const useInventory = () => useQuery(q.inventory(useAgencyId()));

/** Keep caches fresh from the WebSocket. Returns nothing; mount once in the shell. */
export function useLiveSync(onEvent?: (e: Parameters<Parameters<typeof useLive>[0]>[0]) => void) {
  const qc = useQueryClient();
  useLive((e) => {
    switch (e.type) {
      case "booking.created":
      case "booking.updated":
        qc.setQueryData(["booking", e.booking.id], (old: ExpandedBooking | undefined) => (old ? { ...old, ...e.booking, items: old.items, route: old.route, routeIndex: old.routeIndex } : old));
        qc.invalidateQueries({ queryKey: ["booking", e.booking.id] });
        qc.invalidateQueries({ queryKey: ["orders"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        qc.invalidateQueries({ queryKey: ["staff"] });
        qc.invalidateQueries({ queryKey: ["customers"] });
        qc.invalidateQueries({ queryKey: ["settlements"] });
        qc.invalidateQueries({ queryKey: ["admin"] });
        break;
      case "staff.location":
        qc.setQueryData(["staff", e.agencyId], (old: ExpandedStaff[] | undefined) => old?.map((s) => (s.id === e.staffId ? { ...s, currentLocation: e.location, tripProgress: e.progress } : s)));
        if (e.bookingId) qc.setQueryData(["booking", e.bookingId], (old: ExpandedBooking | undefined) => (old && old.staff ? { ...old, etaMinutes: e.etaMinutes, staff: { ...old.staff, location: e.location }, routeIndex: old.route ? Math.round(e.progress * (old.route.length - 1)) : old.routeIndex } : old));
        qc.setQueryData(["orders", e.agencyId], (old: ExpandedBooking[] | undefined) => old?.map((b) => (b.id === e.bookingId && b.staff ? { ...b, etaMinutes: e.etaMinutes, staff: { ...b.staff, location: e.location } } : b)));
        break;
      case "staff.updated":
        qc.invalidateQueries({ queryKey: ["staff"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        break;
      case "inventory.updated":
        qc.invalidateQueries({ queryKey: ["inventory"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        break;
      case "agency.updated":
        qc.invalidateQueries({ queryKey: ["agency"] });
        qc.invalidateQueries({ queryKey: ["admin"] });
        break;
      case "notification":
        qc.invalidateQueries({ queryKey: ["notifications"] });
        qc.invalidateQueries({ queryKey: ["complaints"] });
        qc.invalidateQueries({ queryKey: ["transfers"] });
        break;
      case "demo.reset":
        qc.invalidateQueries();
        break;
    }
    onEvent?.(e);
  });
}

export function useOrderActions() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["orders"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["staff"] });
  };
  const accept = useMutation({ mutationFn: (id: string) => patch(`/bookings/${id}/status`, { status: "ACCEPTED" satisfies BookingStatus }), onSuccess: done });
  const reject = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => patch(`/bookings/${id}/status`, { status: "REJECTED" satisfies BookingStatus, reason }), onSuccess: done });
  const cancel = useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => patch(`/bookings/${id}/status`, { status: "CANCELLED" satisfies BookingStatus, reason, by: "agency" }), onSuccess: done });
  const assign = useMutation({ mutationFn: ({ id, staffId }: { id: string; staffId?: string }) => post(`/bookings/${id}/assign`, staffId ? { staffId } : { auto: true }), onSuccess: done });
  const reschedule = useMutation({ mutationFn: (id: string) => patch(`/bookings/${id}/status`, { status: "ACCEPTED" satisfies BookingStatus }), onSuccess: done });
  const bulk = useMutation({ mutationFn: ({ ids, action }: { ids: string[]; action: "accept" | "auto_assign" }) => post(`/bookings/bulk`, { ids, action }), onSuccess: done });
  const advance = useMutation({ mutationFn: (id: string) => post(`/demo/advance/${id}`), onSuccess: done });
  return { accept, reject, cancel, assign, reschedule, bulk, advance };
}

export { get, patch, post, put };
