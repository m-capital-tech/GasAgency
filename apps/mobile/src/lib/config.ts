import Constants from "expo-constants";
import { Platform } from "react-native";

/** Resolve the mock-API base URL. On a device, reuse the Metro host so LAN demos work without config. */
function resolveApiUrl(): string {
  const env = process.env.EXPO_PUBLIC_API_URL;
  if (env) return env;
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri && Platform.OS !== "web") {
    const host = String(hostUri).split(":")[0];
    if (host && host !== "localhost") return `http://${host}:4000`;
  }
  return "http://localhost:4000";
}

export const API_URL = resolveApiUrl();
export const WS_URL = API_URL.replace(/^http/, "ws") + "/live";
export const DEMO_OTP = "123456";
