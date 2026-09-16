import { useEffect, useRef, useState } from "react";
import { Animated, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Text, t } from "@/ui";

function arc(cx: number, cy: number, r: number, start: number, end: number) {
  const s = (start * Math.PI) / 180;
  const e = (end * Math.PI) / 180;
  const x1 = cx + r * Math.cos(s), y1 = cy + r * Math.sin(s);
  const x2 = cx + r * Math.cos(e), y2 = cy + r * Math.sin(e);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

/** Semi-circular "gas left" gauge. pct 0–100. */
export function GasGauge({ pct, daysLeft, size = 200 }: { pct: number; daysLeft: number; size?: number }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: pct, duration: 900, useNativeDriver: false }).start();
    const id = anim.addListener(({ value }) => setShown(value));
    return () => anim.removeListener(id);
  }, [pct, anim]);
  const r = size / 2 - 14;
  const cx = size / 2, cy = size / 2;
  const startA = 180, sweep = 180;
  const endA = startA + (sweep * Math.max(0, Math.min(100, shown))) / 100;
  const color = pct <= 20 ? t.colors.primary : pct <= 40 ? t.colors.gold : t.colors.success;
  const tipA = (endA * Math.PI) / 180;
  return (
    <View style={{ alignItems: "center" }} accessibilityLabel={`Gas left ${pct} percent, about ${daysLeft} days`}>
      <Svg width={size} height={size / 2 + 16}>
        <Path d={arc(cx, cy, r, startA, startA + sweep)} stroke={t.colors.border} strokeWidth={16} fill="none" strokeLinecap="round" />
        {shown > 0.5 ? <Path d={arc(cx, cy, r, startA, endA)} stroke={color} strokeWidth={16} fill="none" strokeLinecap="round" /> : null}
        <Circle cx={cx + r * Math.cos(tipA)} cy={cy + r * Math.sin(tipA)} r={6} fill="#fff" stroke={color} strokeWidth={3} />
      </Svg>
      <View style={{ position: "absolute", top: size / 2 - 40, alignItems: "center" }}>
        <Text variant="hero" style={{ color }}>
          {Math.round(shown)}%
        </Text>
        <Text variant="caption" tone="muted">
          gas left (est.)
        </Text>
      </View>
    </View>
  );
}
