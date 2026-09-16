import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Redirect, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Cylinder } from "@/components/Cylinder";
import { useSession } from "@/lib/session";
import { Button, Text, t } from "@/ui";

const LANGS: { key: "en" | "hi" | "te"; label: string; native: string }[] = [
  { key: "en", label: "English", native: "English" },
  { key: "hi", label: "Hindi", native: "हिंदी" },
  { key: "te", label: "Telugu", native: "తెలుగు" },
];

/** C1 — Splash / language picker. Also the router's entry: sends signed-in users to the right home. */
export default function SplashScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, onboarding, mode, language, setLanguage } = useSession();

  if (user) {
    if (user.role === "delivery" || mode === "delivery") return <Redirect href="/(delivery)/home" />;
    if (onboarding === "profile") return <Redirect href="/(onboarding)/profile" />;
    if (onboarding === "connection") return <Redirect href="/(onboarding)/connection" />;
    return <Redirect href="/(customer)/home" />;
  }

  return (
    <LinearGradient colors={["#A31E21", "#620A1A", "#1D1D1E"]} style={{ flex: 1, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20, paddingHorizontal: 24 }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 6 }}>
        <View style={styles.logoWrap}>
          <Cylinder size={120} color="#C6953F" dark="#9C7328" />
        </View>
        <Text variant="hero" style={{ color: "#fff", marginTop: 8 }}>
          GasSetu
        </Text>
        <Text variant="body" style={{ color: "#E9E3D6" }} center>
          LPG refills, booked in a tap.{"\n"}Tracked live. Any oil company.
        </Text>
      </View>
      <View style={{ gap: 14 }}>
        <Text variant="label" style={{ color: "#C6953F" }} center>
          Choose your language
        </Text>
        <View style={{ flexDirection: "row", gap: 10 }}>
          {LANGS.map((l) => {
            const active = language === l.key;
            return (
              <Pressable key={l.key} onPress={() => setLanguage(l.key)} accessibilityRole="radio" accessibilityState={{ selected: active }} accessibilityLabel={l.label} style={[styles.lang, active && styles.langActive]}>
                <Text variant="h3" style={{ color: active ? t.colors.ink : "#fff" }}>
                  {l.native}
                </Text>
                {active ? <Ionicons name="checkmark-circle" size={16} color={t.colors.gold} style={{ position: "absolute", top: 6, right: 6 }} /> : null}
              </Pressable>
            );
          })}
        </View>
        {language !== "en" ? (
          <Text variant="caption" style={{ color: "#E9E3D6" }} center>
            Prototype note: full translations coming — UI stays in English for now.
          </Text>
        ) : null}
        <Button title="Get started" variant="white" size="lg" iconRight="arrow-forward" onPress={() => router.push("/(auth)/login")} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  logoWrap: { width: 180, height: 180, borderRadius: 90, backgroundColor: "rgba(255,255,255,0.14)", alignItems: "center", justifyContent: "center" },
  lang: { flex: 1, height: 56, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  langActive: { backgroundColor: "#fff", borderColor: "#fff" },
});
