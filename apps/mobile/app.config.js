const base = require("./app.json");

const projectId = process.env.EXPO_EAS_PROJECT_ID?.trim();

if (process.env.EAS_BUILD === "true" && !projectId) {
  throw new Error("EXPO_EAS_PROJECT_ID is required for EAS builds and updates.");
}

module.exports = ({ config }) => ({
  ...config,
  ...base.expo,
  runtimeVersion: { policy: "appVersion" },
  plugins: [
    ...base.expo.plugins,
    [
      "expo-notifications",
      {
        color: "#A31E21",
        defaultChannel: "orders",
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
});
