import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, t } from "@/ui";
import type { MapPickerProps } from "./MapPicker";

const PRESETS = [
  { label: "Amberpet", lat: 17.3961, lng: 78.5211 },
  { label: "Kukatpally", lat: 17.4849, lng: 78.4138 },
  { label: "Gachibowli", lat: 17.4401, lng: 78.3489 },
  { label: "Secunderabad", lat: 17.4399, lng: 78.4983 },
];

export function MapPicker({ value, onChange, height = 220 }: MapPickerProps) {
  return (
    <View style={[styles.wrap, { height }]}>
      <Ionicons name="location" size={40} color={t.colors.primary} />
      <Text variant="small" tone="muted">
        Pin: {value.lat.toFixed(4)}, {value.lng.toFixed(4)}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center", paddingHorizontal: 12 }}>
        {PRESETS.map((p) => (
          <Pressable key={p.label} onPress={() => onChange({ lat: p.lat, lng: p.lng })} style={[styles.chip, value.lat === p.lat && { backgroundColor: t.colors.navy }]}>
            <Text variant="caption" style={{ color: value.lat === p.lat ? "#fff" : t.colors.ink }}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, backgroundColor: "#EEF2F5", alignItems: "center", justifyContent: "center", gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: t.colors.border },
});
