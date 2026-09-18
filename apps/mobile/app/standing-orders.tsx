import { Ionicons } from "@expo/vector-icons";
import { SLOT_LABELS, WEEKDAY_SHORT, formatDateShort, type PaymentMethod, type SlotType, type StandingOrder } from "@gassetu/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Switch, View } from "react-native";
import { toast } from "@/components/Toast";
import { keys, useBusiness, useDeleteStandingOrder, useSaveStandingOrder, useUserId } from "@/features/hooks";
import { post } from "@/lib/api";
import { Button, Card, Chip, EmptyState, Row, Screen, Sheet, SkeletonList, Text, t } from "@/ui";

const SLOTS: SlotType[] = ["tomorrow_morning", "standard", "tomorrow_evening"];
const METHODS: { key: PaymentMethod; label: string }[] = [
  { key: "credit", label: "Credit" },
  { key: "upi", label: "UPI (saved)" },
  { key: "cod", label: "Cash" },
];

/** C13 → Standing orders: auto-order fixed quantities on fixed weekdays */
export default function StandingOrdersScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const userId = useUserId();
  const biz = useBusiness();
  const save = useSaveStandingOrder();
  const remove = useDeleteStandingOrder();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Partial<StandingOrder> & { q19?: number; q47?: number }>({});
  const [running, setRunning] = useState<string | null>(null);
  const b = biz.data;
  const creditOk = b?.credit.status === "approved";

  const startNew = () => {
    setEdit({ outletId: b?.defaultOutletId, days: [2, 5], slot: "tomorrow_morning", paymentMethod: creditOk ? "credit" : "upi", q19: b?.usualOrder.find((i) => i.cylinderTypeId === "cyl_19")?.qty ?? 2, q47: b?.usualOrder.find((i) => i.cylinderTypeId === "cyl_47")?.qty ?? 0, active: true });
    setOpen(true);
  };
  const startEdit = (so: StandingOrder) => {
    setEdit({ ...so, q19: so.items.find((i) => i.cylinderTypeId === "cyl_19")?.qty ?? 0, q47: so.items.find((i) => i.cylinderTypeId === "cyl_47")?.qty ?? 0 });
    setOpen(true);
  };
  const submit = async () => {
    const items = [{ cylinderTypeId: "cyl_19", qty: edit.q19 ?? 0 }, { cylinderTypeId: "cyl_47", qty: edit.q47 ?? 0 }].filter((i) => i.qty > 0);
    if (!items.length) return toast.error("Add at least one cylinder");
    if (!edit.days?.length) return toast.error("Pick at least one day");
    try {
      await save.mutateAsync({ id: edit.id, outletId: edit.outletId, items, days: edit.days, slot: edit.slot, paymentMethod: edit.paymentMethod, active: edit.active ?? true });
      setOpen(false);
      toast.success(edit.id ? "Standing order updated" : "Standing order set", "We'll place it automatically at 7 AM on the day before each delivery.");
    } catch (e) {
      toast.error("Couldn't save", (e as Error).message);
    }
  };
  const toggle = (so: StandingOrder, active: boolean) => save.mutateAsync({ ...so, active }).then(() => toast.info(active ? "Standing order resumed" : "Standing order paused")).catch((e) => toast.error("Couldn't update", e.message));
  const runNow = async (so: StandingOrder) => {
    setRunning(so.id);
    try {
      const bk = await post(`/businesses/${userId}/standing-orders/${so.id}/run`);
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: keys.business(userId) });
      toast.success("Order placed", `${bk.code} created from your standing order.`);
      router.push(`/order/${bk.id}`);
    } catch (e) {
      toast.error("Couldn't place", (e as Error).message);
    } finally {
      setRunning(null);
    }
  };

  const Stepper = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <Row between style={{ paddingVertical: 6 }}>
      <Text variant="bodyStrong">{label}</Text>
      <Row gap={12}>
        <Pressable onPress={() => onChange(Math.max(0, value - 1))} style={styles.step} accessibilityLabel={`Fewer ${label}`}>
          <Ionicons name="remove" size={18} color={t.colors.ink} />
        </Pressable>
        <Text variant="h3" style={{ minWidth: 24, textAlign: "center" }}>
          {value}
        </Text>
        <Pressable onPress={() => onChange(Math.min(20, value + 1))} style={[styles.step, styles.stepPrimary]} accessibilityLabel={`More ${label}`}>
          <Ionicons name="add" size={18} color="#fff" />
        </Pressable>
      </Row>
    </Row>
  );

  return (
    <Screen title="Standing orders" subtitle="Never run out before service" back footer={<Button title="New standing order" icon="add" onPress={startNew} />}>
      {biz.isLoading ? (
        <SkeletonList count={2} />
      ) : !b || b.standingOrders.length === 0 ? (
        <EmptyState icon="calendar-outline" title="No standing orders" body="Set your usual quantity and the days you want it delivered — before opening, like clockwork." action="Set one up" onAction={startNew} />
      ) : (
        <View style={{ gap: 12 }}>
          {b.standingOrders.map((so) => {
            const outlet = b.outlets.find((o) => o.id === so.outletId);
            return (
              <Card key={so.id}>
                <Row between>
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{so.items.map((i) => `${i.qty} × ${i.cylinderTypeId === "cyl_19" ? "19 kg" : "47.5 kg"}`).join(" + ")}</Text>
                    <Text variant="small" tone="muted">
                      {so.days.map((d) => WEEKDAY_SHORT[d]).join(", ")} · {SLOT_LABELS[so.slot]}
                    </Text>
                    <Text variant="caption" tone="muted">
                      {outlet?.label} · {so.paymentMethod === "credit" ? "on credit" : so.paymentMethod} · {so.active ? `next ${so.nextRunAt ? formatDateShort(so.nextRunAt) : "—"}` : "paused"}
                    </Text>
                  </View>
                  <Switch value={so.active} onValueChange={(v) => toggle(so, v)} trackColor={{ true: t.colors.gold }} accessibilityLabel="Active" />
                </Row>
                <Row gap={8} style={{ marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Button title="Edit" size="sm" variant="ghost" icon="create-outline" onPress={() => startEdit(so)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Run now (demo)" size="sm" variant="secondary" icon="play-outline" loading={running === so.id} onPress={() => runNow(so)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button title="Delete" size="sm" variant="ghost" icon="trash-outline" loading={remove.isPending} onPress={() => remove.mutateAsync(so.id).then(() => toast.info("Standing order deleted"))} />
                  </View>
                </Row>
              </Card>
            );
          })}
          <Text variant="caption" tone="faint" center>
            "Run now" places the order immediately — what the scheduler does at 7 AM on its day.
          </Text>
        </View>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} title={edit.id ? "Edit standing order" : "New standing order"}>
        <View style={{ gap: 12 }}>
          {b && b.outlets.length > 1 ? (
            <View>
              <Text variant="caption" tone="muted" style={{ marginBottom: 8 }}>
                Outlet
              </Text>
              <Row gap={8} style={{ flexWrap: "wrap" }}>
                {b.outlets.map((o) => (
                  <Chip key={o.id} label={o.label} active={edit.outletId === o.id} onPress={() => setEdit({ ...edit, outletId: o.id })} />
                ))}
              </Row>
            </View>
          ) : null}
          <Stepper label="19 kg cylinders" value={edit.q19 ?? 0} onChange={(v) => setEdit({ ...edit, q19: v })} />
          <Stepper label="47.5 kg cylinders" value={edit.q47 ?? 0} onChange={(v) => setEdit({ ...edit, q47: v })} />
          <View>
            <Text variant="caption" tone="muted" style={{ marginBottom: 8 }}>
              Deliver on
            </Text>
            <Row gap={6} style={{ flexWrap: "wrap" }}>
              {WEEKDAY_SHORT.map((d, i) => (
                <Chip key={d} label={d} active={edit.days?.includes(i as any)} onPress={() => setEdit({ ...edit, days: (edit.days?.includes(i as any) ? edit.days.filter((x) => x !== i) : [...(edit.days ?? []), i as any]).sort() })} />
              ))}
            </Row>
          </View>
          <View>
            <Text variant="caption" tone="muted" style={{ marginBottom: 8 }}>
              Slot
            </Text>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              {SLOTS.map((s) => (
                <Chip key={s} label={SLOT_LABELS[s]} active={edit.slot === s} onPress={() => setEdit({ ...edit, slot: s })} />
              ))}
            </Row>
          </View>
          <View>
            <Text variant="caption" tone="muted" style={{ marginBottom: 8 }}>
              Pay with
            </Text>
            <Row gap={8} style={{ flexWrap: "wrap" }}>
              {METHODS.filter((m) => m.key !== "credit" || creditOk).map((m) => (
                <Chip key={m.key} label={m.label} active={edit.paymentMethod === m.key} onPress={() => setEdit({ ...edit, paymentMethod: m.key })} />
              ))}
            </Row>
          </View>
          <Button title={edit.id ? "Save changes" : "Set standing order"} onPress={submit} loading={save.isPending} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: t.colors.border },
  stepPrimary: { backgroundColor: t.colors.primary, borderColor: t.colors.primary },
});
