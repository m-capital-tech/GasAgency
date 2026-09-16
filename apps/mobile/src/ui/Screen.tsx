import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";
import { t } from "./theme";

interface ScreenProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  footer?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  bg?: string;
  /** extra bottom padding so content clears the floating tab bar */
  tabBar?: boolean;
  keyboard?: boolean;
}

export function Screen({ children, title, subtitle, back, right, scroll = true, padded = true, footer, refreshing, onRefresh, contentStyle, bg = t.colors.bg, tabBar, keyboard }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const header =
    title || back || right ? (
      <View style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <View style={styles.headerRow}>
          {back ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} style={styles.backBtn} hitSlop={10}>
              <Ionicons name="chevron-back" size={22} color={t.colors.ink} />
            </Pressable>
          ) : null}
          <View style={{ flex: 1 }}>
            {title ? <Text variant="h2">{title}</Text> : null}
            {subtitle ? (
              <Text variant="small" tone="muted">
                {subtitle}
              </Text>
            ) : null}
          </View>
          {right}
        </View>
      </View>
    ) : (
      <View style={{ height: insets.top }} />
    );

  const inner = (
    <View style={[padded && styles.padded, { paddingBottom: (footer ? 12 : insets.bottom + 24) + (tabBar ? 92 : 0) }, contentStyle]}>{children}</View>
  );

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="never"
      showsVerticalScrollIndicator={false}
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} /> : undefined}
    >
      {inner}
    </ScrollView>
  ) : (
    <View style={{ flex: 1 }}>{inner}</View>
  );

  const content = (
    <View style={[styles.root, { backgroundColor: bg }]}>
      {header}
      {body}
      {footer ? <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>{footer}</View> : null}
    </View>
  );
  if (keyboard) {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {content}
      </KeyboardAvoidingView>
    );
  }
  return content;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 10 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 40 },
  backBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: t.colors.surface, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  padded: { paddingHorizontal: 20, paddingTop: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: t.colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.colors.border },
});
