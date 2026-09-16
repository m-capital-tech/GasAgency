"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, FileText, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Map } from "@/components/map/Map";
import { PageHeader } from "@/components/shell/Shell";
import { Badge, Button, Card, CardContent, CardSkeleton, EmptyState, ErrorState, OmcBadge } from "@/components/ui";
import { q, post } from "@/features/hooks";
import { formatDateTime } from "@/lib/format";

/** P2 — Agency approvals */
export default function ApprovalsPage() {
  const qc = useQueryClient();
  const agencies = useQuery(q.adminAgencies());
  const pending = (agencies.data ?? []).filter((a: any) => a.status === "pending");
  const act = (id: string, status: "approved" | "suspended", name: string) =>
    post(`/admin/agencies/${id}/status`, { status })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["admin"] });
        qc.invalidateQueries({ queryKey: ["agency"] });
        toast.success(status === "approved" ? `${name} approved` : `${name} rejected`, { description: status === "approved" ? "The agency can now receive bookings and appears in nearest-agency assignment." : "The owner has been notified." });
      })
      .catch((e) => toast.error(e.message));
  if (agencies.isLoading) return <div className="grid gap-4 md:grid-cols-2">{Array.from({ length: 2 }).map((_, i) => <CardSkeleton key={i} />)}</div>;
  if (agencies.isError) return <ErrorState onRetry={() => agencies.refetch()} />;
  return (
    <>
      <PageHeader title="Agency approvals" subtitle={`${pending.length} pending KYC review`} />
      {pending.length === 0 ? (
        <EmptyState icon={BadgeCheck} title="Queue is empty" body="New agency registrations land here for KYC review. Try registering one from the home page." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {pending.map((a: any) => (
            <Card key={a.id}>
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-lg font-bold">
                      {a.name} <OmcBadge omc={a.omc} />
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {a.area} · Distributor {a.distributorCode} · GSTIN {a.gstin}
                    </p>
                    <p className="text-xs text-faint">Applied {formatDateTime(a.createdAt)} · Owner {a.ownerName} ({a.ownerEmail})</p>
                  </div>
                  <Badge tone="warning" dot>
                    Pending
                  </Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                  {["Distributorship letter", "GST certificate", "Owner PAN", "Cancelled cheque"].map((d) => (
                    <div key={d} className="flex items-center gap-2 rounded-lg border p-2">
                      <FileText className="size-4 text-muted-foreground" /> {d}
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <Map height={180} pins={[{ id: a.id, lat: a.serviceArea.center.lat, lng: a.serviceArea.center.lng, kind: "pending", label: a.name }]} circles={[{ lat: a.serviceArea.center.lat, lng: a.serviceArea.center.lng, radiusKm: a.serviceArea.radiusKm }]} fit={false} center={a.serviceArea.center} zoom={12} />
                  <p className="mt-2 text-xs text-muted-foreground">Serves pincodes {a.serviceArea.pincodes.join(", ")} · {a.serviceArea.radiusKm} km radius</p>
                </div>
                <div className="mt-4 flex gap-2">
                  <Button variant="success" onClick={() => act(a.id, "approved", a.name)}>
                    <BadgeCheck /> Approve
                  </Button>
                  <Button variant="outline" onClick={() => act(a.id, "suspended", a.name)}>
                    <XCircle /> Reject
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
