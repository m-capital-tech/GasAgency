import { Ionicons } from "@expo/vector-icons";
import type { Agency } from "@gassetu/shared";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Card, IconButton, OmcBadge, Row, Text, t } from "@/ui";

export function AgencyCard({ agency, distanceKm, onPress, compact }: { agency: Agency & { distanceKm?: number | null }; distanceKm?: number | null; onPress?: () => void; compact?: boolean }) {
  const d = distanceKm ?? agency.distanceKm;
  return (
    <Card>
      <Row gap={12}>
        <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
        <View style={styles.logo}>
          <Text variant="h3" tone="primary">
            {agency.omc}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="label" tone="faint">
            Your agency
          </Text>
          <Text variant="bodyStrong" numberOfLines={1}>
            {agency.name}
          </Text>
          <Row gap={8} style={{ marginTop: 4, flexWrap: "wrap" }}>
            <OmcBadge omc={agency.omc} />
            <Row gap={3}>
              <Ionicons name="star" size={12} color={t.colors.warning} />
              <Text variant="caption" tone="muted">
                {agency.rating.toFixed(1)}
              </Text>
            </Row>
            {typeof d === "number" ? (
              <Text variant="caption" tone="muted">
                · {d} km away
              </Text>
            ) : null}
            <Text variant="caption" tone="muted">
              · {agency.area}
            </Text>
          </Row>
        </View>
        </Pressable>
        {!compact ? <IconButton icon="call" label={`Call ${agency.name}`} tone="soft" onPress={() => Linking.openURL(`tel:${agency.phone}`)} /> : null}
      </Row>
    </Card>
  );
}

const styles = StyleSheet.create({ logo: { width: 52, height: 52, borderRadius: 16, backgroundColor: t.colors.primarySoft, alignItems: "center", justifyContent: "center" } });
