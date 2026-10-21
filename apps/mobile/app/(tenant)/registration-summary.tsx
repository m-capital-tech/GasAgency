import { Ionicons } from "@expo/vector-icons";
import { Redirect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { loadTenantProfile, type TenantProfileResponse } from "@/lib/platform-api";
import { useSession } from "@/lib/session";
import { Button, Card, ErrorState, KeyValue, Row, Screen, SkeletonList, Text, t } from "@/ui";

export default function TenantRegistrationSummaryScreen() {
  const router = useRouter();
  const sessionKind = useSession((state) => state.sessionKind);
  const tenantPublicId = useSession((state) => state.activeTenantPublicId);
  const showRegistrationSummary = useSession((state) => state.showRegistrationSummary);
  const completeRegistrationSummary = useSession((state) => state.completeRegistrationSummary);
  const [profile, setProfile] = useState<TenantProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantPublicId) return;
    setLoading(true); setError(null);
    try { setProfile(await loadTenantProfile(tenantPublicId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Your registration summary could not be loaded."); }
    finally { setLoading(false); }
  }, [tenantPublicId]);
  useEffect(() => { void load(); }, [load]);

  if (sessionKind !== "tenant") return <Redirect href="/" />;
  if (!tenantPublicId) return <Redirect href="/(auth)/select-tenant" />;
  if (!showRegistrationSummary) return <Redirect href="/(tenant)/home" />;

  const continueToApp = () => {
    completeRegistrationSummary();
    router.replace("/(tenant)/home");
  };

  return (
    <Screen>
      <View style={{ alignItems: "center", paddingTop: 18, paddingBottom: 20 }}>
        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.colors.successSoft, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="shield-checkmark" size={32} color={t.colors.success} />
        </View>
        <Text variant="title" center style={{ marginTop: 14 }}>Your business is ready</Text>
        <Text variant="body" tone="muted" center style={{ marginTop: 5 }}>Please check the registration created and approved by the platform team.</Text>
      </View>
      {loading ? <SkeletonList count={3} /> : null}
      {error ? <ErrorState message={error} onRetry={() => { void load(); }} /> : null}
      {profile ? (
        <View style={{ gap: 12 }}>
          <Card>
            <Text variant="h2">{profile.tenant.displayName}</Text>
            <Text variant="small" tone="muted">{profile.tenant.businessType.replaceAll("_", " ")}</Text>
            <KeyValue k="Legal name" v={profile.tenant.legalName} />
            <KeyValue k="GSTIN" v={profile.tenant.gstin} />
            {profile.tenant.fssaiNumber ? <KeyValue k="FSSAI" v={profile.tenant.fssaiNumber} /> : null}
          </Card>
          <Card tone="alt">
            <Text variant="label" tone="muted">Serving agency selected by admin</Text>
            <Text variant="h3" style={{ marginTop: 5 }}>{profile.agency.displayName}</Text>
            <Text variant="small" tone="muted">{profile.agency.phoneE164}</Text>
          </Card>
          {profile.outlets.map((outlet) => (
            <Card key={outlet.publicId}>
              <Row gap={10} center={false}>
                <Ionicons name="location-outline" size={21} color={t.colors.primary} />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{outlet.label}</Text>
                  <Text variant="small" tone="muted">{[outlet.address.line1, outlet.address.line2, outlet.address.city, outlet.address.stateCode, outlet.address.pincode].filter(Boolean).join(", ")}</Text>
                </View>
              </Row>
            </Card>
          ))}
          <Card tone="soft">
            <Text variant="small">Need a correction? Continue into the app and use Account → Request a registered-detail change. Controlled fields are never edited silently.</Text>
          </Card>
          <Button title="Continue to ordering" size="lg" iconRight="arrow-forward" onPress={continueToApp} />
        </View>
      ) : null}
    </Screen>
  );
}
