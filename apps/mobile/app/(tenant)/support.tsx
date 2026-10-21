import { Ionicons } from "@expo/vector-icons";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { toast } from "@/components/Toast";
import { createTenantSupportCase, loadTenantSupportCases, type TenantSupportCase } from "@/lib/platform-api";
import { useSession } from "@/lib/session";
import { Badge, Button, Card, Chip, EmptyState, ErrorState, Input, Row, Screen, Sheet, SkeletonList, Text, t } from "@/ui";

const categories = [
  ["ordering", "Ordering"], ["delivery", "Delivery"], ["billing", "Billing"], ["credit", "Credit"],
  ["agency", "Agency"], ["technical", "Technical"], ["other", "Other"],
] as const;
const changeFields = [
  ["business_name", "Business name"], ["gstin_fssai", "GSTIN / FSSAI"], ["registered_phone", "Registered phone"],
  ["outlet_address", "Outlet address"], ["serving_agency", "Serving agency"],
] as const;
const faq = [
  ["Who sets our prices?", "Your serving agency publishes base and slab prices and may set a negotiated account price. The server confirms the final price before every order."],
  ["How does credit work?", "Platform administrators alone approve limits and net terms. Credit ordering also depends on the agency credit policy, available limit, and overdue invoices."],
  ["Can I change GSTIN or agency here?", "Controlled registration details use an auditable change request. The platform team reviews the request before changing your account."],
  ["Where are payment updates shown?", "Payments recorded by your agency appear against invoices in Billing. The oldest outstanding invoice is settled first."],
];

type Category = "ordering" | "delivery" | "billing" | "credit" | "agency" | "technical" | "other";
type ChangeField = "business_name" | "gstin_fssai" | "registered_phone" | "outlet_address" | "serving_agency";

