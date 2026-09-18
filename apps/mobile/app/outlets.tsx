import { Ionicons } from "@expo/vector-icons";
import { outletSchema, type LatLng } from "@gassetu/shared";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { MapPicker } from "@/components/MapPicker";
import { StockCard } from "@/components/StockCard";
import { toast } from "@/components/Toast";
import { useAddOutlet, useBusiness, useSetDefaultOutlet, useUpdateOutlet, type ExpandedOutlet } from "@/features/hooks";
import { Badge, Button, Card, EmptyState, Input, Row, Screen, Sheet, SkeletonList, Text, t } from "@/ui";

function Stepper({ label, value, onChange, max = 30 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <Row between style={{ paddingVertical: 6 }}>
      <Text variant="bodyStrong" style={{ flex: 1 }}>
        {label}
      </Text>
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

/** Outlets — multi-location accounts: list, add, set default, adjust stock */
export default function OutletsScreen() {
  const params = useLocalSearchParams<{ focus?: string }>();
  const biz = useBusiness();
  const addOutlet = useAddOutlet();
  const updateOutlet = useUpdateOutlet();
  const setDefault = useSetDefaultOutlet();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ExpandedOutlet | null>(null);
  const [form, setForm] = useState({ label: "", line1: "", line2: "", pincode: "500013", contactName: "", contactPhone: "" });
  const [pin, setPin] = useState<LatLng>({ lat: 17.3961, lng: 78.5211 });
  const [stock, setStock] = useState({ inUse: 2, spareFull: 1, cylindersPerWeek: 3 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const b = biz.data;

  const submitAdd = async () => {
    const parsed = outletSchema.safeParse({ ...form, lat: pin.lat, lng: pin.lng, ...stock });
    if (!parsed.success) {
      const e: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (e[i.path[i.path.length - 1] as string] = i.message));
      return setErrors(e);
    }
    try {
      await addOutlet.mutateAsync({ ...parsed.data, emptiesHeld: 0 });
      setAdding(false);
      setForm({ label: "", line1: "", line2: "", pincode: "500013", contactName: "", contactPhone: "" });
      toast.success("Outlet added", "You can now order for it and set standing orders.");
    } catch (e) {
      toast.error("Couldn't add outlet", (e as Error).message);
    }
  };
  const saveStock = async () => {
    if (!editing) return;
    try {
      await updateOutlet.mutateAsync({ outletId: editing.id, patch: { inUse: stock.inUse, spareFull: stock.spareFull, cylindersPerWeek: stock.cylindersPerWeek } });
      setEditing(null);
      toast.success("Stock updated");
    } catch (e) {
      toast.error("Couldn't save", (e as Error).message);
    }
  };

  return (
    <Screen title="Outlets" subtitle={b ? `${b.outlets.length} location${b.outlets.length === 1 ? "" : "s"} on this account` : undefined} back footer={<Button title="Add outlet" icon="add" variant="secondary" onPress={() => setAdding(true)} />}>
      {biz.isLoading ? (
        <SkeletonList count={2} />
      ) : !b || b.outlets.length === 0 ? (
        <EmptyState icon="storefront-outline" title="No outlets" body="Add an outlet to order deliveries." />
      ) : (
        <View style={{ gap: 12 }}>
          {b.outlets.map((o) => (
            <View key={o.id} style={params.focus === o.id ? { borderRadius: 22, borderWidth: 2, borderColor: t.colors.gold } : undefined}>
              <StockCard outlet={o} />
              <Card padded={false} style={{ marginTop: -14, borderTopLeftRadius: 0, borderTopRightRadius: 0, paddingTop: 14 }}>
                <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
                  <Row between>
                    <Text variant="small" tone="muted" style={{ flex: 1 }}>
                      {o.line1}, {o.line2} — {o.pincode}
                      {o.contactName ? `\n${o.contactName}${o.contactPhone ? ` · ${o.contactPhone}` : ""}` : ""}
                    </Text>
                    {o.id === b.defaultOutletId ? <Badge label="Default" bg={t.colors.goldSoft} fg={t.colors.goldDark} /> : null}
                  </Row>
                  <Row gap={8}>
                    <View style={{ flex: 1 }}>
                      <Button title="Adjust stock" size="sm" variant="ghost" icon="create-outline" onPress={() => { setEditing(o); setStock({ inUse: o.inUse, spareFull: o.spareFull, cylindersPerWeek: Math.round(o.cylindersPerWeek) }); }} />
                    </View>
                    {o.id !== b.defaultOutletId ? (
                      <View style={{ flex: 1 }}>
                        <Button title="Make default" size="sm" variant="ghost" icon="star-outline" loading={setDefault.isPending} onPress={() => setDefault.mutateAsync(o.id).then(() => toast.success(`${o.label} is now the default outlet`))} />
                      </View>
                    ) : null}
                  </Row>
                </View>
              </Card>
            </View>
          ))}
        </View>
      )}

      <Sheet open={adding} onClose={() => setAdding(false)} title="Add outlet">
        <View style={{ gap: 12 }}>
          <Input label="Outlet name" value={form.label} onChangeText={(v) => setForm({ ...form, label: v })} placeholder="e.g. Kondapur branch" error={errors.label} />
          <MapPicker value={pin} onChange={setPin} height={160} />
          <Input label="Address" value={form.line1} onChangeText={(v) => setForm({ ...form, line1: v })} placeholder="Door no., street" error={errors.line1} />
          <Input label="Area" value={form.line2} onChangeText={(v) => setForm({ ...form, line2: v })} placeholder="Area / landmark" />
          <Input label="Pincode" value={form.pincode} onChangeText={(v) => setForm({ ...form, pincode: v.replace(/\D/g, "").slice(0, 6) })} keyboardType="number-pad" error={errors.pincode} />
          <Row gap={10} center={false}>
            <View style={{ flex: 1 }}>
              <Input label="Contact person" value={form.contactName} onChangeText={(v) => setForm({ ...form, contactName: v })} placeholder="Kitchen manager" />
            </View>
            <View style={{ flex: 1 }}>
              <Input label="Contact phone" value={form.contactPhone} onChangeText={(v) => setForm({ ...form, contactPhone: v.replace(/\D/g, "").slice(0, 10) })} keyboardType="number-pad" />
            </View>
          </Row>
          <Stepper label="Cylinders in use" value={stock.inUse} onChange={(v) => setStock({ ...stock, inUse: v })} />
          <Stepper label="Spare full" value={stock.spareFull} onChange={(v) => setStock({ ...stock, spareFull: v })} />
          <Stepper label="Used per week" value={stock.cylindersPerWeek} onChange={(v) => setStock({ ...stock, cylindersPerWeek: v })} max={60} />
          <Button title="Add outlet" onPress={submitAdd} loading={addOutlet.isPending} />
        </View>
      </Sheet>

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Stock at ${editing.label}` : "Stock"}>
        <Text variant="small" tone="muted" style={{ marginBottom: 8 }}>
          Corrects the "days of LPG left" estimate. Deliveries update it automatically.
        </Text>
        <Stepper label="Cylinders in use" value={stock.inUse} onChange={(v) => setStock({ ...stock, inUse: v })} />
        <Stepper label="Spare full" value={stock.spareFull} onChange={(v) => setStock({ ...stock, spareFull: v })} />
        <Stepper label="Used per week" value={stock.cylindersPerWeek} onChange={(v) => setStock({ ...stock, cylindersPerWeek: v })} max={60} />
        <Button title="Save" onPress={saveStock} loading={updateOutlet.isPending} style={{ marginTop: 10 }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.colors.border },
  stepPrimary: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
});
