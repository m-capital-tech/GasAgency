import type { LatLng } from "@gassetu/shared";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { Ionicons } from "@expo/vector-icons";
import { t } from "@/ui";

export interface TrackingMapProps {
  from?: LatLng | null; // agency
  to?: LatLng | null; // customer
  route?: LatLng[] | null;
  staff?: LatLng | null;
  others?: { id: string; location: LatLng; label?: string }[];
  height?: number;
  interactive?: boolean;
}

const region = (pts: LatLng[]) => {
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return { latitude: (minLat + maxLat) / 2, longitude: (minLng + maxLng) / 2, latitudeDelta: Math.max(0.012, (maxLat - minLat) * 1.6), longitudeDelta: Math.max(0.012, (maxLng - minLng) * 1.6) };
};

export function TrackingMap({ from, to, route, staff, others = [], height = 260, interactive = true }: TrackingMapProps) {
  const ref = useRef<MapView>(null);
  const pts = [from, to, staff, ...others.map((o) => o.location)].filter(Boolean) as LatLng[];
  const initial = pts.length ? region(pts) : { latitude: 17.3933, longitude: 78.5142, latitudeDelta: 0.05, longitudeDelta: 0.05 };
  useEffect(() => {
    if (pts.length > 1) ref.current?.animateToRegion(region(pts), 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from?.lat, to?.lat, route?.length]);
  return (
    <View style={[styles.wrap, { height }]}>
      <MapView ref={ref} style={StyleSheet.absoluteFill} initialRegion={initial} scrollEnabled={interactive} zoomEnabled={interactive} pitchEnabled={false} rotateEnabled={false} showsPointsOfInterests={false} toolbarEnabled={false}>
        {route && route.length > 1 ? <Polyline coordinates={route.map((p) => ({ latitude: p.lat, longitude: p.lng }))} strokeColor={t.colors.primary} strokeWidth={4} lineDashPattern={[1]} /> : null}
        {from ? (
          <Marker coordinate={{ latitude: from.lat, longitude: from.lng }} title="Agency" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.pin, { backgroundColor: t.colors.navy }]}>
              <Ionicons name="storefront" size={14} color="#fff" />
            </View>
          </Marker>
        ) : null}
        {to ? (
          <Marker coordinate={{ latitude: to.lat, longitude: to.lng }} title="Delivery address" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.pin, { backgroundColor: t.colors.success }]}>
              <Ionicons name="home" size={14} color="#fff" />
            </View>
          </Marker>
        ) : null}
        {others.map((o) => (
          <Marker key={o.id} coordinate={{ latitude: o.location.lat, longitude: o.location.lng }} title={o.label} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={[styles.pin, { backgroundColor: t.colors.inkMuted, width: 24, height: 24 }]}>
              <Ionicons name="bicycle" size={12} color="#fff" />
            </View>
          </Marker>
        ))}
        {staff ? (
          <Marker coordinate={{ latitude: staff.lat, longitude: staff.lng }} title="Delivery partner" anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
            <View style={styles.staffPin}>
              <Ionicons name="bicycle" size={16} color="#fff" />
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 20, overflow: "hidden", backgroundColor: "#E8EDF2" },
  pin: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  staffPin: { width: 34, height: 34, borderRadius: 17, backgroundColor: t.colors.primary, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: "#fff" },
});
