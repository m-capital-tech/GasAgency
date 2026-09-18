"use client";
import { Bike, Radio } from "lucide-react";
import { useState } from "react";
import { Map, type MapPin } from "@/components/map/Map";
import { OrderDrawer } from "@/components/orders/OrderDrawer";
import { PageHeader } from "@/components/shell/Shell";
import { Avatar, Badge, Card, CardContent, ErrorState, Skeleton } from "@/components/ui";
import { useOrders, useStaff } from "@/features/hooks";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

/** A5 — Live tracking */
export default function TrackingPage() {
  const agency = useSession((s) => s.agency);
  const staff = useStaff();
  const orders = useOrders();
  const [focus, setFocus] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (staff.isLoading || orders.isLoading) return <Skeleton className="h-[70vh]" />;
  if (staff.isError || !agency) return <ErrorState onRetry={() => staff.refetch()} />;
  const active = (orders.data ?? []).filter((b) => ["ASSIGNED", "OUT_FOR_DELIVERY"].includes(b.status));
  const shownStaff = (staff.data ?? []).filter((s) => !focus || s.id === focus);
  const pins: MapPin[] = [
    { id: "ag", lat: agency.serviceArea.center.lat, lng: agency.serviceArea.center.lng, kind: "agency", label: agency.name },
    ...shownStaff.filter((s) => s.online || s.activeBookingId).map((s) => ({ id: s.id, lat: s.currentLocation.lat, lng: s.currentLocation.lng, kind: s.activeBookingId ? ("staff" as const) : ("staff-idle" as const), label: s.name, sub: s.activeBookingId ? "Delivering" : `Idle · ${s.currentDrops} drops · ${s.currentCylinders} cyl queued` })),
    ...active.filter((b) => !focus || b.assignedStaffId === focus).map((b) => ({ id: b.id, lat: b.outlet.lat, lng: b.outlet.lng, kind: b.status === "OUT_FOR_DELIVERY" ? ("customer" as const) : ("pending" as const), label: `${b.code} · ${b.businessName}`, sub: `${b.cylinders} cyl · ${b.status === "OUT_FOR_DELIVERY" ? `ETA ${b.etaMinutes ?? "—"} min` : "Assigned, not started"}` })),
  ];
  const routes = active.filter((b) => b.status === "OUT_FOR_DELIVERY" && b.route && (!focus || b.assignedStaffId === focus)).map((b) => ({ id: b.id, points: b.route! }));

  return (
    <>
      <PageHeader title="Live tracking" subtitle={`${(staff.data ?? []).filter((s) => s.activeBookingId).length} on a trip · ${active.length} active drops · ${active.reduce((s, b) => s + b.cylinders, 0)} cylinders on the road`}>
        <span className="flex items-center gap-1.5 text-xs text-success">
          <Radio className="size-3.5 animate-pulse" /> Positions update every 1.5 s
        </span>
      </PageHeader>
      <div className="grid gap-4 lg:grid-cols-4">
        <div className="lg:col-span-3">
          <Map height="70vh" pins={pins} routes={routes} circles={[{ lat: agency.serviceArea.center.lat, lng: agency.serviceArea.center.lng, radiusKm: agency.serviceArea.radiusKm }]} />
        </div>
        <Card className="max-h-[70vh] overflow-y-auto">
          <CardContent className="p-2">
            <button onClick={() => setFocus(null)} className={cn("mb-1 w-full rounded-lg px-3 py-2 text-left text-xs font-semibold", !focus ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-muted")}>
              All staff ({(staff.data ?? []).length})
            </button>
            {(staff.data ?? []).map((s) => {
              const drop = active.find((b) => b.id === s.activeBookingId);
              return (
                <button key={s.id} onClick={() => setFocus(focus === s.id ? null : s.id)} className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left", focus === s.id ? "bg-primary-soft" : "hover:bg-muted")}>
                  <Avatar name={s.name} color={s.avatarColor} size={30} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {drop ? (
                        <span
                          className="text-primary underline-offset-2 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpen(drop.id);
                          }}
                        >
                          {drop.code} · ETA {drop.etaMinutes ?? "—"} min
                        </span>
                      ) : s.online ? (
                        `Idle · ${s.currentDrops} queued`
                      ) : (
                        "Offline"
                      )}
                    </p>
                  </div>
                  {s.activeBookingId ? <Bike className="size-4 text-primary" /> : <Badge tone={s.online ? "success" : "muted"}>{s.online ? "on" : "off"}</Badge>}
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>
      <OrderDrawer id={open} onClose={() => setOpen(null)} />
    </>
  );
}
