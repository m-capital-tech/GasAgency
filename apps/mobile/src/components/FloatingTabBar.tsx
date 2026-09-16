import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { shadowStrong, t } from "@/ui";

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  home: ["home", "home-outline"],
  orders: ["receipt", "receipt-outline"],
  notifications: ["notifications", "notifications-outline"],
  profile: ["person", "person-outline"],
  drops: ["list", "list-outline"],
  summary: ["stats-chart", "stats-chart-outline"],
};

/** Floating pill tab bar (reference screenshot). */
export function FloatingTabBar({ state, navigation, descriptors }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.host, { bottom: Math.max(insets.bottom, 12) + 4 }]}>
      <View style={[styles.pill, shadowStrong]}>
        {state.routes.map((route: any, i: number) => {
          const focused = state.index === i;
          const [on, off] = ICONS[route.name] ?? ["ellipse", "ellipse-outline"];
          const label = descriptors[route.key]?.options.title ?? route.name;
          const badge = (descriptors[route.key]?.options as any).tabBarBadge;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityLabel={String(label)}
              accessibilityState={{ selected: focused }}
              onPress={() => {
                const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[styles.tab, focused && styles.tabActive]}
            >
              <Ionicons name={focused ? on : off} size={22} color={focused ? "#fff" : t.colors.inkMuted} />
              {badge ? <View style={styles.badge} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pill: { flexDirection: "row", backgroundColor: t.colors.surface, borderRadius: 999, padding: 6, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  tab: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: t.colors.primary },
  badge: { position: "absolute", top: 12, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.danger, borderWidth: 1.5, borderColor: "#fff" },
});
