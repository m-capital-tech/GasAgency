import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { ActivityIndicator, Platform, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "./Text";
import { t } from "./theme";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "white";
type Size = "sm" | "md" | "lg";

export interface ButtonProps {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconRight?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
  full?: boolean;
  accessibilityLabel?: string;
}

const bg: Record<Variant, string> = {
  primary: t.colors.primary,
  secondary: t.colors.primarySoft,
  ghost: "transparent",
  danger: t.colors.danger,
  success: t.colors.success,
  white: t.colors.white,
};
const fg: Record<Variant, string> = {
  primary: "#fff",
  secondary: t.colors.primaryDark,
  ghost: t.colors.ink,
  danger: "#fff",
  success: "#fff",
  white: t.colors.ink,
};
const heights: Record<Size, number> = { sm: 38, md: 48, lg: 56 };

export function Button({ title, onPress, variant = "primary", size = "md", loading, disabled, icon, iconRight, style, full = true, accessibilityLabel }: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: !!isDisabled }}
      disabled={isDisabled}
      onPress={() => {
        if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg[variant], height: heights[size], opacity: isDisabled ? 0.55 : pressed ? 0.85 : 1, alignSelf: full ? "stretch" : "flex-start" },
        variant === "ghost" && styles.ghost,
        variant === "white" && styles.white,
        size === "sm" && { paddingHorizontal: 14, borderRadius: 12 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg[variant]} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === "sm" ? 16 : 19} color={fg[variant]} style={{ marginRight: 8 }} /> : null}
          <Text variant={size === "sm" ? "small" : "bodyStrong"} style={{ color: fg[variant], fontWeight: "600" }}>
            {title}
          </Text>
          {iconRight ? <Ionicons name={iconRight} size={18} color={fg[variant]} style={{ marginLeft: 8 }} /> : null}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 20, borderRadius: 16 },
  ghost: { borderWidth: 1, borderColor: t.colors.border },
  white: { borderWidth: 1, borderColor: t.colors.border },
});
