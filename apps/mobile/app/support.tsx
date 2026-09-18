import { Ionicons } from "@expo/vector-icons";
import { complaintSchema, formatDateShort, type ComplaintCategory } from "@gassetu/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { keys, useComplaints, useMyBookings, useUserId } from "@/features/hooks";
import { post } from "@/lib/api";
import { Badge, Button, Card, Chip, EmptyState, Input, Row, Screen, Sheet, SkeletonList, Text, t } from "@/ui";

const FAQ = [
  { q: "When will my cylinders arrive?", a: "Pick 'Before opening' for a 6–9 AM delivery the next day, or Express for delivery within 3 hours. Standard is any time the next working day." },
  { q: "How does credit work?", a: "Once GasSetu verifies your business, you get a credit limit and net-15 or net-30 terms. Each delivery raises an invoice; pay invoices from Billing and get one consolidated monthly statement." },
  { q: "What is the delivery OTP?", a: "A 4-digit code shown in the app for each order. Your outlet manager shares it with the delivery partner on arrival." },
  { q: "What about empty cylinders?", a: "Tell us how many empties to collect when ordering; the partner picks them up on the same trip and they're credited back to your agency account." },
  { q: "Do I get GST invoices?", a: "Yes — add your GSTIN in Profile and every invoice carries it with CGST/SGST split, so you can claim input credit." },
  { q: "Can I order for more than one outlet?", a: "Yes. Add outlets from Profile → Outlets. Each outlet has its own stock estimate and can have its own standing order." },
];
const CATS: { key: ComplaintCategory; label: string }[] = [
  { key: "delivery_delay", label: "Delivery delay" },
  { key: "short_supply", label: "Short supply" },
  { key: "leak", label: "Leak / safety" },
  { key: "staff_behaviour", label: "Staff behaviour" },
  { key: "billing", label: "Billing / invoice" },
  { key: "other", label: "Other" },
];
const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  open: { bg: t.colors.infoSoft, fg: t.colors.info },
  in_progress: { bg: t.colors.warningSoft, fg: "#9C7328" },
  resolved: { bg: t.colors.successSoft, fg: t.colors.success },
  escalated: { bg: t.colors.dangerSoft, fg: t.colors.danger },
};
const SAFETY = [
  "Store cylinders upright in a ventilated, locked cage away from the cooking line and heat sources.",
  "Close all regulators at the end of service; assign one person to check before locking up.",
  "Replace ISI-marked hoses every 2 years and get a fitter to inspect manifolds every 6 months.",
  "If you smell gas: no switches, no flames, open doors, close cylinder valves, clear the kitchen and call 1906.",
];

