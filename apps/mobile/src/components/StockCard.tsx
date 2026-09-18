import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import type { ExpandedOutlet } from "@/features/hooks";
import { Cylinder } from "./Cylinder";
import { Card, Row, Text, t } from "@/ui";

/** Stock at one outlet: in use / spare / empties, plus "days of LPG left". */
export function StockCard({ outlet, onPress, compact }: { outlet: ExpandedOutlet; onPress?: () => void; compact?: boolean }) {
  const days = outlet.daysLeft;
  const tone = days <= 1 ? t.colors.primary : days <= 3 ? t.colors.gold : t.colors.success;
  const pct = Math.min(100, (days / 7) * 100);
  return (
    <Card onPress={onPress}>
      <Row between center={false}>
        <View style={{ flex: 1 }}>
          <Text variant="label" tone="faint">
            {outlet.label}
          </Text>
          <Text variant={compact ? "h3" : "h2"} style={{ marginTop: 2 }}>
            {days <= 0 ? "Out of LPG" : days === 1 ? "~1 day of LPG left" : `~${days} days of LPG left`}
          </Text>
          <Text variant="small" tone="muted">
            {outlet.cylindersPerWeek} cylinder{outlet.cylindersPerWeek === 1 ? "" : "s"} / week · {outlet.line2 ?? outlet.city}
          </Text>
        </View>
        {!compact ? (
          <View style={{ marginTop: -4 }}>
            <Cylinder size={46} />
          </View>
        ) : null}
      </Row>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: tone }]} />
      </View>
      <Row gap={8} style={{ marginTop: 12 }}>
        <Stat icon="flame" label="In use" value={outlet.inUse} />
        <Stat icon="cube" label="Spare full" value={outlet.spareFull} tone={outlet.spareFull === 0 ? t.colors.primary : undefined} />
        <Stat icon="repeat" label="Empties" value={outlet.emptiesHeld} />
      </Row>
    </Card>
  );
}

function Stat({ icon, label, value, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number; tone?: string }) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={14} color={tone ?? t.colors.inkMuted} />
      <Text variant="h3" style={{ color: tone ?? t.colors.ink }}>
        {value}
      </Text>
      <Text variant="caption" tone="muted">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: 4, backgroundColor: t.colors.border, marginTop: 12, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4 },
  stat: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: t.colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
});
