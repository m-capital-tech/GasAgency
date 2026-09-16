import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { Alert, View } from "react-native";
import { toast } from "@/components/Toast";
import { useCustomer } from "@/features/hooks";
import { post } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Avatar, Card, Divider, ListItem, OmcBadge, Row, Screen, Text } from "@/ui";

/** C16 — Profile & settings */
export default function ProfileScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, language, logout, login, setMode } = useSession();
  const customer = useCustomer();
  const c = customer.data;
  const addr = c?.addresses.find((a) => a.id === c.defaultAddressId);

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
          <Avatar name={user?.name || "?"} color={user?.avatarColor} size={56} />
          <View style={{ flex: 1 }}>
            <Text variant="h2">{user?.name || "New customer"}</Text>
            <Text variant="small" tone="muted">
              +91 {user?.phone}
              {c ? ` · ${c.type === "commercial" ? "Commercial" : "Domestic"}` : ""}
            </Text>
          </View>
        </Row>
        {c?.connection ? (
          <>
            <Divider />
            <Row between>
              <View>
                <Text variant="label" tone="faint">
                  LPG connection
                </Text>
                <Text variant="bodyStrong">Consumer no. {c.connection.consumerNo}</Text>
                <Text variant="caption" tone="muted">
                  LPG ID {c.connection.lpgId}
                </Text>
              </View>
              <OmcBadge omc={c.connection.omc} />
            </Row>
          </>
        ) : null}
      </Card>

      <Card style={{ marginTop: 14, paddingVertical: 4 }}>
        <ListItem icon="location-outline" title="Addresses" subtitle={addr ? `${addr.line1}, ${addr.line2 ?? ""} ${addr.pincode}` : "Add a delivery address"} onPress={() => router.push("/addresses")} />
        <ListItem icon="storefront-outline" title="My agency" subtitle={c?.agencyName ?? "Not assigned"} onPress={() => router.push("/agency")} />
        <ListItem icon="swap-horizontal-outline" title="Request agency change" subtitle="Transfer to a different distributor" onPress={() => router.push("/agency?change=1")} />
        <ListItem icon="alarm-outline" title="Reminders & Auto-book" subtitle={c?.reminder.enabled ? "On" : "Off"} onPress={() => router.push("/reminders")} />
        <ListItem icon="language-outline" title="Language" subtitle={language === "en" ? "English" : language === "hi" ? "हिंदी" : "తెలుగు"} onPress={() => { logout(); router.replace("/"); }} />
        <ListItem icon="help-circle-outline" title="Support & safety" subtitle="FAQ, complaints, emergency helpline" onPress={() => router.push("/support")} />
      </Card>

      <Card style={{ marginTop: 14, paddingVertical: 4 }}>
        <ListItem icon="bicycle-outline" title="Switch to Delivery mode (demo)" subtitle="See the app as Ramesh, a delivery partner" onPress={switchToDelivery} iconColor="#2F6FED" />
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
        GasSetu prototype · v1.0 · all data is illustrative
      </Text>
    </Screen>
  );
}
