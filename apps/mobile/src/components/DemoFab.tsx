import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { forceRemote, get, getMode, onModeChange, post } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Chip, Row, Sheet, Text, shadowStrong, t } from "@/ui";
import { toast } from "./Toast";
import type { ExpandedBooking } from "@/features/hooks";

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3000";

/** Floating "Demo" button (PRD §6.5). */
export function DemoFab() {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [mode, setMode] = useState(getMode());
  const [speed, setSpeed] = useState(1);
  const session = useSession();
  const qc = useQueryClient();
  const router = useRouter();
  useEffect(() => {
    const off = onModeChange(setMode);
    return () => {
      off();
    };
  }, []);

  const userId = session.user?.id;
  const demoState = useQuery({ queryKey: ["demo-state"], queryFn: () => get("/demo/state"), enabled: open });
  const setBypass = async (enabled: boolean) => {
    await run("bypass", () => post("/demo/bypass-rules", { enabled }), enabled ? "Refill rules bypassed — book freely" : "Refill rules back on");
    qc.invalidateQueries({ queryKey: ["demo-state"] });
    qc.invalidateQueries({ queryKey: ["quote"] });
  };
  const activeQ = useQuery({
    queryKey: ["demo-active", userId, session.mode],
    queryFn: async (): Promise<ExpandedBooking | null> => {
      if (!userId) return null;
      if (session.mode === "delivery") {
        const me = await get(`/me/${userId}`);
        const drops = await get(`/staff/${me.profile.id}/drops`);
        return drops.pending[0] ?? null;
      }
      const list = await get<ExpandedBooking[]>(`/bookings?businessId=${userId}`);
      return list.find((b) => !["DELIVERED", "REJECTED", "CANCELLED"].includes(b.status)) ?? null;
    },
    enabled: open && !!userId,
  });

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
      qc.invalidateQueries();
    } catch (e) {
      toast.error("Demo action failed", (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const switchPersona = async (phone: string) => {
    await run("persona", async () => {
      const r = await post("/auth/verify", { phone, otp: "123456" });
      const hasAgency = !!r.profile?.assignedAgencyId;
      session.login(r.token, r.user, { hasProfile: !!r.profile, hasAgency });
      setOpen(false);
      router.replace(r.user.role === "delivery" ? "/(delivery)/home" : "/(business)/home");
    }, undefined);
  };

  const active = activeQ.data;

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Open demo controls" style={[styles.fab, shadowStrong, { top: insets.top + 420 }]}>
        <Ionicons name="flask" size={16} color="#fff" />
        <Text variant="caption" style={{ color: "#fff", fontSize: 10 }}>
          Demo
        </Text>
      </Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title="Demo controls">
        <Row between style={{ marginBottom: 12 }}>
          <Text variant="small" tone="muted">
            Data source
          </Text>
          <Row gap={6}>
            <View style={[styles.dot, { backgroundColor: mode === "remote" ? t.colors.success : t.colors.warning }]} />
            <Text variant="caption">{mode === "remote" ? "Live mock API" : "Offline (bundled engine)"}</Text>
            {mode === "local" ? (
              <Pressable
                onPress={() => {
                  forceRemote();
                  qc.invalidateQueries();
                  toast.info("Retrying live API", "Falls back to offline again if it's unreachable.");
                }}
                accessibilityRole="button"
              >
                <Text variant="caption" tone="primary">
                  · Retry live
                </Text>
              </Pressable>
            ) : null}
          </Row>
        </Row>

        <Text variant="label" tone="faint" style={{ marginBottom: 8 }}>
          Switch persona
        </Text>
        <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 16 }}>
          <Chip label="Imran · tiffin centre" icon="restaurant" active={session.user?.phone === "9000000001"} onPress={() => switchPersona("9000000001")} />
          <Chip label="Fatima · cloud kitchen" icon="storefront" active={session.user?.phone === "9000000002"} onPress={() => switchPersona("9000000002")} />
          <Chip label="Ramesh · delivery" icon="bicycle" active={session.user?.phone === "9000000003"} onPress={() => switchPersona("9000000003")} />
          <Chip label="Agency panel ↗" icon="desktop-outline" onPress={() => Linking.openURL(`${WEB_URL}/agency`)} />
          <Chip label="Admin ↗" icon="shield-checkmark-outline" onPress={() => Linking.openURL(`${WEB_URL}/admin`)} />
        </Row>

        <Text variant="label" tone="faint" style={{ marginBottom: 8 }}>
          Current order
        </Text>
        {active ? (
          <Row between style={{ marginBottom: 8 }}>
            <View>
              <Text variant="bodyStrong">{active.code}</Text>
              <Text variant="caption" tone="muted">
                {active.status.replace(/_/g, " ")}
              </Text>
            </View>
            <Button title="Advance ▸" size="sm" full={false} loading={busy === "advance"} onPress={() => run("advance", () => post(`/demo/advance/${active.id}`), "Order advanced")} />
          </Row>
        ) : (
          <Text variant="small" tone="muted" style={{ marginBottom: 8 }}>
            {session.mode === "delivery" ? "Use the drop list to progress deliveries." : "No open order for this business."}
          </Text>
        )}

        <Text variant="label" tone="faint" style={{ marginTop: 8, marginBottom: 8 }}>
          Simulate
        </Text>
        <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 16 }}>
          <Chip label="Payment failure" icon="card-outline" onPress={() => run("sim", () => post("/demo/simulate", { kind: "payment_failure" }).then((r: any) => toast.info(r.message)))} />
          <Chip label="Delivery failure" icon="alert-circle-outline" onPress={() => run("sim", () => post("/demo/simulate", { kind: "delivery_failure" }).then((r: any) => toast.info(r.message)))} />
          <Chip label="Low stock" icon="cube-outline" onPress={() => run("sim", () => post("/demo/simulate", { kind: "low_stock" }).then((r: any) => toast.info(r.message)))} />
          <Chip label="Order burst" icon="flash-outline" onPress={() => run("sim", () => post("/demo/simulate", { kind: "order_burst" }).then((r: any) => toast.info(r.message)))} />
          <Chip label="Overdue invoice" icon="receipt-outline" onPress={() => run("sim", () => post("/demo/simulate", { kind: "overdue_invoice" }).then((r: any) => toast.info(r.message)))} />
        </Row>

        <Row between style={{ marginBottom: 16, backgroundColor: t.colors.goldSoft, padding: 12, borderRadius: 14 }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text variant="bodyStrong">Bypass order rules</Text>
            <Text variant="caption" tone="muted">
              Skips the credit-limit, overdue and quantity-cap checks so a persona can keep ordering during the pitch.
            </Text>
          </View>
          <Switch value={!!demoState.data?.bypassRules} onValueChange={setBypass} trackColor={{ true: t.colors.gold }} accessibilityLabel="Bypass order rules" />
        </Row>

        <Text variant="label" tone="faint" style={{ marginBottom: 8 }}>
          Tracking speed
        </Text>
        <Row gap={8} style={{ marginBottom: 16 }}>
          {[1, 3, 6].map((s) => (
            <Chip key={s} label={`${s}×`} active={speed === s} onPress={() => run("speed", () => post("/demo/speed", { speed: s }).then(() => setSpeed(s)))} />
          ))}
        </Row>

        <Button title="Reset demo data" variant="danger" icon="refresh" loading={busy === "reset"} onPress={() => run("reset", () => post("/demo/reset"), "Demo data reset to seed")} />
        <Text variant="caption" tone="faint" center style={{ marginTop: 10 }}>
          Logins: 9000000001 (Imran) · 9000000002 (Fatima) · 9000000003 (Ramesh) · OTP 123456
        </Text>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  fab: { position: "absolute", right: 0, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: t.colors.navy, width: 44, height: 52, borderTopLeftRadius: 14, borderBottomLeftRadius: 14, zIndex: 900, opacity: 0.92 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
