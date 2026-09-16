import type { LatLng } from "@gassetu/shared";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, Line, Path, Pattern, Rect, Text as SvgText } from "react-native-svg";
import { t } from "@/ui";
import type { TrackingMapProps } from "./TrackingMap";

/** Key-free "map card" for web / fallback: a styled grid with the route and markers projected onto it. */
export function TrackingMap({ from, to, route, staff, others = [], height = 260 }: TrackingMapProps) {
  const W = 400, H = height;
  const pts = [from, to, staff, ...(route ?? []), ...others.map((o) => o.location)].filter(Boolean) as LatLng[];
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const minLat = pts.length ? Math.min(...lats) : 17.38, maxLat = pts.length ? Math.max(...lats) : 17.41;
  const minLng = pts.length ? Math.min(...lngs) : 78.5, maxLng = pts.length ? Math.max(...lngs) : 78.53;
  const padLat = Math.max(0.004, (maxLat - minLat) * 0.25), padLng = Math.max(0.004, (maxLng - minLng) * 0.25);
  const x = (p: LatLng) => ((p.lng - (minLng - padLng)) / (maxLng - minLng + 2 * padLng)) * W;
  const y = (p: LatLng) => H - ((p.lat - (minLat - padLat)) / (maxLat - minLat + 2 * padLat)) * H;
  const path = route && route.length > 1 ? route.map((p, i) => `${i ? "L" : "M"} ${x(p)} ${y(p)}`).join(" ") : null;
  const Pin = ({ p, color, label }: { p: LatLng; color: string; label: string }) => (
    <G>
      <Circle cx={x(p)} cy={y(p)} r={11} fill={color} stroke="#fff" strokeWidth={2.5} />
      <SvgText x={x(p)} y={y(p) + 4} fontSize={10} fill="#fff" textAnchor="middle" fontWeight="700">
        {label}
      </SvgText>
    </G>
  );
  return (
    <View style={[styles.wrap, { height }]}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <Defs>
          <Pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <Rect width="28" height="28" fill="#EEF2F5" />
            <Path d="M 28 0 L 0 0 0 28" fill="none" stroke="#DFE5EA" strokeWidth="1" />
          </Pattern>
        </Defs>
        <Rect width={W} height={H} fill="url(#grid)" />
        {/* fake roads */}
        <Line x1={0} y1={H * 0.35} x2={W} y2={H * 0.42} stroke="#fff" strokeWidth={10} />
        <Line x1={W * 0.3} y1={0} x2={W * 0.38} y2={H} stroke="#fff" strokeWidth={8} />
        <Line x1={W * 0.7} y1={0} x2={W * 0.62} y2={H} stroke="#fff" strokeWidth={6} />
        {path ? <Path d={path} stroke={t.colors.primary} strokeWidth={4} fill="none" strokeDasharray="6 5" strokeLinecap="round" /> : null}
        {from ? <Pin p={from} color={t.colors.navy} label="A" /> : null}
        {to ? <Pin p={to} color={t.colors.success} label="H" /> : null}
        {others.map((o) => (
          <Pin key={o.id} p={o.location} color={t.colors.inkMuted} label="•" />
        ))}
        {staff ? (
          <G>
            <Circle cx={x(staff)} cy={y(staff)} r={18} fill={t.colors.primary} opacity={0.2} />
            <Pin p={staff} color={t.colors.primary} label="🛵" />
          </G>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ wrap: { borderRadius: 20, overflow: "hidden", backgroundColor: "#EEF2F5" } });
