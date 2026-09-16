import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Button } from "./Button";
import { Text } from "./Text";
import { t } from "./theme";

export function Skeleton({ width = "100%", height = 16, radius = 8, style }: { width?: number | `${number}%`; height?: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const anim = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([Animated.timing(anim, { toValue: 1, duration: 700, useNativeDriver: true }), Animated.timing(anim, { toValue: 0.4, duration: 700, useNativeDriver: true })]));
    loop.start();
    return () => loop.stop();
  }, [anim]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: t.colors.border, opacity: anim }, style]} />;
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <View style={styles.skCard}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Skeleton width={44} height={44} radius={22} />
        <View style={{ flex: 1, gap: 8 }}>
          <Skeleton width="60%" />
          <Skeleton width="40%" height={12} />
        </View>
      </View>
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <Skeleton key={i} width={i % 2 ? "70%" : "90%"} height={12} style={{ marginTop: 12 }} />
      ))}
    </View>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View style={{ gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

export function EmptyState({ icon = "file-tray-outline", title, body, action, onAction }: { icon?: keyof typeof Ionicons.glyphMap; title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.state}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={28} color={t.colors.primary} />
      </View>
      <Text variant="h3" center style={{ marginTop: 14 }}>
        {title}
      </Text>
      {body ? (
        <Text variant="small" tone="muted" center style={{ marginTop: 6, maxWidth: 280 }}>
          {body}
        </Text>
      ) : null}
      {action && onAction ? <Button title={action} onPress={onAction} variant="secondary" size="sm" full={false} style={{ marginTop: 16 }} /> : null}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.state}>
      <View style={[styles.iconWrap, { backgroundColor: t.colors.dangerSoft }]}>
        <Ionicons name="cloud-offline-outline" size={28} color={t.colors.danger} />
      </View>
      <Text variant="h3" center style={{ marginTop: 14 }}>
        Something went wrong
      </Text>
      <Text variant="small" tone="muted" center style={{ marginTop: 6, maxWidth: 280 }}>
        {message ?? "We couldn't load this right now."}
      </Text>
      {onRetry ? <Button title="Try again" onPress={onRetry} variant="secondary" size="sm" full={false} style={{ marginTop: 16 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  skCard: { backgroundColor: t.colors.surface, borderRadius: 20, padding: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  state: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 20 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: t.colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
