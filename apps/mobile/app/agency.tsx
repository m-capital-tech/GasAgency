import { Ionicons } from "@expo/vector-icons";
import { formatINR } from "@gassetu/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, View } from "react-native";
import { AgencyCard } from "@/components/AgencyCard";
import { toast } from "@/components/Toast";
import { keys, useAgency, useCustomer, useUserId } from "@/features/hooks";
import { get, post } from "@/lib/api";
import { Badge, Button, Card, Chip, EmptyState, Input, KeyValue, Row, Screen, Sheet, SkeletonCard, Text, t } from "@/ui";

/** Agency details + "Request agency change" (C4/C16) */
export default function AgencyScreen() {
  const params = useLocalSearchParams<{ change?: string }>();
  const userId = useUserId();
  const qc = useQueryClient();
  const customer = useCustomer();
  const agency = useAgency(customer.data?.assignedAgencyId);
  const requests = useQuery({ queryKey: ["transfers", userId], queryFn: () => get(`/customers/${userId}/transfer-requests`), enabled: !!userId });
  const nearby = useQuery({ queryKey: ["nearby", userId], queryFn: () => get(`/agencies/nearest?lat=${customer.data!.addresses[0].lat}&lng=${customer.data!.addresses[0].lng}&pincode=${customer.data!.addresses[0].pincode}`), enabled: !!customer.data });
  const [open, setOpen] = useState(params.change === "1");
  const [reason, setReason] = useState("");
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = (requests.data ?? []).find((r: any) => r.status === "pending");

  const submit = async () => {
    if (reason.trim().length < 5) return toast.error("Tell us why", "A short reason helps the agency and our team.");
    setBusy(true);
    try {
      await post(`/customers/${userId}/transfer-request`, { reason, toAgencyId: to });
      qc.invalidateQueries({ queryKey: ["transfers", userId] });
      setOpen(false);
      toast.success("Request sent", "Your agency and our team will review it.");
    } catch (e) {
      toast.error("Couldn't send", (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="My agency" back>
      {agency.isLoading ? (
        <SkeletonCard lines={5} />
      ) : !agency.data ? (
        <EmptyState icon="storefront-outline" title="No agency assigned" body="Link your connection or find the nearest agency." />
      ) : (
        <View style={{ gap: 12 }}>
          <AgencyCard agency={agency.data} />
          <Card>
            <Text variant="label" tone="faint" style={{ marginBottom: 6 }}>
              Price list (illustrative)
            </Text>
            {agency.data.cylinderTypes.map((c: any) => {
              const p = agency.data.prices.find((x: any) => x.cylinderTypeId === c.id);
              return <KeyValue key={c.id} k={c.name} v={`${formatINR(p?.price ?? 0, { decimals: false })}${p?.deliveryCharge ? ` + ${formatINR(p.deliveryCharge, { decimals: false })} delivery` : " · free delivery"}`} />;
            })}
            <KeyValue k="Cash on delivery" v={agency.data.codEnabled ? "Available" : "Not available"} tone={agency.data.codEnabled ? "success" : "muted"} />
            <KeyValue k="Serves pincodes" v={agency.data.serviceArea.pincodes.join(", ")} />
          </Card>
          <Row gap={8}>
            <View style={{ flex: 1 }}>
              <Button title="Call" icon="call-outline" variant="secondary" onPress={() => Linking.openURL(`tel:${agency.data.phone}`)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button title="Request change" icon="swap-horizontal-outline" variant="ghost" onPress={() => setOpen(true)} disabled={!!pending} />
            </View>
          </Row>
          {pending ? (
            <Card tone="soft">
              <Row between>
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">Transfer request pending</Text>
                  <Text variant="small" tone="muted">
                    To {pending.toAgencyName ?? "nearest agency"} · "{pending.reason}"
                  </Text>
                </View>
                <Badge label="Pending" bg={t.colors.warningSoft} fg="#9A6B00" dot />
              </Row>
            </Card>
          ) : null}
        </View>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title="Request agency change">
        <Text variant="small" tone="muted" style={{ marginBottom: 12 }}>
          Your current agency and the GasSetu team will review this. Domestic connections may need the oil company's approval.
        </Text>
        <Text variant="caption" tone="muted" style={{ marginBottom: 8 }}>
          Preferred agency (optional)
        </Text>
        <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 12 }}>
          <Chip label="Nearest available" active={!to} onPress={() => setTo(null)} />
          {(nearby.data ?? [])
            .filter((a: any) => a.id !== customer.data?.assignedAgencyId)
            .slice(0, 4)
            .map((a: any) => (
              <Chip key={a.id} label={`${a.area} · ${a.omc}`} active={to === a.id} onPress={() => setTo(a.id)} />
            ))}
        </Row>
        <Input label="Reason" value={reason} onChangeText={setReason} placeholder="e.g. Moved to a new area" multiline style={{ minHeight: 70, textAlignVertical: "top" }} />
        <Button title="Send request" onPress={submit} loading={busy} style={{ marginTop: 14 }} icon="send-outline" />
        <Row gap={6} style={{ marginTop: 10, justifyContent: "center" }}>
          <Ionicons name="information-circle-outline" size={14} color={t.colors.inkFaint} />
          <Text variant="caption" tone="faint">
            Visible to the agency and platform admin
          </Text>
        </Row>
      </Sheet>
    </Screen>
  );
}
