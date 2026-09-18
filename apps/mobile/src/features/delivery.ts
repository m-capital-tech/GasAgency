import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { useSession } from "@/lib/session";
import { keys, useDrops, type ExpandedBooking } from "./hooks";

export interface StaffProfile {
  id: string;
  userId: string;
  agencyId: string;
  name: string;
  phone: string;
  vehicle: string;
  vehicleNo: string;
  online: boolean;
  currentLocation: { lat: number; lng: number };
  cashInHand: number;
  onTimePct: number;
  failedPct: number;
  currentDrops: number;
  currentCylinders: number;
  todayAssigned: number;
  todayDelivered: number;
  todayFailed: number;
  activeBookingId: string | null;
}

/** Resolve the delivery-staff record for the signed-in delivery user. */
export function useStaff() {
  const userId = useSession((s) => s.user?.id ?? "");
  return useQuery({
    queryKey: keys.staff(userId),
    queryFn: async () => {
      const me = await get(`/me/${userId}`);
      return me.profile as StaffProfile;
    },
    enabled: !!userId,
  });
}

export function useMyDrops() {
  const staff = useStaff();
  const drops = useDrops(staff.data?.id);
  return { staff, drops, pending: (drops.data?.pending ?? []) as ExpandedBooking[], done: (drops.data?.done ?? []) as ExpandedBooking[], cylindersToLoad: (drops.data?.cylindersToLoad ?? 0) as number };
}
