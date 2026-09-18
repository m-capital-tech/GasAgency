"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/Shell";
import { Badge, Button, Card, CardContent, EmptyState, ErrorState, NativeSelect, TBody, THead, Table, TableSkeleton, Tabs, TabsContent, TabsList, TabsTrigger, Tr } from "@/components/ui";
import { q, useAgencyId, patch, post } from "@/features/hooks";
import { formatDateTime } from "@/lib/format";

const CAT: Record<string, string> = { delivery_delay: "Delivery delay", short_supply: "Short supply", leak: "Leak / safety", staff_behaviour: "Staff behaviour", billing: "Billing", other: "Other" };
const TONE: Record<string, "info" | "warning" | "success" | "danger"> = { open: "info", in_progress: "warning", resolved: "success", escalated: "danger" };

/** A11 — Complaints & transfer requests */
export default function ComplaintsPage() {
  const agencyId = useAgencyId();
  const qc = useQueryClient();
  const complaints = useQuery(q.complaints(agencyId));
  const transfers = useQuery(q.transfers(agencyId));
  const setStatus = (id: string, status: string) =>
    patch(`/complaints/${id}`, { status })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["complaints"] });
        toast.success(`Marked ${status.replace("_", " ")}`);
      })
      .catch((e) => toast.error(e.message));
  const resolve = (id: string, approve: boolean) =>
    post(`/transfers/${id}/resolve`, { approve })
      .then(() => {
        qc.invalidateQueries({ queryKey: ["transfers"] });
        qc.invalidateQueries({ queryKey: ["accounts"] });
        toast.success(approve ? "Transfer approved" : "Transfer declined");
      })
      .catch((e) => toast.error(e.message));
  const open = (complaints.data ?? []).filter((c: any) => c.status !== "resolved").length;
  const pendingT = (transfers.data ?? []).filter((t: any) => t.status === "pending").length;

  return (
    <>
      <PageHeader title="Complaints & transfers" subtitle={`${open} open complaints · ${pendingT} pending transfer requests`} />
      <Tabs defaultValue="complaints">
        <TabsList>
          <TabsTrigger value="complaints">Complaints ({open})</TabsTrigger>
          <TabsTrigger value="transfers">Transfer requests ({pendingT})</TabsTrigger>
        </TabsList>
        <TabsContent value="complaints" className="mt-3">
          <Card>
            <CardContent className="px-0 pt-2">
              {complaints.isLoading ? (
                <TableSkeleton />
              ) : complaints.isError ? (
                <ErrorState onRetry={() => complaints.refetch()} />
              ) : (complaints.data ?? []).length === 0 ? (
                <EmptyState title="No complaints" body="Complaints raised by business accounts from the app appear here." />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <th>Ticket</th>
                      <th>Business</th>
                      <th>Category</th>
                      <th>Details</th>
                      <th>Raised</th>
                      <th>Status</th>
                      <th>Update</th>
                    </tr>
                  </THead>
                  <TBody>
                    {(complaints.data ?? []).map((c: any) => (
                      <Tr key={c.id}>
                        <td className="font-mono text-xs">{c.id.toUpperCase()}</td>
                        <td>
                          <p className="font-medium">{c.businessName}</p>
                          <p className="text-xs text-muted-foreground">{c.bookingCode ?? "—"}</p>
                        </td>
                        <td>{CAT[c.category]}</td>
                        <td className="max-w-xs text-xs text-muted-foreground">{c.text}</td>
                        <td className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</td>
                        <td>
                          <Badge tone={TONE[c.status]} dot>
                            {c.status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td>
                          <NativeSelect className="h-8 w-auto text-xs" value={c.status} onChange={(e) => setStatus(c.id, e.target.value)} aria-label="Update status">
                            <option value="open">Open</option>
                            <option value="in_progress">In progress</option>
                            <option value="resolved">Resolved</option>
                            <option value="escalated">Escalate to platform</option>
                          </NativeSelect>
                        </td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="transfers" className="mt-3">
          <Card>
            <CardContent className="px-0 pt-2">
              {transfers.isLoading ? (
                <TableSkeleton rows={3} />
              ) : (transfers.data ?? []).length === 0 ? (
                <EmptyState title="No transfer requests" body="Requests to move business accounts to or from your agency show up here." />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <th>Business</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Reason</th>
                      <th>Raised</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </THead>
                  <TBody>
                    {(transfers.data ?? []).map((t: any) => (
                      <Tr key={t.id}>
                        <td>
                          <p className="font-medium">{t.businessName}</p>
                          <p className="text-xs text-muted-foreground">+91 {t.contactPhone}</p>
                        </td>
                        <td className="text-xs">{t.fromAgencyName}</td>
                        <td className="text-xs">{t.toAgencyName ?? "Nearest available"}</td>
                        <td className="text-xs text-muted-foreground">{t.reason}</td>
                        <td className="text-xs text-muted-foreground">{formatDateTime(t.createdAt)}</td>
                        <td>
                          <Badge tone={t.status === "pending" ? "warning" : t.status === "approved" ? "success" : "danger"} dot>
                            {t.status}
                          </Badge>
                        </td>
                        <td>
                          {t.status === "pending" ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="success" onClick={() => resolve(t.id, true)}>
                                Approve
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => resolve(t.id, false)}>
                                Decline
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </Tr>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
