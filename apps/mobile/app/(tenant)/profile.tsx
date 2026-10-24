import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, View } from "react-native";
import { toast } from "@/components/Toast";
import { PRIVACY_POLICY_URL } from "@/lib/config";
import {
  loadTenantDocuments,
  loadTenantProfile,
  updateTenantOutlet,
  type TenantBusinessDocument,
  type TenantDeliverySlot,
  type TenantProfileResponse,
} from "@/lib/platform-api";
import { useSession } from "@/lib/session";
import { Avatar, Button, Card, Chip, Divider, ErrorState, Input, KeyValue, ListItem, Row, Screen, Sheet, SkeletonList, Text, t } from "@/ui";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const slots: Array<{ code: TenantDeliverySlot; label: string }> = [
  { code: "before_opening", label: "Before opening" },
  { code: "standard", label: "Standard" },
  { code: "evening", label: "Evening" },
  { code: "express", label: "Express" },
];

const documentLabels: Record<string, string> = {
  gst_certificate: "GST certificate", fssai_certificate: "FSSAI certificate", owner_pan: "Owner PAN",
  cancelled_cheque: "Cancelled cheque", address_proof: "Address proof", other: "Supporting document",
};

type Outlet = TenantProfileResponse["outlets"][number];

export default function TenantProfileScreen() {
  const router = useRouter();
  const sessionKind = useSession((state) => state.sessionKind);
  const tenantPublicId = useSession((state) => state.activeTenantPublicId);
  const tenants = useSession((state) => state.tenants);
  const language = useSession((state) => state.language);
  const setLanguage = useSession((state) => state.setLanguage);
  const logout = useSession((state) => state.logout);
  const [profile, setProfile] = useState<TenantProfileResponse | null>(null);
  const [documents, setDocuments] = useState<TenantBusinessDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [editOutlet, setEditOutlet] = useState<Outlet | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [instructions, setInstructions] = useState("");
  const [inUse, setInUse] = useState("0");
  const [spareFull, setSpareFull] = useState("0");
  const [empty, setEmpty] = useState("0");
  const [requirementPeriod, setRequirementPeriod] = useState<"week" | "month">("week");
  const [preferredDays, setPreferredDays] = useState<number[]>([]);
  const [preferredSlot, setPreferredSlot] = useState<TenantDeliverySlot | null>("before_opening");
  const [requirementQuantities, setRequirementQuantities] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!tenantPublicId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextProfile, nextDocuments] = await Promise.all([loadTenantProfile(tenantPublicId), loadTenantDocuments(tenantPublicId)]);
      setProfile(nextProfile);
      setDocuments(nextDocuments.documents);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The business account could not be loaded.");
    } finally { setLoading(false); }
  }, [tenantPublicId]);

  useEffect(() => { void refresh(); }, [refresh]);
  if (sessionKind !== "tenant") return <Redirect href="/" />;
  if (!tenantPublicId) return <Redirect href="/(auth)/select-tenant" />;

  const openEditor = (outlet: Outlet) => {
    setEditOutlet(outlet);
    setContactName(outlet.contact.name ?? "");
    setContactPhone((outlet.contact.phoneE164 ?? "").replace(/^\+91/, ""));
    setInstructions(outlet.deliveryInstructions ?? "");
    setInUse(String(outlet.stock.inUse)); setSpareFull(String(outlet.stock.spareFull)); setEmpty(String(outlet.stock.empty));
    setRequirementPeriod(outlet.requirement?.period ?? "week");
    setPreferredDays(outlet.requirement?.preferredDeliveryDays ?? []);
    setPreferredSlot(outlet.requirement?.preferredSlot ?? "before_opening");
    setRequirementQuantities(Object.fromEntries((profile?.cylinderTypes ?? []).map((item) => [item.code, String(outlet.requirement?.items.find((candidate) => candidate.cylinderTypeCode === item.code)?.expectedQuantity ?? 0)])));
    setFormError(null);
  };

  const saveOutlet = async () => {
    if (!editOutlet || !tenantPublicId || !profile) return;
    const stock = [inUse, spareFull, empty].map((value) => Number(value));
    if (stock.some((value) => !Number.isInteger(value) || value < 0)) return setFormError("Stock counts must be whole numbers of zero or more.");
    if (contactPhone && !/^[6-9][0-9]{9}$/.test(contactPhone)) return setFormError("Enter a valid 10-digit Indian mobile number.");
    const items = profile.cylinderTypes.map((item) => ({ cylinderTypeCode: item.code, expectedQuantity: Number(requirementQuantities[item.code] ?? 0) })).filter((item) => Number.isInteger(item.expectedQuantity) && item.expectedQuantity > 0);
    if (Object.values(requirementQuantities).some((value) => Number(value) < 0 || !Number.isInteger(Number(value)))) return setFormError("Requirement quantities must be whole numbers.");
    setSaving(true); setFormError(null);
    try {
      await updateTenantOutlet(tenantPublicId, editOutlet.publicId, {
        contactName: contactName.trim() || null,
        contactPhoneE164: contactPhone ? `+91${contactPhone}` : null,
        deliveryInstructions: instructions.trim() || null,
        stock: { inUse: stock[0]!, spareFull: stock[1]!, empty: stock[2]! },
        ...(items.length ? { requirement: { period: requirementPeriod, preferredDeliveryDays: preferredDays, preferredSlot, items } } : {}),
      });
      setEditOutlet(null);
      toast.success("Outlet updated", "Stock, contact, and requirement details are current.");
      await refresh();
    } catch (cause) { setFormError(cause instanceof Error ? cause.message : "The outlet could not be updated."); }
    finally { setSaving(false); }
  };

  return (
    <Screen title="Account" subtitle="Registration, outlets, and support" tabBar refreshing={loading} onRefresh={() => { void refresh(); }}>
      {loading && !profile ? <SkeletonList count={4} /> : null}
      {error && !profile ? <ErrorState message={error} onRetry={() => { void refresh(); }} /> : null}
      {profile ? (
        <View style={{ gap: 14 }}>
          <Card>
            <Row gap={14} center={false}>
              <Avatar name={profile.tenant.displayName} size={54} />
              <View style={{ flex: 1 }}>
                <Text variant="h2">{profile.tenant.displayName}</Text>
                <Text variant="small" tone="muted">{profile.tenant.businessType.replaceAll("_", " ")} · {profile.user.membershipType}</Text>
                <Text variant="caption" tone="success" style={{ marginTop: 4 }}>Active commercial account</Text>
              </View>
            </Row>
            <Divider />
            <KeyValue k="Legal name" v={profile.tenant.legalName} />
            <KeyValue k="GSTIN" v={profile.tenant.gstin} />
            {profile.tenant.fssaiNumber ? <KeyValue k="FSSAI" v={profile.tenant.fssaiNumber} /> : null}
            <KeyValue k="Registered phone" v={profile.user.phoneE164} />
          </Card>

          <Card tone="alt">
            <Text variant="label" tone="muted">Serving agency</Text>
            <Text variant="h3" style={{ marginTop: 5 }}>{profile.agency.displayName}</Text>
            <Text variant="small" tone="muted">{profile.agency.phoneE164}</Text>
            <Button title="Request an agency change" variant="ghost" size="sm" style={{ marginTop: 10 }} onPress={() => router.push({ pathname: "/(tenant)/support", params: { kind: "change_request", field: "serving_agency" } })} />
          </Card>

          <View>
            <Text variant="h3" style={{ marginBottom: 9 }}>Outlets</Text>
            <View style={{ gap: 10 }}>
              {profile.outlets.map((outlet) => (
                <Card key={outlet.publicId}>
                  <Row between center={false}>
                    <View style={{ flex: 1 }}>
                      <Text variant="bodyStrong">{outlet.label}</Text>
                      <Text variant="caption" tone="muted">{[outlet.address.line1, outlet.address.line2, outlet.address.city, outlet.address.stateCode, outlet.address.pincode].filter(Boolean).join(", ")}</Text>
                    </View>
                    {profile.user.canManage ? <Button title="Edit" size="sm" variant="secondary" onPress={() => openEditor(outlet)} /> : null}
                  </Row>
                  <Divider />
                  <KeyValue k="Stock" v={`${outlet.stock.inUse} in use · ${outlet.stock.spareFull} full · ${outlet.stock.empty} empty`} />
                  <KeyValue k="Contact" v={outlet.contact.name ?? outlet.contact.phoneE164 ?? "Not set"} />
                  <KeyValue k="Requirement" v={outlet.requirement ? `${outlet.requirement.items.reduce((sum, item) => sum + item.expectedQuantity, 0)} cylinders / ${outlet.requirement.period}` : "Not set"} />
                </Card>
              ))}
            </View>
          </View>

          <Card style={{ paddingVertical: 4 }}>
            <ListItem icon="create-outline" title="Request a registered-detail change" subtitle="Business name, GST/FSSAI, phone, or address" onPress={() => router.push({ pathname: "/(tenant)/support", params: { kind: "change_request" } })} />
            <ListItem icon="help-circle-outline" title="Support and safety" subtitle="Cases, FAQ, and LPG emergency guidance" onPress={() => router.push("/(tenant)/support")} />
            {PRIVACY_POLICY_URL ? <ListItem icon="shield-checkmark-outline" title="Privacy policy" subtitle="How account and business data is handled" onPress={() => { void Linking.openURL(PRIVACY_POLICY_URL); }} /> : null}
            <ListItem icon="language-outline" title="Language" subtitle={language === "en" ? "English" : language === "hi" ? "हिंदी" : "తెలుగు"} onPress={() => setLanguageOpen(true)} />
            {tenants.length > 1 ? <ListItem icon="swap-horizontal-outline" title="Switch business" subtitle={`${tenants.length} businesses available`} onPress={() => router.push("/(auth)/select-tenant")} /> : null}
          </Card>

          <View>
            <Text variant="h3" style={{ marginBottom: 9 }}>Private documents</Text>
            {documents.length ? <View style={{ gap: 9 }}>{documents.map((document) => (
              <Card key={document.publicId}>
                <Row gap={10}>
                  <Ionicons name="document-lock-outline" size={22} color={t.colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text variant="bodyStrong">{documentLabels[document.documentType] ?? document.documentType.replaceAll("_", " ")}</Text>
                    <Text variant="caption" tone="muted">{document.originalFileName} · v{document.version} · {document.status}</Text>
                  </View>
                </Row>
              </Card>
            ))}</View> : <Card tone="alt"><Text variant="small" tone="muted">No tenant documents are available yet. Documents added by authorized administrators will appear here.</Text></Card>}
          </View>

          <Button title="Sign out" variant="ghost" icon="log-out-outline" onPress={() => Alert.alert("Sign out?", "You can sign in again with an OTP.", [
            { text: "Cancel", style: "cancel" },
            { text: "Sign out", style: "destructive", onPress: () => { void logout().finally(() => router.replace("/")); } },
          ])} />
          {error ? <Text variant="small" tone="danger">{error}</Text> : null}
        </View>
      ) : null}

      <Sheet open={languageOpen} onClose={() => setLanguageOpen(false)} title="Language">
        <Row gap={8} style={{ flexWrap: "wrap", marginBottom: 12 }}>
          {(["en", "hi", "te"] as const).map((code) => <Chip key={code} label={code === "en" ? "English" : code === "hi" ? "हिंदी" : "తెలుగు"} active={language === code} onPress={() => { setLanguage(code); setLanguageOpen(false); }} />)}
        </Row>
        <Text variant="caption" tone="muted">English is the complete production language in this release. Hindi and Telugu remain saved preferences until reviewed translations are approved.</Text>
      </Sheet>

      <Sheet open={!!editOutlet} onClose={() => setEditOutlet(null)} title={editOutlet ? `Update ${editOutlet.label}` : "Update outlet"} dismissable={!saving}>
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <Input label="Outlet contact name" value={contactName} onChangeText={setContactName} placeholder="Kitchen manager" />
          <Input label="Outlet contact mobile" value={contactPhone} onChangeText={(value) => setContactPhone(value.replace(/\D/g, "").slice(0, 10))} keyboardType="number-pad" left={<Text variant="bodyStrong" tone="muted">+91</Text>} />
          <Input label="Delivery instructions" value={instructions} onChangeText={setInstructions} placeholder="Loading entrance, service hours, or landmark" multiline numberOfLines={2} style={{ minHeight: 64, textAlignVertical: "top" }} />
          <Text variant="label" tone="muted">Current stock</Text>
          <Row gap={8}>
            <View style={{ flex: 1 }}><Input label="In use" value={inUse} onChangeText={(value) => setInUse(value.replace(/\D/g, ""))} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Input label="Full spare" value={spareFull} onChangeText={(value) => setSpareFull(value.replace(/\D/g, ""))} keyboardType="number-pad" /></View>
            <View style={{ flex: 1 }}><Input label="Empty" value={empty} onChangeText={(value) => setEmpty(value.replace(/\D/g, ""))} keyboardType="number-pad" /></View>
          </Row>
          <Text variant="label" tone="muted">Requirement estimate</Text>
          <Row gap={8}><Chip label="Per week" active={requirementPeriod === "week"} onPress={() => setRequirementPeriod("week")} /><Chip label="Per month" active={requirementPeriod === "month"} onPress={() => setRequirementPeriod("month")} /></Row>
          {profile?.cylinderTypes.map((item) => <Input key={item.code} label={item.displayName} value={requirementQuantities[item.code] ?? "0"} onChangeText={(value) => setRequirementQuantities((current) => ({ ...current, [item.code]: value.replace(/\D/g, "") }))} keyboardType="number-pad" />)}
          <Text variant="caption" tone="muted">Preferred delivery days</Text>
          <Row gap={6} style={{ flexWrap: "wrap" }}>{weekdays.map((day, index) => <Chip key={day} label={day} active={preferredDays.includes(index)} onPress={() => setPreferredDays((current) => current.includes(index) ? current.filter((value) => value !== index) : [...current, index].sort())} />)}</Row>
          <Text variant="caption" tone="muted">Preferred slot</Text>
          <Row gap={6} style={{ flexWrap: "wrap" }}>{slots.map((slot) => <Chip key={slot.code} label={slot.label} active={preferredSlot === slot.code} onPress={() => setPreferredSlot(slot.code)} />)}</Row>
          {formError ? <Text variant="small" tone="danger">{formError}</Text> : null}
          <Button title="Save outlet" loading={saving} onPress={() => { void saveOutlet(); }} />
        </View>
      </Sheet>
    </Screen>
  );
}
