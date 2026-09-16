import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "./Text";
import { t } from "./theme";

export function Avatar({ name, color = t.colors.primary, size = 40 }: { name: string; color?: string; size?: number }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }} accessibilityLabel={name}>
      <Text style={{ color, fontWeight: "700", fontSize: size * 0.38 }}>{initials || "?"}</Text>
    </View>
  );
}

export function Row({ children, style, gap = 10, between, center = true }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number; between?: boolean; center?: boolean }) {
  return <View style={[{ flexDirection: "row", alignItems: center ? "center" : "flex-start", gap, justifyContent: between ? "space-between" : "flex-start" }, style]}>{children}</View>;
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border, marginVertical: 12 }, style]} />;
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress?: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }} style={[styles.chip, active && styles.chipActive]}>
      {icon ? <Ionicons name={icon} size={14} color={active ? "#fff" : t.colors.inkMuted} /> : null}
      <Text variant="small" style={{ color: active ? "#fff" : t.colors.ink, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, tone = "surface", size = 40 }: { icon: keyof typeof Ionicons.glyphMap; onPress?: () => void; label: string; tone?: "surface" | "primary" | "soft"; size?: number }) {
  const bg = tone === "primary" ? t.colors.primary : tone === "soft" ? t.colors.primarySoft : t.colors.surface;
  const fg = tone === "primary" ? "#fff" : tone === "soft" ? t.colors.primary : t.colors.ink;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6} style={({ pressed }) => [styles.iconBtn, { backgroundColor: bg, width: size, height: size, borderRadius: size / 2, opacity: pressed ? 0.8 : 1 }]}>
      <Ionicons name={icon} size={size * 0.5} color={fg} />
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row between style={{ marginBottom: 10, marginTop: 6 }}>
      <Text variant="h3">{title}</Text>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <Text variant="small" tone="primary" style={{ fontWeight: "600" }}>
            {action}
          </Text>
        </Pressable>
      ) : null}
    </Row>
  );
}

export function ListItem({ icon, title, subtitle, onPress, right, danger, iconColor }: { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; onPress?: () => void; right?: ReactNode; danger?: boolean; iconColor?: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.li, { opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.liIcon, danger && { backgroundColor: t.colors.dangerSoft }]}>
        <Ionicons name={icon} size={18} color={danger ? t.colors.danger : (iconColor ?? t.colors.ink)} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" tone={danger ? "danger" : "ink"}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="small" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right ?? <Ionicons name="chevron-forward" size={18} color={t.colors.inkFaint} />}
    </Pressable>
  );
}

export function KeyValue({ k, v, strong, tone }: { k: string; v: string; strong?: boolean; tone?: "ink" | "muted" | "success" | "danger" | "primary" }) {
  return (
    <Row between style={{ paddingVertical: 5 }}>
      <Text variant={strong ? "bodyStrong" : "small"} tone={strong ? "ink" : "muted"}>
        {k}
      </Text>
      <Text variant={strong ? "h3" : "small"} tone={tone ?? "ink"}>
        {v}
      </Text>
    </Row>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border },
  chipActive: { backgroundColor: t.colors.navy, borderColor: t.colors.navy },
  iconBtn: { alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  li: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  liIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: t.colors.surfaceAlt, alignItems: "center", justifyContent: "center" },
});
