import { Ionicons } from "@expo/vector-icons";
import { profileSchema, type LatLng } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MapPicker } from "@/components/MapPicker";
import { useSaveProfile } from "@/features/hooks";
import { useSession } from "@/lib/session";
import { Button, Input, Row, Screen, Text, t } from "@/ui";

/** C3 — Profile setup */
export default function ProfileSetup() {
  const router = useRouter();
  const { user, updateUser, setOnboarding } = useSession();
  const save = useSaveProfile();
  const [name, setName] = useState(user?.name ?? "");
  const [type, setType] = useState<"domestic" | "commercial">("domestic");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [pincode, setPincode] = useState("500013");
  const [pin, setPin] = useState<LatLng>({ lat: 17.3961, lng: 78.5211 });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const parsed = profileSchema.safeParse({ name, type, address: { line1, line2, pincode, lat: pin.lat, lng: pin.lng } });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (e[i.path[i.path.length - 1] as string] = i.message));
      return setErrors(e);
    }
    setErrors({});
    await save.mutateAsync({ id: user!.id, body: { name, type, address: { line1, line2: line2 || (type === "commercial" ? "Shop" : "Home"), pincode, lat: pin.lat, lng: pin.lng } } });
    updateUser({ name });
    setOnboarding("connection");
    router.replace("/(onboarding)/connection");
  };

  return (
    <Screen title="Set up your profile" subtitle="Step 1 of 2" keyboard footer={<Button title="Continue" size="lg" onPress={submit} loading={save.isPending} iconRight="arrow-forward" />}>
      <View style={{ gap: 16, marginTop: 8 }}>
        <Input label="Your name" value={name} onChangeText={setName} placeholder="e.g. Riya Sharma" error={errors.name} autoFocus />
        <View style={{ gap: 6 }}>
          <Text variant="caption" tone="muted">
            I'm booking for
          </Text>
          <Row gap={10}>
            {(["domestic", "commercial"] as const).map((k) => (
              <Pressable key={k} onPress={() => setType(k)} accessibilityRole="radio" accessibilityState={{ selected: type === k }} style={[styles.typeCard, type === k && styles.typeActive]}>
                <Ionicons name={k === "domestic" ? "home-outline" : "storefront-outline"} size={22} color={type === k ? t.colors.primary : t.colors.inkMuted} />
                <Text variant="bodyStrong">{k === "domestic" ? "My home" : "My business"}</Text>
                <Text variant="caption" tone="muted">
                  {k === "domestic" ? "14.2 kg / 5 kg cylinders" : "19 kg / 47.5 kg cylinders"}
                </Text>
              </Pressable>
            ))}
          </Row>
        </View>
        <View style={{ gap: 6 }}>
          <Text variant="caption" tone="muted">
            Delivery location
          </Text>
          <MapPicker value={pin} onChange={setPin} />
        </View>
        <Input label="Flat / house no., street" value={line1} onChangeText={setLine1} placeholder="12-2-417/8, Street No. 4" error={errors.line1} />
        <Input label="Area / landmark" value={line2} onChangeText={setLine2} placeholder="Vidyanagar, Amberpet" />
        <Input label="Pincode" value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" placeholder="500013" error={errors.pincode} hint="Demo city: Hyderabad (5xxxxx)" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  typeCard: { flex: 1, padding: 14, borderRadius: 16, backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.border, gap: 4 },
  typeActive: { borderColor: t.colors.primary, backgroundColor: t.colors.primarySoft },
});