/** C15 — Support: FAQ, complaints, emergency */
export default function SupportScreen() {
  const params = useLocalSearchParams<{ tab?: string; bookingId?: string }>();
  const userId = useUserId();
  const qc = useQueryClient();
  const complaints = useComplaints();
  const bookings = useMyBookings();
  const [tab, setTab] = useState<"help" | "complaints" | "safety">(params.tab === "safety" ? "safety" : params.bookingId ? "complaints" : "help");
  const [open, setOpen] = useState(!!params.bookingId);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [category, setCategory] = useState<ComplaintCategory>("delivery_delay");
  const [text, setText] = useState("");
  const [bookingId, setBookingId] = useState<string | undefined>(params.bookingId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const parsed = complaintSchema.safeParse({ category, text, bookingId });
    if (!parsed.success) return setError("Please describe the issue in a few words (min 5 characters).");
    setBusy(true);
    try {
      await post(`/businesses/${userId}/complaints`, parsed.data);
      qc.invalidateQueries({ queryKey: keys.complaints(userId) });
      setOpen(false);
      setText("");
      setTab("complaints");
      toast.success("Complaint registered", "We usually respond within 4 hours.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Support" back>
      <Card style={{ backgroundColor: t.colors.dangerSoft, borderColor: "#D9B4B4" }} onPress={() => Linking.openURL("tel:1906")}>
        <Row gap={12}>
          <View style={styles.sos}>
            <Ionicons name="warning" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" style={{ color: "#620A1A" }}>
              Gas leak emergency? Call 1906
            </Text>
            <Text variant="caption" style={{ color: "#620A1A" }}>
              24×7 LPG emergency helpline. Don't switch on lights or fans.
            </Text>
          </View>
          <Ionicons name="call" size={20} color="#620A1A" />
        </Row>
      </Card>

      <Row gap={8} style={{ marginVertical: 14 }}>
        <Chip label="FAQ" active={tab === "help"} onPress={() => setTab("help")} />
        <Chip label="My complaints" active={tab === "complaints"} onPress={() => setTab("complaints")} />
        <Chip label="Safety tips" active={tab === "safety"} onPress={() => setTab("safety")} />
      </Row>

      {tab === "help" ? (
        <View style={{ gap: 8 }}>
          {FAQ.map((f, i) => (
            <Pressable key={i} onPress={() => setOpenFaq(openFaq === i ? null : i)} style={styles.faq} accessibilityRole="button" accessibilityState={{ expanded: openFaq === i }}>
              <Row between>
                <Text variant="bodyStrong" style={{ flex: 1 }}>
                  {f.q}
                </Text>
                <Ionicons name={openFaq === i ? "chevron-up" : "chevron-down"} size={18} color={t.colors.inkMuted} />
              </Row>
              {openFaq === i ? (
                <Text variant="small" tone="muted" style={{ marginTop: 8 }}>
                  {f.a}
                </Text>
              ) : null}
            </Pressable>
          ))}
          <Button title="Raise a complaint" icon="create-outline" variant="secondary" onPress={() => setOpen(true)} style={{ marginTop: 8 }} />
        </View>
      ) : null}

      {tab === "complaints" ? (
        <View style={{ gap: 10 }}>
          <Button title="New complaint" icon="add" onPress={() => setOpen(true)} />
          {complaints.isLoading ? (
            <SkeletonList count={2} />
          ) : (complaints.data ?? []).length === 0 ? (
            <EmptyState icon="happy-outline" title="No complaints" body="Hopefully it stays that way. Raise one if something goes wrong." />
          ) : (
            (complaints.data as any[]).map((c) => {
              const sc = STATUS_COLORS[c.status];
              return (
                <Card key={c.id}>
                  <Row between>
                    <Text variant="bodyStrong">{CATS.find((x) => x.key === c.category)?.label}</Text>
                    <Badge label={c.status.replace("_", " ")} bg={sc.bg} fg={sc.fg} dot />
                  </Row>
                  <Text variant="small" tone="muted" style={{ marginTop: 4 }}>
                    {c.text}
                  </Text>
                  <Text variant="caption" tone="faint" style={{ marginTop: 6 }}>
                    {c.id.toUpperCase()} · {formatDateShort(c.createdAt)}
                    {c.bookingCode ? ` · ${c.bookingCode}` : ""}
                  </Text>
                </Card>
              );
            })
          )}
        </View>
      ) : null}

      {tab === "safety" ? (
        <View style={{ gap: 8 }}>
          {SAFETY.map((s, i) => (
            <Card key={i}>
              <Row gap={12} center={false}>
                <View style={styles.num}>
                  <Text variant="caption" style={{ color: t.colors.primaryDark }}>
                    {i + 1}
                  </Text>
                </View>
                <Text variant="small" style={{ flex: 1 }}>
                  {s}
                </Text>
              </Row>
            </Card>
          ))}
        </View>
      ) : null}

      <Sheet open={open} onClose={() => setOpen(false)} title="Raise a complaint">
        <Text variant="caption" tone="muted" style={{ marginBottom: 8 }}>
          Category
        </Text>
        <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {CATS.map((c) => (
            <Chip key={c.key} label={c.label} active={category === c.key} onPress={() => setCategory(c.key)} />
          ))}
        </Row>
        <Text variant="caption" tone="muted" style={{ marginBottom: 8 }}>
          Related order (optional)
        </Text>
        <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 12 }}>
          <Chip label="None" active={!bookingId} onPress={() => setBookingId(undefined)} />
          {(bookings.data ?? []).slice(0, 4).map((b) => (
            <Chip key={b.id} label={b.code} active={bookingId === b.id} onPress={() => setBookingId(b.id)} />
          ))}
        </Row>
        <Input label="What happened?" value={text} onChangeText={setText} placeholder="Describe the issue…" multiline numberOfLines={3} style={{ minHeight: 80, textAlignVertical: "top" }} error={error} />
        <Button title="Submit complaint" onPress={submit} loading={busy} style={{ marginTop: 14 }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sos: { width: 44, height: 44, borderRadius: 14, backgroundColor: t.colors.danger, alignItems: "center", justifyContent: "center" },
  faq: { backgroundColor: t.colors.surface, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  num: { width: 26, height: 26, borderRadius: 13, backgroundColor: t.colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
