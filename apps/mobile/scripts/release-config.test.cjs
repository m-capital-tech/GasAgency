const assert = require("node:assert/strict");
const test = require("node:test");
const { collectReleaseConfigurationErrors } = require("./release-config.cjs");

const validConfig = {
  owner: "m-capital",
  name: "Munna Gas Connect",
  slug: "munna-gas-connect",
  scheme: "munnagasconnect",
  ios: { bundleIdentifier: "com.munnagas.connect" },
  android: { package: "com.munnagas.connect" },
  extra: { eas: { projectId: "4843ac47-13e9-4126-9874-77d49dc47aa2" } },
};
const validEasConfig = {
  build: {
    preview: { channel: "preview", environment: "preview" },
    production: { channel: "production", environment: "production" },
  },
};
const validEnv = {
  EXPO_PUBLIC_PLATFORM_API_URL: "https://commercial-lpg.example.com",
  EXPO_PUBLIC_PRIVACY_POLICY_URL: "https://www.example.com/privacy",
  EXPO_PUBLIC_DEMO_MODE: "false",
  EXPO_PUBLIC_PUSH_REGISTRATION_ENABLED: "false",
};

test("accepts a complete production release configuration", () => {
  assert.deepEqual(
    collectReleaseConfigurationErrors({ profile: "production", config: validConfig, easConfig: validEasConfig, env: validEnv }),
    [],
  );
});

test("rejects the temporary product identity for production only", () => {
  const config = {
    ...validConfig,
    owner: undefined,
    name: "GasSetu",
    slug: "gassetu",
    scheme: "gassetu",
    ios: { bundleIdentifier: "com.gassetu.demo" },
    android: { package: "com.gassetu.demo" },
  };
  const productionErrors = collectReleaseConfigurationErrors({ profile: "production", config, easConfig: validEasConfig, env: validEnv });
  assert.equal(productionErrors.length, 6);
  assert.deepEqual(
    collectReleaseConfigurationErrors({ profile: "preview", config, easConfig: validEasConfig, env: validEnv }),
    [],
  );
});

test("rejects unsafe release endpoints and demo mode", () => {
  const errors = collectReleaseConfigurationErrors({
    profile: "production",
    config: validConfig,
    easConfig: validEasConfig,
    env: {
      EXPO_PUBLIC_PLATFORM_API_URL: "http://192.168.1.20:8080/v1/",
      EXPO_PUBLIC_PRIVACY_POLICY_URL: "http://localhost:3000/privacy#draft",
      EXPO_PUBLIC_DEMO_MODE: "true",
      EXPO_PUBLIC_PUSH_REGISTRATION_ENABLED: "sometimes",
    },
  });
  assert.ok(errors.some((error) => error.includes("HTTPS")));
  assert.ok(errors.some((error) => error.includes("private network")));
  assert.ok(errors.some((error) => error.includes("origin without a path")));
  assert.ok(errors.some((error) => error.includes("must not end with a slash")));
  assert.ok(errors.some((error) => error.includes("DEMO_MODE")));
  assert.ok(errors.some((error) => error.includes("PUSH_REGISTRATION_ENABLED")));
  assert.ok(errors.some((error) => error.includes("PRIVACY_POLICY_URL must use HTTPS")));
  assert.ok(errors.some((error) => error.includes("PRIVACY_POLICY_URL cannot target localhost")));
  assert.ok(errors.some((error) => error.includes("PRIVACY_POLICY_URL cannot contain a fragment")));
});

test("rejects missing project linkage and mismatched EAS routing", () => {
  const errors = collectReleaseConfigurationErrors({
    profile: "preview",
    config: { ...validConfig, extra: {} },
    easConfig: { build: { preview: { channel: "production", environment: "production" } } },
    env: validEnv,
  });
  assert.ok(errors.some((error) => error.includes("project UUID")));
  assert.ok(errors.some((error) => error.includes("update channel")));
  assert.ok(errors.some((error) => error.includes("EAS environment")));
});

test("rejects a different production Expo owner or project", () => {
  const errors = collectReleaseConfigurationErrors({
    profile: "production",
    config: {
      ...validConfig,
      owner: "another-owner",
      extra: { eas: { projectId: "324a4054-6885-4c9d-a550-75f51f6eae1a" } },
    },
    easConfig: validEasConfig,
    env: validEnv,
  });
  assert.ok(errors.some((error) => error.includes('owner must remain "m-capital"')));
  assert.ok(errors.some((error) => error.includes('project must remain "4843ac47-13e9-4126-9874-77d49dc47aa2"')));
});

test("requires the Android Firebase client file when push registration is enabled", () => {
  const errors = collectReleaseConfigurationErrors({
    profile: "production",
    config: validConfig,
    easConfig: validEasConfig,
    env: { ...validEnv, EXPO_PUBLIC_PUSH_REGISTRATION_ENABLED: "true" },
  });
  assert.ok(errors.some((error) => error.includes("GOOGLE_SERVICES_JSON")));

  assert.deepEqual(
    collectReleaseConfigurationErrors({
      profile: "production",
      config: validConfig,
      easConfig: validEasConfig,
      env: {
        ...validEnv,
        EXPO_PUBLIC_PUSH_REGISTRATION_ENABLED: "true",
        GOOGLE_SERVICES_JSON: "/eas/files/google-services.json",
      },
    }),
    [],
  );
});

test("does not apply release-only checks to local development", () => {
  assert.deepEqual(
    collectReleaseConfigurationErrors({ profile: "development", config: {}, easConfig: {}, env: {} }),
    [],
  );
});
