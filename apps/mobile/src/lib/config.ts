import Constants from "expo-constants";
import { Platform } from "react-native";

/** On a device, reuse the Metro host so local services work over the development LAN. */
function resolveServiceUrl(environmentValue: string | undefined, port: number): string {
  const env = environmentValue;
  if (env) return env;
  const hostUri = Constants.expoConfig?.hostUri ?? (Constants as any).manifest2?.extra?.expoGo?.debuggerHost;
  if (hostUri && Platform.OS !== "web") {
    const host = String(hostUri).split(":")[0];
    if (host && host !== "localhost") return `http://${host}:${port}`;
  }
  return `http://localhost:${port}`;
}

export const API_URL = resolveServiceUrl(process.env.EXPO_PUBLIC_API_URL, 4000);
export const PLATFORM_API_URL = resolveServiceUrl(process.env.EXPO_PUBLIC_PLATFORM_API_URL, 8080);
export const WS_URL = API_URL.replace(/^http/, "ws") + "/live";
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === "true";
export const PUSH_REGISTRATION_ENABLED = process.env.EXPO_PUBLIC_PUSH_REGISTRATION_ENABLED === "true";
export const DEMO_OTP = "123456";
