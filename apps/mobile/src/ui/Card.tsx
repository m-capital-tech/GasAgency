import { Pressable, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { shadow, t } from "./theme";

export interface CardProps extends ViewProps {
  onPress?: () => void;
  padded?: boolean;
  tone?: "surface" | "alt" | "primary" | "navy" | "soft";
  style?: StyleProp<ViewStyle>;
}

const tones = {
  surface: t.colors.surface,
  alt: t.colors.surfaceAlt,
  primary: t.colors.primary,
  navy: t.colors.navy,
  soft: t.colors.primarySoft,
};

export function Card({ onPress, padded = true, tone = "surface", style, children, ...rest }: CardProps) {
  const body = (
    <View {...rest} style={[styles.card, { backgroundColor: tones[tone] }, padded && styles.padded, tone === "surface" && shadow, style]}>
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.995 : 1 }] })}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border, overflow: "hidden" },
  padded: { padding: 16 },
});
