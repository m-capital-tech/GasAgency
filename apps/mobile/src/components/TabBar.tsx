import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, t } from "@/ui";

const ICONS: Record<string, [keyof typeof Ionicons.glyphMap, keyof typeof Ionicons.glyphMap]> = {
  home: ["home", "home-outline"],
  orders: ["cube", "cube-outline"],
  notifications: ["notifications", "notifications-outline"],
  billing: ["receipt", "receipt-outline"],
  analytics: ["stats-chart", "stats-chart-outline"],
  profile: ["person", "person-outline"],
  drops: ["list", "list-outline"],
  summary: ["stats-chart", "stats-chart-outline"],
};
const VISIBLE_TABS = new Set(["home", "orders", "analytics", "billing", "profile", "notifications", "drops", "summary"]);

/** Static bottom tab bar with labels (sits in the layout flow, not floating). */
export function TabBar({ state, navigation, descriptors }: any) {
  const insets = useSafeAreaInsets();
  const activeRoute = state.routes[state.index];
  if (!activeRoute || !VISIBLE_TABS.has(activeRoute.name)) return null;
  const visibleRoutes = state.routes.filter((route: any) => VISIBLE_TABS.has(route.name));
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {visibleRoutes.map((route: any) => {
        const focused = activeRoute?.key === route.key;
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
            style={styles.tab}
          >
            <View>
              <Ionicons name={focused ? on : off} size={22} color={focused ? t.colors.primary : t.colors.inkFaint} />
              {badge ? <View style={styles.badge} /> : null}
            </View>
            <Text variant="caption" style={{ color: focused ? t.colors.primary : t.colors.inkFaint, fontSize: 11 }}>
              {String(label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", backgroundColor: t.colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border, paddingTop: 8 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: 4 },
  badge: { position: "absolute", top: -2, right: -4, width: 8, height: 8, borderRadius: 4, backgroundColor: t.colors.primary, borderWidth: 1.5, borderColor: t.colors.surface },
});
