import { BUSINESS_TYPE_LABELS } from "@gassetu/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { toast } from "@/components/Toast";
import { useBusiness } from "@/features/hooks";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Avatar, Badge, Card, Chip, Divider, ListItem, OmcBadge, Row, Screen, Sheet, Text, t } from "@/ui";

/** C16 — Profile & settings */
export default function ProfileScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, language, setLanguage, logout, login, setMode } = useSession();
  const [langOpen, setLangOpen] = useState(false);
  const biz = useBusiness();
  const b = biz.data;

  const switchToDelivery = async () => {
    try {
      const r = await post("/auth/verify", { phone: "9000000003", otp: "123456" });
      login(r.token, r.user);
      setMode("delivery");
      qc.clear();
      router.replace("/(delivery)/home");
    } catch (e) {
      toast.error("Could not switch", (e as Error).message);
    }
  };

  return (
    <Screen title="Profile" tabBar>
      <Card>
        <Row gap={14}>
          <Avatar name={b?.name || user?.name || "?"} color={user?.avatarColor} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="h2">{b?.name ?? "New business"}</Text>
            <Text variant="small" tone="muted">
              {user?.name} · +91 {user?.phone}
            </Text>
            <Row gap={6} style={{ marginTop: 6, flexWrap: "wrap" }}>
              {b ? <Badge label={BUSINESS_TYPE_LABELS[b.type]} bg={t.colors.surfaceAlt} fg={t.colors.inkMuted} /> : null}
              {b?.status === "verified" ? <Badge label="Verified" bg={t.colors.successSoft} fg={t.colors.success} dot /> : b?.status === "pending" ? <Badge label="Verification pending" bg={t.colors.goldSoft} fg={t.colors.goldDark} dot /> : null}
            </Row>
          </View>
        </Row>
        {b?.gstin || b?.fssai || b?.connection ? (
          <>
            <Divider />
            <Row between center={false}>
              <View style={{ flex: 1 }}>
                {b.gstin ? (
                  <Text variant="small">
                    GSTIN <Text variant="small" style={{ fontWeight: "600" }}>{b.gstin}</Text>
                  </Text>
                ) : null}
                {b.fssai ? (
                  <Text variant="small">
                    FSSAI <Text variant="small" style={{ fontWeight: "600" }}>{b.fssai}</Text>
                  </Text>
                ) : null}
                {b.connection ? (
                  <Text variant="small">
                    Commercial connection <Text variant="small" style={{ fontWeight: "600" }}>{b.connection.consumerNo}</Text>
                  </Text>
                ) : null}
              </View>
              {b.connection ? <OmcBadge omc={b.connection.omc} /> : null}
            </Row>
          </>
        ) : null}
      </Card>

      <Card style={{ marginTop: 14, paddingVertical: 4 }}>
        <ListItem icon="storefront-outline" title="Outlets" subtitle={b ? `${b.outlets.length} outlet${b.outlets.length === 1 ? "" : "s"} · ${b.outlets.map((o) => o.label).join(", ")}` : "Add a delivery outlet"} onPress={() => router.push("/outlets")} />
        <ListItem icon="card-outline" title="Credit account" subtitle={b?.credit.status === "approved" ? `Limit ₹${b.credit.limit.toLocaleString("en-IN")} · net-${b.credit.termDays}` : b?.credit.status === "requested" ? "Request under review" : "Not enabled — request from Billing"} onPress={() => router.push("/(business)/billing")} />
        <ListItem icon="calendar-outline" title="Standing orders" subtitle={b?.standingOrders.length ? `${b.standingOrders.filter((s) => s.active).length} active` : "Auto-order on fixed days"} onPress={() => router.push("/standing-orders")} />
        <ListItem icon="business-outline" title="My agency" subtitle={b?.agencyName ?? "Not assigned"} onPress={() => router.push("/agency")} />
        <ListItem icon="swap-horizontal-outline" title="Request agency change" subtitle="Move your account to a different distributor" onPress={() => router.push("/agency?change=1")} />
        <ListItem icon="language-outline" title="Language" subtitle={language === "en" ? "English" : language === "hi" ? "हिंदी" : "తెలుగు"} onPress={() => setLangOpen(true)} />
        <ListItem icon="help-circle-outline" title="Support & safety" subtitle="FAQ, complaints, emergency helpline" onPress={() => router.push("/support")} />
      </Card>

      <Card style={{ marginTop: 14, paddingVertical: 4 }}>
        <ListItem icon="bicycle-outline" title="Switch to Delivery mode (demo)" subtitle="See the app as Ramesh, a delivery partner" onPress={switchToDelivery} iconColor={t.colors.gold} />
        <ListItem
          icon="log-out-outline"
          title="Log out"
          danger
          onPress={() => {
            Alert.alert("Log out?", "You can log back in with the demo OTP.", [
              { text: "Cancel", style: "cancel" },
              { text: "Log out", style: "destructive", onPress: () => { logout(); qc.clear(); router.replace("/"); } },
            ]);
          }}
        />
      </Card>
      <Text variant="caption" tone="faint" center style={{ marginTop: 20 }}>
        GasSetu for Business · prototype · all data is illustrative
      </Text>
      <Sheet open={langOpen} onClose={() => setLangOpen(false)} title="Language">
        <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 8 }}>
          {([["en", "English"], ["hi", "हिंदी"], ["te", "తెలుగు"]] as const).map(([k, label]) => (
            <Chip key={k} label={label} active={language === k} onPress={() => { setLanguage(k); setLangOpen(false); }} />
          ))}
        </Row>
        <Text variant="caption" tone="faint">
          Prototype: Hindi and Telugu are labels only — the UI stays in English.
        </Text>
      </Sheet>
    </Screen>
  );
}
