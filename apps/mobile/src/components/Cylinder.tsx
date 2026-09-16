import { useId } from "react";
import Svg, { Defs, Ellipse, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/** Stylised LPG cylinder illustration (no brand colours). */
export function Cylinder({ size = 140, color = "#A31E21", dark = "#620A1A" }: { size?: number; color?: string; dark?: string }) {
  const w = size;
  const h = size * 1.35;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const bodyId = `body${uid}`;
  const shineId = `shine${uid}`;
  return (
    <Svg width={w} height={h} viewBox="0 0 100 135" accessibilityLabel="LPG cylinder">
      <Defs>
        <LinearGradient id={bodyId} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={dark} />
          <Stop offset="0.35" stopColor={color} />
          <Stop offset="0.7" stopColor={color} />
          <Stop offset="1" stopColor={dark} />
        </LinearGradient>
        <LinearGradient id={shineId} x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#fff" stopOpacity="0" />
          <Stop offset="0.5" stopColor="#fff" stopOpacity="0.35" />
          <Stop offset="1" stopColor="#fff" stopOpacity="0" />
        </LinearGradient>
      </Defs>
      <Ellipse cx="50" cy="128" rx="34" ry="6" fill="#1D1D1E" opacity="0.12" />
      {/* valve */}
      <Rect x="44" y="4" width="12" height="10" rx="2" fill="#3A3633" />
      <Rect x="38" y="12" width="24" height="6" rx="3" fill="#8B837A" />
      {/* collar */}
      <Path d="M30 30 Q30 18 50 18 Q70 18 70 30 L70 34 L30 34 Z" fill={dark} />
      <Path d="M36 34 L36 22 M64 34 L64 22 M50 34 L50 18" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      {/* body */}
      <Path d="M22 44 Q22 32 50 32 Q78 32 78 44 L78 112 Q78 124 50 124 Q22 124 22 112 Z" fill={`url(#${bodyId})`} />
      <Rect x="30" y="40" width="14" height="78" rx="7" fill={`url(#${shineId})`} />
      {/* foot ring */}
      <Path d="M26 114 Q26 126 50 126 Q74 126 74 114 L74 118 Q74 130 50 130 Q26 130 26 118 Z" fill={dark} />
      {/* flame badge */}
      <Path d="M50 62 C44 70 42 76 46 82 C47 78 49 77 50 74 C51 77 53 78 54 82 C58 76 56 70 50 62 Z" fill="#fff" opacity="0.9" />
    </Svg>
  );
}
