import { Ionicons } from "@expo/vector-icons";
import { formatINR, formatTime } from "@gassetu/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Alert, View } from "react-native";
import { toast } from "@/components/Toast";
import { useMyDrops } from "@/features/delivery";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Card, Divider, KeyValue, ListItem, Row, Screen, SkeletonCard, Text, t } from "@/ui";

/** D6 — Day summary */
export default function SummaryScreen() {
  const { staff, pending, done } = useMyDrops();
  const qc = useQueryClient();
  const router = useRouter();
  const { logout, setMode, login } = useSession();
  const s = staff.data;
  const delivered = done.filter((b) => b.status === "DELIVERED");
  const failed = done.filter((b) => b.status !== "DELIVERED");
  const codCollected = delivered.filter((b) => b.payment.method === "cod").reduce((sum, b) => sum + b.charges.total, 0);
  const cylinders = delivered.reduce((sum, b) => sum + b.items.reduce((x, i) => x + i.qty, 0), 0);

  const deposit = () => {
    if (!s) return;
    Alert.alert("Deposit cash?", `Confirm handing over ${formatINR(s.cashInHand)} at the agency counter.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Confirm",
        onPress: async () => {
          const r = await post(`/staff/${s.id}/deposit`);
          qc.invalidateQueries({ queryKey: ["staff"] });
          toast.success("Cash deposited", `${formatINR(r.deposited)} recorded at the agency.`);
        },
      },
    ]);
  };

  const backToCustomer = async () => {
    const r = await post("/auth/verify", { phone: "9000000001", otp: "123456" });
    login(r.token, r.user, { hasProfile: true, hasAgency: true });
    setMode("customer");
    qc.clear();
    router.replace("/(customer)/home");
  };

  return (
    <Screen title="Day summary" subtitle={new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} tabBar>
      {staff.isLoading ? (
        <SkeletonCard lines={6} />
      ) : (
        <View style={{ gap: 12 }}>
          <Card>
            <Row between>
              <View style={{ alignItems: "center", flex: 1 }}>
                <Text variant="title" tone="success">
                  {delivered.length}
                </Text>
                <Text variant="caption" tone="muted">
                  Delivered
                </Text>
              </View>
              <View style={{ alignItems: "center", flex: 1 }}>
                <Text variant="title" tone="danger">
                  {failed.length}
                </Text>
                <Text variant="caption" tone="muted">
                  Failed
                </Text>
              </View>
              <View style={{ alignItems: "center", flex: 1 }}>
                <Text variant="title">{pending.length}</Text>
                <Text variant="caption" tone="muted">
                  Pending
                </Text>
              </View>
            </Row>
            <Divider />
            <KeyValue k="Cylinders delivered" v={String(cylinders)} />
            <KeyValue k="Empties collected" v={String(delivered.filter((b) => b.emptyCollected).length)} />
            <KeyValue k="On-time rate" v={`${s?.onTimePct ?? 0}%`} />
          </Card>

          <Card tone="soft">
            <Row between>
              <View>
                <Text variant="label" tone="faint">
                  Cash to deposit
                </Text>
                <Text variant="title">{formatINR(s?.cashInHand ?? 0)}</Text>
                <Text variant="caption" tone="muted">
                  {codCollected ? `${formatINR(codCollected)} collected today` : "No COD collected today"}
                </Text>
              </View>
              <Button title="Deposit" icon="cash-outline" full={false} disabled={!s?.cashInHand} onPress={deposit} />
            </Row>
          </Card>

          {done.length ? (
            <Card style={{ paddingVertical: 4 }}>
              {done.map((b) => (
                <ListItem key={b.id} icon={b.status === "DELIVERED" ? "checkmark-circle" : "close-circle"} iconColor={b.status === "DELIVERED" ? t.colors.success : t.colors.danger} title={b.customerName} subtitle={`${b.code} · ${b.deliveredAt ? formatTime(b.deliveredAt) : b.status.replace(/_/g, " ").toLowerCase()} · ${b.payment.method === "cod" ? formatINR(b.charges.total, { decimals: false }) + " cash" : "prepaid"}`} onPress={() => router.push(`/drop/${b.id}`)} />
              ))}
            </Card>
          ) : null}

          <Card style={{ paddingVertical: 4 }}>
            <ListItem icon="person-outline" title="Switch to Customer mode (demo)" subtitle="Back to Riya's app" onPress={backToCustomer} iconColor={t.colors.primary} />
            <ListItem icon="log-out-outline" title="Log out" danger onPress={() => { logout(); qc.clear(); router.replace("/"); }} />
          </Card>
          <Row gap={6} style={{ justifyContent: "center" }}>
            <Ionicons name="shield-checkmark-outline" size={14} color={t.colors.inkFaint} />
            <Text variant="caption" tone="faint">
              Location is shared with the agency only while a trip is active
            </Text>
          </Row>
        </View>
      )}
    </Screen>
  );
}
