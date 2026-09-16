import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { create } from "zustand";
import { Text, shadowStrong, t } from "@/ui";

type Kind = "info" | "success" | "error" | "status";
interface ToastItem {
  id: number;
  title: string;
  body?: string;
  kind: Kind;
  onPress?: () => void;
}
interface ToastStore {
  items: ToastItem[];
  show: (item: Omit<ToastItem, "id">) => void;
  dismiss: (id: number) => void;
}
let seq = 0;
export const useToast = create<ToastStore>((set) => ({
  items: [],
  show: (item) => {
    const id = ++seq;
    set((s) => ({ items: [...s.items.slice(-2), { ...item, id }] }));
    setTimeout(() => set((s) => ({ items: s.items.filter((i) => i.id !== id) })), item.kind === "error" ? 5000 : 3800);
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
}));

export const toast = {
  info: (title: string, body?: string) => useToast.getState().show({ title, body, kind: "info" }),
  success: (title: string, body?: string) => useToast.getState().show({ title, body, kind: "success" }),
  error: (title: string, body?: string) => useToast.getState().show({ title, body, kind: "error" }),
  status: (title: string, body?: string, onPress?: () => void) => useToast.getState().show({ title, body, kind: "status", onPress }),
};

const icons: Record<Kind, keyof typeof Ionicons.glyphMap> = { info: "information-circle", success: "checkmark-circle", error: "alert-circle", status: "notifications" };
const colors: Record<Kind, string> = { info: t.colors.info, success: t.colors.success, error: t.colors.danger, status: t.colors.primary };

function ToastView({ item }: { item: ToastItem }) {
  const y = useRef(new Animated.Value(-20)).current;
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([Animated.spring(y, { toValue: 0, useNativeDriver: true, damping: 14 }), Animated.timing(o, { toValue: 1, duration: 200, useNativeDriver: true })]).start();
  }, [y, o]);
  return (
    <Animated.View style={[styles.toast, shadowStrong, { transform: [{ translateY: y }], opacity: o }]}>
      <Pressable
        style={styles.inner}
        onPress={() => {
          useToast.getState().dismiss(item.id);
          item.onPress?.();
        }}
        accessibilityRole="alert"
      >
        <View style={[styles.icon, { backgroundColor: colors[item.kind] + "22" }]}>
          <Ionicons name={icons[item.kind]} size={20} color={colors[item.kind]} />
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {item.title}
          </Text>
          {item.body ? (
            <Text variant="small" tone="muted" numberOfLines={2}>
              {item.body}
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const items = useToast((s) => s.items);
  const insets = useSafeAreaInsets();
  const [top] = useState(insets.top);
  if (!items.length) return null;
  return (
    <View pointerEvents="box-none" style={[styles.host, { top: top + 8 }]}>
      {items.map((i) => (
        <ToastView key={i.id} item={i} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  host: { position: "absolute", left: 16, right: 16, gap: 8, zIndex: 1000 },
  toast: { backgroundColor: t.colors.surface, borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: t.colors.border },
  inner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
});
