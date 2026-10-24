const base = require("./app.json");
const easConfig = require("./eas.json");
const { assertReleaseConfiguration } = require("./scripts/release-config.cjs");

const projectId = process.env.EXPO_EAS_PROJECT_ID?.trim() || base.expo.extra?.eas?.projectId;
const buildProfile = process.env.EAS_BUILD_PROFILE?.trim();
const googleServicesFile = process.env.GOOGLE_SERVICES_JSON?.trim();

if (process.env.EAS_BUILD === "true" && !projectId) {
  throw new Error("EXPO_EAS_PROJECT_ID is required for EAS builds and updates.");
}

module.exports = ({ config }) => {
  const resolvedConfig = {
    ...config,
    ...base.expo,
    android: {
      ...base.expo.android,
      ...(googleServicesFile ? { googleServicesFile } : {}),
    },
    runtimeVersion: { policy: "appVersion" },
    plugins: [
      ...base.expo.plugins,
      [
        "expo-notifications",
        {
          color: "#A31E21",
          defaultChannel: "account-updates",
          enableRemoteNotifications: true,
          enableBackgroundRemoteNotifications: false,
        },
      ],
    ],
    ...(projectId
      ? {
          updates: {
            url: `https://u.expo.dev/${projectId}`,
            checkAutomatically: "ON_LOAD",
            fallbackToCacheTimeout: 0,
          },
          extra: {
            ...(config.extra ?? {}),
            ...(base.expo.extra ?? {}),
            eas: { projectId },
          },
        }
      : {}),
  };

  if (buildProfile) {
    assertReleaseConfiguration({ profile: buildProfile, config: resolvedConfig, easConfig, env: process.env });
  }

  return resolvedConfig;
};
