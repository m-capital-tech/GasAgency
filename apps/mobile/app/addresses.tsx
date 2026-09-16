import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { toast } from "@/components/Toast";
import { useCustomer } from "@/features/hooks";
import { Button, Card, EmptyState, Row, Screen, SkeletonList, Text, t } from "@/ui";

/** Saved addresses (from C16). */
export default function AddressesScreen() {
  const customer = useCustomer();
  const c = customer.data;
  return (
    <Screen title="Addresses" back footer={<Button title="Add new address" icon="add" variant="secondary" onPress={() => toast.info("Prototype", "Address editing is mocked — the demo uses your saved address.")} />}>
      {customer.isLoading ? (
        <SkeletonList count={2} />
      ) : !c || c.addresses.length === 0 ? (
        <EmptyState icon="location-outline" title="No addresses" body="Add an address to book deliveries." />
      ) : (
        <View style={{ gap: 10 }}>
          {c.addresses.map((a) => (
            <Card key={a.id}>
              <Row gap={12} center={false}>
                <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.colors.successSoft, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={a.label === "Home" ? "home" : "storefront"} size={18} color={t.colors.success} />
                </View>
                <View style={{ flex: 1 }}>
                  <Row gap={8}>
                    <Text variant="bodyStrong">{a.label}</Text>
                    {a.id === c.defaultAddressId ? (
                      <View style={{ backgroundColor: t.colors.primarySoft, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 }}>
                        <Text variant="caption" style={{ color: t.colors.primaryDark }}>
                          Default
                        </Text>
                      </View>
                    ) : null}
                  </Row>
                  <Text variant="small" tone="muted">
                    {a.line1}, {a.line2}
                  </Text>
                  <Text variant="small" tone="muted">
                    {a.city} — {a.pincode}
                  </Text>
                  <Text variant="caption" tone="faint" style={{ marginTop: 4 }}>
                    Pin: {a.lat.toFixed(4)}, {a.lng.toFixed(4)}
                  </Text>
                </View>
              </Row>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
