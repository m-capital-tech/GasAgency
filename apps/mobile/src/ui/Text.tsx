import { Text as RNText, type TextProps as RNTextProps, StyleSheet } from "react-native";
import { t } from "./theme";

type Variant = "hero" | "title" | "h2" | "h3" | "body" | "bodyStrong" | "small" | "caption" | "label";
type Tone = "ink" | "muted" | "faint" | "primary" | "success" | "danger" | "white" | "warning";

export interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  center?: boolean;
}

const tones: Record<Tone, string> = {
  ink: t.colors.ink,
  muted: t.colors.inkMuted,
  faint: t.colors.inkFaint,
  primary: t.colors.primary,
  success: t.colors.success,
  danger: t.colors.danger,
  white: t.colors.white,
  warning: "#9C7328",
};

export function Text({ variant = "body", tone = "ink", center, style, ...rest }: TextProps) {
  return <RNText {...rest} style={[styles[variant], { color: tones[tone] }, center && { textAlign: "center" }, style]} />;
}

const styles = StyleSheet.create({
  hero: { fontSize: 32, fontWeight: "700", letterSpacing: -0.8, lineHeight: 38 },
  title: { fontSize: 24, fontWeight: "700", letterSpacing: -0.5, lineHeight: 30 },
  h2: { fontSize: 19, fontWeight: "700", letterSpacing: -0.3, lineHeight: 24 },
  h3: { fontSize: 16, fontWeight: "600", lineHeight: 21 },
  body: { fontSize: 15, fontWeight: "400", lineHeight: 21 },
  bodyStrong: { fontSize: 15, fontWeight: "600", lineHeight: 21 },
  small: { fontSize: 13, fontWeight: "400", lineHeight: 18 },
  caption: { fontSize: 12, fontWeight: "500", lineHeight: 16 },
  label: { fontSize: 11, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", lineHeight: 14 },
});
