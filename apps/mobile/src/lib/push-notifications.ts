import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

const androidChannelId = "account-updates";
let presentationConfigured = false;
let currentRegistration: PushTokenRegistration | null = null;

export interface PushTokenRegistration {
  provider: "expo";
  token: string;
  platform: "android" | "ios";
  projectId: string;
  appVersion: string | null;
}

export type PushRegistrationResult =
  | { status: "registered" }
  | { status: "permission_denied" }
  | { status: "unsupported"; reason: "web" | "expo_go" | "simulator" }
  | { status: "unconfigured"; reason: "missing_eas_project_id" }
  | { status: "failed" };

export function configureNotificationPresentation(): void {
  if (presentationConfigured || Platform.OS === "web") return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  presentationConfigured = true;
}

function allowsNotifications(settings: Notifications.NotificationPermissionsStatus): boolean {
  return settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
}

function easProjectId(): string | null {
  return Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? null;
}

function isExpoGo(): boolean {
  return Constants.expoGoConfig != null;
}

async function prepareAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(androidChannelId, {
    name: "Account and order updates",
    description: "Orders, deliveries, invoices, credit, reminders, and support updates",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 200, 250],
    lightColor: "#A31E21",
  });
}

/** Initializes foreground presentation and the Android notification channel. */
export async function initializeNotificationRuntime(): Promise<void> {
  configureNotificationPresentation();
  await prepareAndroidChannel();
}

/**
 * Requests notification permission, acquires an Expo push token, and hands it to
 * an authenticated application-owned registrar. The token is never logged or
 * persisted by this module.
 */
export async function registerForRemotePushNotifications(
  register: (registration: PushTokenRegistration) => Promise<void>,
): Promise<PushRegistrationResult> {
  if (Platform.OS === "web") return { status: "unsupported", reason: "web" };
  if (isExpoGo()) return { status: "unsupported", reason: "expo_go" };
  if (!Device.isDevice) return { status: "unsupported", reason: "simulator" };

  const projectId = easProjectId();
  if (!projectId) return { status: "unconfigured", reason: "missing_eas_project_id" };

  try {
    await initializeNotificationRuntime();
    let permissions = await Notifications.getPermissionsAsync();
    if (!allowsNotifications(permissions)) permissions = await Notifications.requestPermissionsAsync();
    if (!allowsNotifications(permissions)) return { status: "permission_denied" };

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    const registration: PushTokenRegistration = {
      provider: "expo",
      token: token.data,
      platform: Platform.OS as "android" | "ios",
      projectId,
      appVersion: Constants.expoConfig?.version ?? null,
    };
    await register(registration);
    currentRegistration = registration;
    return { status: "registered" };
  } catch {
    return { status: "failed" };
  }
}

/**
 * Revokes this installation before the authenticated session is destroyed.
 * If the process was restarted, reacquire the stable Expo token only when the
 * user has already granted permission; logout never opens a permission prompt.
 */
export async function revokeRemotePushNotifications(
  revoke: (registration: PushTokenRegistration) => Promise<void>,
): Promise<void> {
  if (Platform.OS === "web" || isExpoGo() || !Device.isDevice) return;

  let registration = currentRegistration;
  if (!registration) {
    const projectId = easProjectId();
    if (!projectId) return;
    const permissions = await Notifications.getPermissionsAsync();
    if (!allowsNotifications(permissions)) return;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    registration = {
      provider: "expo",
      token: token.data,
      platform: Platform.OS as "android" | "ios",
      projectId,
      appVersion: Constants.expoConfig?.version ?? null,
    };
  }

  await revoke(registration);
  currentRegistration = null;
}

export { Notifications };
