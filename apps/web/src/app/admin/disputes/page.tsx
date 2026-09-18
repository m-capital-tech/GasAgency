"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/shell/Shell";
import { Badge, Button, Card, CardContent, EmptyState, ErrorState, NativeSelect, TBody, THead, Table, TableSkeleton, Tabs, TabsContent, TabsList, TabsTrigger, Tr } from "@/components/ui";
import { q, patch, post } from "@/features/hooks";
import { formatDateTime } from "@/lib/format";

const CAT: Record<string, string> = { delivery_delay: "Delivery delay", short_supply: "Short supply", leak: "Leak / safety", staff_behaviour: "Staff behaviour", billing: "Billing", other: "Other" };
const TONE: Record<string, "info" | "warning" | "success" | "danger"> = { open: "info", in_progress: "warning", resolved: "success", escalated: "danger" };

/** P5 — Disputes / complaints (escalated first) + transfer requests */
export default function DisputesPage() {
  const qc = useQueryClient();
  const complaints = useQuery(q.adminComplaints());
  const transfers = useQuery(q.adminTransfers());
  const list = [...(complaints.data ?? [])].sort((a: any, b: any) => (a.status === "escalated" ? -1 : 1) - (b.status === "escalated" ? -1 : 1));
  const escalated = list.filter((c: any) => c.status === "escalated").length;
  return (
    <>
      <PageHeader title="Disputes & complaints" subtitle={`${escalated} escalated to platform · ${list.filter((c: any) => c.status !== "resolved").length} open overall`} />
      <Tabs defaultValue="complaints">
        <TabsList>
          <TabsTrigger value="complaints">Complaints</TabsTrigger>
          <TabsTrigger value="transfers">Transfer requests ({(transfers.data ?? []).filter((t: any) => t.status === "pending").length})</TabsTrigger>
        </TabsList>
        <TabsContent value="complaints" className="mt-3">
          <Card>
            <CardContent className="px-0 pt-2">
              {complaints.isLoading ? (
                <TableSkeleton />
              ) : complaints.isError ? (
                <ErrorState onRetry={() => complaints.refetch()} />
              ) : list.length === 0 ? (
                <EmptyState title="No complaints" />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <th>Ticket</th>
                      <th>Business</th>
                      <th>Agency</th>
                      <th>Category</th>
                      <th>Details</th>
                      <th>Raised</th>
                      <th>Status</th>
                      <th>Update</th>
                    </tr>
                  </THead>
                  <TBody>
                    {list.map((c: any) => (
                      <Tr key={c.id} className={c.status === "escalated" ? "bg-danger-soft/30" : ""}>
                        <td className="font-mono text-xs">{c.id.toUpperCase()}</td>
                        <td>
                          <p className="font-medium">{c.businessName}</p>
                          <p className="text-xs text-muted-foreground">{c.bookingCode ?? "—"}</p>
                        </td>
                        <td className="text-xs">{c.agencyName}</td>
                        <td>{CAT[c.category]}</td>
                        <td className="max-w-xs text-xs text-muted-foreground">{c.text}</td>
                        <td className="text-xs text-muted-foreground">{formatDateTime(c.createdAt)}</td>
                        <td>
                          <Badge tone={TONE[c.status]} dot>
                            {c.status.replace("_", " ")}
                          </Badge>
                        </td>
                        <td>
                          <NativeSelect className="h-8 w-auto text-xs" value={c.status} onChange={(e) => patch(`/complaints/${c.id}`, { status: e.target.value }).then(() => { qc.invalidateQueries({ queryKey: ["admin"] }); toast.success("Updated"); })} aria-label="Update status">
                            <option value="open">Open</option>
                            <option value="in_progress">In progress</option>
                            <option value="escalated">Escalated</option>
                            <option value="resolved">Resolved</option>
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
              {(transfers.data ?? []).length === 0 ? (
                <EmptyState title="No transfer requests" />
              ) : (
                <Table>
                  <THead>
                    <tr>
                      <th>Business</th>
                      <th>From</th>
                      <th>To</th>
                      <th>Reason</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </THead>
                  <TBody>
                    {(transfers.data ?? []).map((t: any) => (
                      <Tr key={t.id}>
                        <td className="font-medium">{t.businessName}</td>
                        <td className="text-xs">{t.fromAgencyName}</td>
                        <td className="text-xs">{t.toAgencyName ?? "Nearest available"}</td>
                        <td className="text-xs text-muted-foreground">{t.reason}</td>
                        <td>
                          <Badge tone={t.status === "pending" ? "warning" : t.status === "approved" ? "success" : "danger"} dot>
                            {t.status}
                          </Badge>
                        </td>
                        <td>
                          {t.status === "pending" ? (
                            <div className="flex gap-1">
                              <Button size="sm" variant="success" onClick={() => post(`/transfers/${t.id}/resolve`, { approve: true }).then(() => { qc.invalidateQueries({ queryKey: ["admin"] }); toast.success("Approved"); })}>
                                Approve
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => post(`/transfers/${t.id}/resolve`, { approve: false }).then(() => { qc.invalidateQueries({ queryKey: ["admin"] }); toast.success("Declined"); })}>
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
