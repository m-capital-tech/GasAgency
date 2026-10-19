#!/usr/bin/env node

const base = require("../app.json");
const easConfig = require("../eas.json");
const { assertReleaseConfiguration } = require("./release-config.cjs");

const profile = process.argv[2];
if (!profile || !["preview", "production"].includes(profile)) {
  process.stderr.write("Usage: node scripts/check-release-config.cjs <preview|production>\n");
  process.exit(2);
}

const profileEnvironment = easConfig.build?.[profile]?.env ?? {};
const env = { ...profileEnvironment, ...process.env };
const projectId = env.EXPO_EAS_PROJECT_ID?.trim() || base.expo.extra?.eas?.projectId;
const config = {
  ...base.expo,
  extra: {
    ...(base.expo.extra ?? {}),
    ...(projectId ? { eas: { projectId } } : {}),
  },
};

try {
  assertReleaseConfiguration({ profile, config, easConfig, env });
  process.stdout.write(`Expo ${profile} release configuration is safe to build.\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
