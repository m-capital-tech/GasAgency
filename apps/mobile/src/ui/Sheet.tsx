import { Ionicons } from "@expo/vector-icons";
import { type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./Text";
import { t } from "./theme";

export function Sheet({ open, onClose, title, children, dismissable = true }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; dismissable?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={dismissable ? onClose : undefined}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined} accessibilityLabel="Close" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          {title ? (
            <View style={styles.titleRow}>
              <Text variant="h2">{title}</Text>
              {dismissable ? (
                <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                  <Ionicons name="close" size={22} color={t.colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled" style={{ maxHeight: 560 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(18,38,58,0.45)", justifyContent: "flex-end" },
  sheet: { backgroundColor: t.colors.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: t.colors.border, alignSelf: "center", marginBottom: 12 },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
});
