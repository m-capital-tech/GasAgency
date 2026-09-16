import { Ionicons } from "@expo/vector-icons";
import type { LatLng } from "@gassetu/shared";
import { StyleSheet, View } from "react-native";
import MapView from "react-native-maps";
import { Text, t } from "@/ui";

export interface MapPickerProps {
  value: LatLng;
  onChange: (p: LatLng) => void;
  height?: number;
}

/** Drag the map; the centre pin is the delivery location. */
export function MapPicker({ value, onChange, height = 220 }: MapPickerProps) {
  return (
    <View style={[styles.wrap, { height }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={{ latitude: value.lat, longitude: value.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
        onRegionChangeComplete={(r) => onChange({ lat: Number(r.latitude.toFixed(5)), lng: Number(r.longitude.toFixed(5)) })}
        showsPointsOfInterests={false}
        pitchEnabled={false}
        rotateEnabled={false}
      />
      <View pointerEvents="none" style={styles.pinWrap}>
        <Ionicons name="location" size={40} color={t.colors.primary} />
      </View>
      <View pointerEvents="none" style={styles.hint}>
        <Text variant="caption" style={{ color: "#fff" }}>
          Drag the map to set your pin
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: "hidden", backgroundColor: "#E8EDF2" },
  pinWrap: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingBottom: 36 },
  hint: { position: "absolute", bottom: 10, alignSelf: "center", backgroundColor: "rgba(18,38,58,0.7)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
});
