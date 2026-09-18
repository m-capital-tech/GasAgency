import { Ionicons } from "@expo/vector-icons";
import { BUSINESS_TYPE_LABELS, businessProfileSchema, type BusinessType, type LatLng } from "@gassetu/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MapPicker } from "@/components/MapPicker";
import { useSaveProfile } from "@/features/hooks";
import { useSession } from "@/lib/session";
import { Button, Card, Chip, Input, Row, Screen, Text, t } from "@/ui";

const TYPES = Object.entries(BUSINESS_TYPE_LABELS) as [BusinessType, string][];

function Stepper({ label, value, onChange, max = 20, hint }: { label: string; value: number; onChange: (v: number) => void; max?: number; hint?: string }) {
  return (
    <Row between style={{ paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Row gap={12}>
        <Pressable onPress={() => onChange(Math.max(0, value - 1))} style={styles.step} accessibilityLabel={`Decrease ${label}`}>
          <Ionicons name="remove" size={18} color={t.colors.ink} />
        </Pressable>
        <Text variant="h3" style={{ minWidth: 24, textAlign: "center" }}>
          {value}
        </Text>
        <Pressable onPress={() => onChange(Math.min(max, value + 1))} style={[styles.step, styles.stepPrimary]} accessibilityLabel={`Increase ${label}`}>
          <Ionicons name="add" size={18} color="#fff" />
        </Pressable>
      </Row>
    </Row>
  );
}

/** C3 — Business profile: owner, business, first outlet, current stock */
export default function ProfileSetup() {
  const router = useRouter();
  const { user, updateUser, setOnboarding } = useSession();
  const save = useSaveProfile();
  const [ownerName, setOwnerName] = useState(user?.name ?? "");
  const [name, setName] = useState("");
  const [type, setType] = useState<BusinessType>("restaurant");
  const [gstin, setGstin] = useState("");
  const [fssai, setFssai] = useState("");
  const [label, setLabel] = useState("Main kitchen");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [pincode, setPincode] = useState("500013");
  const [pin, setPin] = useState<LatLng>({ lat: 17.3961, lng: 78.5211 });
  const [inUse, setInUse] = useState(2);
  const [spare, setSpare] = useState(1);
  const [perWeek, setPerWeek] = useState(3);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = async () => {
    const parsed = businessProfileSchema.safeParse({ ownerName, name, type, gstin: gstin || undefined, fssai: fssai || undefined, outlet: { label, line1, line2, pincode, lat: pin.lat, lng: pin.lng, inUse, spareFull: spare, cylindersPerWeek: perWeek } });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (e[i.path[i.path.length - 1] as string] = i.message));
      return setErrors(e);
    }
    setErrors({});
    await save.mutateAsync({ id: user!.id, body: parsed.data });
    updateUser({ name: ownerName });
    setOnboarding("connection");
    router.replace("/(onboarding)/connection");
  };

  return (
    <Screen title="Set up your business" subtitle="Step 1 of 2" keyboard footer={<Button title="Continue" size="lg" onPress={submit} loading={save.isPending} iconRight="arrow-forward" />}>
      <View style={{ gap: 16, marginTop: 8 }}>
        <Input label="Your name" value={ownerName} onChangeText={setOwnerName} placeholder="e.g. Imran Khan" error={errors.ownerName} autoFocus />
        <Input label="Business name" value={name} onChangeText={setName} placeholder="e.g. Al-Madina Tiffin Centre" error={errors.name} />
        <View style={{ gap: 8 }}>
          <Text variant="caption" tone="muted">
            Type of business
          </Text>
          <Row gap={8} style={{ flexWrap: "wrap" }}>
            {TYPES.map(([k, l]) => (
              <Chip key={k} label={l} active={type === k} onPress={() => setType(k)} />
            ))}
          </Row>
        </View>
        <Row gap={10} center={false}>
          <View style={{ flex: 1 }}>
            <Input label="GSTIN (optional)" value={gstin} onChangeText={(v) => setGstin(v.toUpperCase())} placeholder="36AAAAA0000A1Z5" autoCapitalize="characters" hint="For GST invoices" />
          </View>
          <View style={{ flex: 1 }}>
            <Input label="FSSAI (optional)" value={fssai} onChangeText={(v) => setFssai(v.replace(/\D/g, "").slice(0, 14))} placeholder="14 digits" keyboardType="number-pad" />
          </View>
        </Row>

        <Card>
          <Text variant="h3">First outlet</Text>
          <Text variant="caption" tone="muted" style={{ marginBottom: 12 }}>
            You can add more outlets later from Profile.
          </Text>
          <View style={{ gap: 12 }}>
            <Input label="Outlet name" value={label} onChangeText={setLabel} placeholder="Main kitchen" error={errors.label} />
            <MapPicker value={pin} onChange={setPin} height={180} />
            <Input label="Address" value={line1} onChangeText={setLine1} placeholder="3-5-1093, Nallakunta Main Road" error={errors.line1} />
            <Input label="Area / landmark" value={line2} onChangeText={setLine2} placeholder="Amberpet" />
            <Input label="Pincode" value={pincode} onChangeText={(v) => setPincode(v.replace(/\D/g, "").slice(0, 6))} keyboardType="number-pad" error={errors.pincode} hint="Demo city: Hyderabad (5xxxxx)" />
          </View>
        </Card>

        <Card>
          <Text variant="h3">Current LPG stock</Text>
          <Text variant="caption" tone="muted" style={{ marginBottom: 6 }}>
            Helps us warn you before you run out.
          </Text>
          <Stepper label="Cylinders connected / in use" value={inUse} onChange={setInUse} />
          <Stepper label="Spare full cylinders" value={spare} onChange={setSpare} />
          <Stepper label="Cylinders used per week" value={perWeek} onChange={setPerWeek} max={60} hint="Rough is fine — we learn from deliveries" />
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.colors.border },
  stepPrimary: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
});
