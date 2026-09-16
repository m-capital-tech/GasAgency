import { colors, font, radius, spacing } from "@gassetu/ui-tokens";
import { Platform } from "react-native";

export const t = { colors, font, radius, spacing };

export const shadow = Platform.select({
  ios: { shadowColor: "#12263A", shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
  android: { elevation: 3 },
  default: { boxShadow: "0 4px 12px rgba(18,38,58,0.06)" } as any,
});

export const shadowStrong = Platform.select({
  ios: { shadowColor: "#12263A", shadowOpacity: 0.14, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 8 },
  default: { boxShadow: "0 8px 20px rgba(18,38,58,0.14)" } as any,
});