function shortDate(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function statusTone(status: TenantSupportCase["status"]): { bg: string; fg: string } {
  if (status === "resolved" || status === "closed") return { bg: t.colors.successSoft, fg: t.colors.success };
  if (status === "in_progress" || status === "acknowledged") return { bg: t.colors.warningSoft, fg: "#9C7328" };
  return { bg: t.colors.infoSoft, fg: t.colors.info };
}

export default function TenantSupportScreen() {
  const params = useLocalSearchParams<{ kind?: string; field?: string; orderPublicId?: string }>();
  const sessionKind = useSession((state) => state.sessionKind);
  const tenantPublicId = useSession((state) => state.activeTenantPublicId);
  const [cases, setCases] = useState<TenantSupportCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(params.kind === "change_request" || !!params.orderPublicId);
  const [kind, setKind] = useState<"support" | "change_request">(params.kind === "change_request" ? "change_request" : "support");
  const [category, setCategory] = useState<Category>(params.orderPublicId ? "delivery" : "ordering");
  const [priority, setPriority] = useState<"low" | "normal" | "high">("normal");
  const [field, setField] = useState<ChangeField | null>(changeFields.some(([value]) => value === params.field) ? params.field as ChangeField : null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantPublicId) return;
    setLoading(true); setError(null);
    try { setCases((await loadTenantSupportCases(tenantPublicId)).cases); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Support cases could not be loaded."); }
    finally { setLoading(false); }
  }, [tenantPublicId]);
  useEffect(() => { void refresh(); }, [refresh]);

  if (sessionKind !== "tenant") return <Redirect href="/" />;
  if (!tenantPublicId) return <Redirect href="/(auth)/select-tenant" />;

  const openForm = (nextKind: "support" | "change_request") => {
    setKind(nextKind); setFormError(null); setFormOpen(true);
  };
  const submit = async () => {
    if (!tenantPublicId) return;
    if (kind === "change_request" && !field) return setFormError("Choose the registered field you want reviewed.");
    if (subject.trim().length < 3 || description.trim().length < 5) return setFormError("Add a short subject and enough detail for the team to act.");
    setBusy(true); setFormError(null);
    try {
      const result = await createTenantSupportCase(tenantPublicId, {
        kind, subject: subject.trim(), description: description.trim(),
        ...(kind === "support" ? { category, priority } : { changeField: field! }),
        ...(params.orderPublicId ? { orderPublicId: params.orderPublicId } : {}),
      });
      setFormOpen(false); setSubject(""); setDescription(""); setField(null);
      toast.success(kind === "change_request" ? "Change request submitted" : "Support case created", `${result.case.caseNumber} is now in the queue.`);
      await refresh();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "The request could not be submitted."); }
    finally { setBusy(false); }
  };

  return (
    <Screen title="Support & safety" subtitle="Audited help for your business" back refreshing={loading} onRefresh={() => { void refresh(); }}>
      <Card style={{ backgroundColor: t.colors.dangerSoft, borderColor: "#D9B4B4" }} onPress={() => { void Linking.openURL("tel:1906"); }}>
        <Row gap={12}>
          <View style={styles.emergency}><Ionicons name="warning" size={22} color="#fff" /></View>
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong" style={{ color: "#620A1A" }}>Gas leak emergency? Call 1906</Text>
            <Text variant="caption" style={{ color: "#620A1A" }}>Do not operate switches. Close valves, ventilate, and clear the area.</Text>
          </View>
          <Ionicons name="call" size={20} color="#620A1A" />
        </Row>
      </Card>

      <Row gap={8} style={{ marginTop: 14 }}>
        <View style={{ flex: 1 }}><Button title="Get support" icon="help-buoy-outline" onPress={() => openForm("support")} /></View>
        <View style={{ flex: 1 }}><Button title="Request change" icon="create-outline" variant="secondary" onPress={() => openForm("change_request")} /></View>
      </Row>

      <Text variant="h3" style={{ marginTop: 22, marginBottom: 9 }}>My cases</Text>
      {loading && !cases.length ? <SkeletonList count={2} /> : null}
      {error && !cases.length ? <ErrorState message={error} onRetry={() => { void refresh(); }} /> : null}
      {!loading && !cases.length ? <EmptyState icon="checkmark-circle-outline" title="No support cases" body="New requests and their progress will appear here." /> : null}
      <View style={{ gap: 9 }}>
        {cases.map((item) => {
          const tone = statusTone(item.status);
          return (
            <Card key={item.publicId}>
              <Row between center={false}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text variant="bodyStrong">{item.subject}</Text>
                  <Text variant="caption" tone="muted">{item.caseNumber} · {item.category.replaceAll("_", " ")}</Text>
                </View>
                <Badge label={item.status.replaceAll("_", " ")} bg={tone.bg} fg={tone.fg} dot />
              </Row>
              <Text variant="small" tone="muted" style={{ marginTop: 8 }}>{item.description.split("\n").at(-1)}</Text>
              <Text variant="caption" tone="faint" style={{ marginTop: 7 }}>Opened {shortDate(item.createdAt)} · Response due {shortDate(item.responseDueAt)}</Text>
              {item.resolution ? <Text variant="small" tone="success" style={{ marginTop: 7 }}>Resolution: {item.resolution}</Text> : null}
            </Card>
          );
        })}
      </View>

      <Text variant="h3" style={{ marginTop: 24, marginBottom: 9 }}>Common questions</Text>
      <View style={{ gap: 8 }}>
        {faq.map(([question, answer], index) => (
          <Pressable key={question} onPress={() => setOpenFaq(openFaq === index ? null : index)} style={styles.faq} accessibilityRole="button" accessibilityState={{ expanded: openFaq === index }}>
            <Row between><Text variant="bodyStrong" style={{ flex: 1 }}>{question}</Text><Ionicons name={openFaq === index ? "chevron-up" : "chevron-down"} size={18} color={t.colors.inkMuted} /></Row>
            {openFaq === index ? <Text variant="small" tone="muted" style={{ marginTop: 8 }}>{answer}</Text> : null}
          </Pressable>
        ))}
      </View>
      {error && cases.length ? <Text variant="small" tone="danger" style={{ marginTop: 12 }}>{error}</Text> : null}

      <Sheet open={formOpen} onClose={() => setFormOpen(false)} title={kind === "change_request" ? "Request a registered-detail change" : "Create support case"} dismissable={!busy}>
        <View style={{ gap: 12, paddingBottom: 8 }}>
          {kind === "support" ? (
            <>
              <Text variant="caption" tone="muted">Category</Text>
              <Row gap={6} style={{ flexWrap: "wrap" }}>{categories.map(([value, label]) => <Chip key={value} label={label} active={category === value} onPress={() => setCategory(value)} />)}</Row>
              <Text variant="caption" tone="muted">Priority</Text>
              <Row gap={6}>{(["low", "normal", "high"] as const).map((value) => <Chip key={value} label={value[0]!.toUpperCase() + value.slice(1)} active={priority === value} onPress={() => setPriority(value)} />)}</Row>
            </>
          ) : (
            <>
              <Text variant="small" tone="muted">Controlled fields are reviewed by the platform team; this request does not change your live account immediately.</Text>
              <Row gap={6} style={{ flexWrap: "wrap" }}>{changeFields.map(([value, label]) => <Chip key={value} label={label} active={field === value} onPress={() => setField(value)} />)}</Row>
            </>
          )}
          {params.orderPublicId ? <Text variant="caption" tone="primary">This case will be linked to order {params.orderPublicId.slice(0, 8)}.</Text> : null}
          <Input label="Subject" value={subject} onChangeText={setSubject} placeholder={kind === "change_request" ? "What should be reviewed?" : "What do you need help with?"} />
          <Input label="Details" value={description} onChangeText={setDescription} placeholder="Include the facts the team needs to investigate" multiline numberOfLines={4} style={{ minHeight: 92, textAlignVertical: "top" }} />
          {formError ? <Text variant="small" tone="danger">{formError}</Text> : null}
          <Button title={kind === "change_request" ? "Submit change request" : "Create case"} loading={busy} onPress={() => { void submit(); }} />
        </View>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  emergency: { width: 44, height: 44, borderRadius: 14, backgroundColor: t.colors.danger, alignItems: "center", justifyContent: "center" },
  faq: { backgroundColor: t.colors.surface, borderRadius: 16, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
});
