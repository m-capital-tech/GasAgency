"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/Shell";
import { Badge, Button, Card, CardContent, ErrorState, OmcBadge, TBody, THead, Table, TableSkeleton, Tr } from "@/components/ui";
import { q, post } from "@/features/hooks";

/** P3 — Agencies */
export default function AdminAgenciesPage() {
  const qc = useQueryClient();
  const agencies = useQuery(q.adminAgencies());
  const setStatus = (id: string, status: string, name: string) =>
    post(`/admin/agencies/${id}/status`, { status })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["admin"] });
        toast.success(`${name} ${status}`);
      })
      .catch((e) => toast.error(e.message));
  return (
    <>
      <PageHeader title="Agencies" subtitle={`${(agencies.data ?? []).length} registered across Hyderabad`} />
      <Card>
        <CardContent className="px-0 pt-2">
          {agencies.isLoading ? (
            <TableSkeleton />
          ) : agencies.isError ? (
            <ErrorState onRetry={() => agencies.refetch()} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <th>Agency</th>
                  <th>OMC</th>
                  <th>Owner</th>
                  <th>Plan</th>
                  <th className="text-right">Customers</th>
                  <th className="text-right">Staff</th>
                  <th className="text-right">Orders (30d)</th>
                  <th className="text-right">On-time</th>
                  <th className="text-right">Rating</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </THead>
              <TBody>
                {(agencies.data ?? []).map((a: any) => (
                  <Tr key={a.id}>
                    <td>
                      <p className="font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.area} · {a.distributorCode}</p>
                    </td>
                    <td>
                      <OmcBadge omc={a.omc} />
                    </td>
                    <td className="text-xs">
                      {a.ownerName}
                      <br />
                      <span className="text-muted-foreground">{a.ownerEmail}</span>
                    </td>
                    <td className="capitalize">{a.plan}</td>
                    <td className="text-right tabular-nums">{a.customerCount}</td>
                    <td className="text-right tabular-nums">{a.staffCount}</td>
                    <td className="text-right tabular-nums">{a.orders30}</td>
                    <td className="text-right tabular-nums">{a.onTimePct}%</td>
                    <td className="text-right tabular-nums">{a.rating ? `★ ${a.rating}` : "—"}</td>
                    <td>
                      <Badge tone={a.status === "approved" ? "success" : a.status === "pending" ? "warning" : "danger"} dot>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="text-right">
                      {a.status === "approved" ? (
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => setStatus(a.id, "suspended", a.name)}>
                          Suspend
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" className="text-success" onClick={() => setStatus(a.id, "approved", a.name)}>
                          {a.status === "pending" ? "Approve" : "Reinstate"}
                        </Button>
                      )}
                    </td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
