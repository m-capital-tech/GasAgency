import { colors, font, radius, spacing } from "@gassetu/ui-tokens";
import { Platform } from "react-native";

export const t = { colors, font, radius, spacing };

export const shadow = Platform.select({
  ios: { shadowColor: "#1D1D1E", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 3 },
  default: { boxShadow: "0 4px 12px rgba(29,29,30,0.07)" } as any,
});

export const shadowStrong = Platform.select({
  ios: { shadowColor: "#1D1D1E", shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 8 },
  default: { boxShadow: "0 8px 20px rgba(29,29,30,0.16)" } as any,
});
