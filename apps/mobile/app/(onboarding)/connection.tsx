import { Ionicons } from "@expo/vector-icons";
import type { OMC } from "@gassetu/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AgencyCard } from "@/components/AgencyCard";
import { toast } from "@/components/Toast";
import { ApiError, post } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button, Input, OmcBadge, Row, Screen, Text, t } from "@/ui";

const OMCS: { key: OMC; label: string }[] = [
  { key: "HP", label: "HP Gas" },
  { key: "IOCL", label: "Indane" },
  { key: "BPCL", label: "Bharat Gas" },
];

/** C4 — Link an existing commercial LPG connection or auto-assign the nearest agency. */
export default function ConnectionScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, setOnboarding } = useSession();
  const [choice, setChoice] = useState<"link" | "new" | null>(null);
  const [omc, setOmc] = useState<OMC>("HP");
  const [consumerNo, setConsumerNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      setResult(r);
      qc.invalidateQueries({ queryKey: ["business", user!.id] });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    setOnboarding("done");
    toast.success("You're all set!", `${result.agency.name} will supply your outlets.`);
    router.replace("/(business)/home");
  };

  return (
    <Screen title="Your LPG supply" subtitle="Step 2 of 2" back keyboard footer={result ? <Button title="Go to my dashboard" size="lg" onPress={finish} iconRight="arrow-forward" /> : undefined}>
      {!result ? (
        <View style={{ gap: 12, marginTop: 8 }}>
          <Pressable onPress={() => setChoice("link")} style={[styles.opt, choice === "link" && styles.optActive]} accessibilityRole="radio" accessibilityState={{ selected: choice === "link" }}>
            <View style={styles.optIcon}>
              <Ionicons name="link-outline" size={20} color={t.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">I have a commercial connection</Text>
              <Text variant="small" tone="muted">
                Link the distributor on your existing commercial connection
              </Text>
            </View>
            <Ionicons name={choice === "link" ? "radio-button-on" : "radio-button-off"} size={22} color={choice === "link" ? t.colors.primary : t.colors.inkFaint} />
          </Pressable>
          {choice === "link" ? (
            <View style={{ gap: 12, paddingHorizontal: 4 }}>
              <Text variant="caption" tone="muted">
                Oil company
              </Text>
              <Row gap={8}>
                {OMCS.map((o) => (
                  <Pressable key={o.key} onPress={() => setOmc(o.key)} accessibilityRole="radio" accessibilityState={{ selected: omc === o.key }} style={[styles.omc, omc === o.key && styles.omcActive]}>
                    <OmcBadge omc={o.key} />
                    <Text variant="small" style={{ fontWeight: "600" }}>
                      {o.label}
                    </Text>
                  </Pressable>
                ))}
              </Row>
              <Input label="Consumer no. or 17-digit LPG ID" value={consumerNo} onChangeText={(v) => setConsumerNo(v.replace(/\D/g, "").slice(0, 17))} keyboardType="number-pad" placeholder="e.g. 614302877" error={error} hint="Demo: any 6+ digit number works" />
              <Button title="Find my distributor" onPress={() => run(() => post(`/businesses/${user!.id}/connection`, { omc, consumerNo }))} loading={busy} icon="search" />
            </View>
          ) : null}

          <Pressable onPress={() => setChoice("new")} style={[styles.opt, choice === "new" && styles.optActive]} accessibilityRole="radio" accessibilityState={{ selected: choice === "new" }}>
            <View style={styles.optIcon}>
              <Ionicons name="navigate-outline" size={20} color={t.colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="bodyStrong">I don't have one yet</Text>
              <Text variant="small" tone="muted">
                Auto-assign the nearest agency that serves my outlet
              </Text>
            </View>
            <Ionicons name={choice === "new" ? "radio-button-on" : "radio-button-off"} size={22} color={choice === "new" ? t.colors.primary : t.colors.inkFaint} />
          </Pressable>
          {choice === "new" ? (
            <View style={{ paddingHorizontal: 4, gap: 8 }}>
              {error ? (
                <Text variant="caption" tone="danger">
                  {error}
                </Text>
              ) : null}
              <Button title="Find nearest agency" onPress={() => run(() => post(`/businesses/${user!.id}/assign-agency`))} loading={busy} icon="locate" />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 14, marginTop: 8 }}>
          <View style={{ alignItems: "center", gap: 6, paddingVertical: 8 }}>
            <View style={styles.check}>
              <Ionicons name="checkmark" size={28} color="#fff" />
            </View>
            <Text variant="h2">{choice === "link" ? "Connection linked" : "Agency assigned"}</Text>
            <Text variant="small" tone="muted" center>
              {choice === "link" ? `Your ${omc} commercial connection is now linked to its distributor.` : "The closest approved agency serving your outlet's pincode."}
            </Text>
          </View>
          <AgencyCard agency={result.agency} distanceKm={result.agency.distanceKm} />
          <Text variant="caption" tone="faint" center>
            Not the right agency? Request a change anytime from Profile. Credit terms are set by GasSetu once your business is verified.
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  opt: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 18, backgroundColor: t.colors.surface, borderWidth: 1.5, borderColor: t.colors.border },
  optActive: { borderColor: t.colors.primary },
  optIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.colors.primarySoft, alignItems: "center", justifyContent: "center" },
  omc: { flex: 1, alignItems: "center", gap: 6, padding: 10, borderRadius: 14, borderWidth: 1.5, borderColor: t.colors.border, backgroundColor: t.colors.surface },
  omcActive: { borderColor: t.colors.primary, backgroundColor: t.colors.primarySoft },
  check: { width: 56, height: 56, borderRadius: 28, backgroundColor: t.colors.success, alignItems: "center", justifyContent: "center" },
});
