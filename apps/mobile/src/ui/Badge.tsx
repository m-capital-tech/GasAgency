import { STATUS_LABELS, type BookingStatus } from "@gassetu/shared";
import { omcColors, statusColors } from "@gassetu/ui-tokens";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { t } from "./theme";

export function Badge({ label, bg, fg, dot }: { label: string; bg: string; fg: string; dot?: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: fg }]} /> : null}
      <Text variant="caption" style={{ color: fg }}>
        {label}
      </Text>
    </View>
  );
}

export function StatusBadge({ status }: { status: BookingStatus }) {
  const c = statusColors[status] ?? { bg: t.colors.surfaceAlt, fg: t.colors.inkMuted };
  return <Badge label={STATUS_LABELS[status]} bg={c.bg} fg={c.fg} dot />;
}

export function OmcBadge({ omc }: { omc: string }) {
  const c = omcColors[omc] ?? { bg: t.colors.surfaceAlt, fg: t.colors.inkMuted };
  return <Badge label={omc} bg={c.bg} fg={c.fg} />;
}

const styles = StyleSheet.create({
  badge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, alignSelf: "flex-start", gap: 5 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
