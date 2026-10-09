import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "commercial-lpg.tenant-session.v1";

export async function readSecureSessionToken(): Promise<string | null> {
  if (Platform.OS === "web") return typeof sessionStorage === "undefined" ? null : sessionStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveSecureSessionToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(TOKEN_KEY, token);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearSecureSessionToken(): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem(TOKEN_KEY);
    return;
  }
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
