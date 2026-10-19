const RELEASE_PROFILES = new Set(["preview", "production"]);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PACKAGE_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+$/;

function isPrivateHostname(hostname) {
  const normalized = hostname.toLowerCase();
  if (["localhost", "0.0.0.0", "::1"].includes(normalized)) return true;
  if (normalized.endsWith(".localhost") || normalized.endsWith(".local") || normalized.endsWith(".internal")) return true;
  if (/^127\./.test(normalized) || /^10\./.test(normalized) || /^192\.168\./.test(normalized)) return true;
  const match = normalized.match(/^172\.(\d{1,3})\./);
  return match ? Number(match[1]) >= 16 && Number(match[1]) <= 31 : false;
}

function collectReleaseConfigurationErrors({ profile, config, easConfig, env = process.env }) {
  if (!RELEASE_PROFILES.has(profile)) return [];

  const errors = [];
  const profileConfig = easConfig?.build?.[profile];
  const projectId = config?.extra?.eas?.projectId;
  const apiOrigin = env.EXPO_PUBLIC_PLATFORM_API_URL?.trim();

  if (!profileConfig) {
    errors.push(`EAS build profile "${profile}" is missing.`);
  } else {
    if (profileConfig.channel !== profile) {
      errors.push(`EAS profile "${profile}" must publish to the "${profile}" update channel.`);
    }
    if (profileConfig.environment !== profile) {
      errors.push(`EAS profile "${profile}" must use the "${profile}" EAS environment.`);
    }
  }

  if (!UUID_PATTERN.test(projectId ?? "") || projectId === "00000000-0000-0000-0000-000000000000") {
    errors.push("A real Expo EAS project UUID is required in expo.extra.eas.projectId or EXPO_EAS_PROJECT_ID.");
  }

  if (env.EXPO_PUBLIC_DEMO_MODE !== "false") {
    errors.push(`EXPO_PUBLIC_DEMO_MODE must be explicitly set to "false" for ${profile} releases.`);
  }

  if (!apiOrigin) {
    errors.push("EXPO_PUBLIC_PLATFORM_API_URL is required for release builds.");
  } else {
    try {
      const parsed = new URL(apiOrigin);
      if (parsed.protocol !== "https:") errors.push("EXPO_PUBLIC_PLATFORM_API_URL must use HTTPS.");
      if (isPrivateHostname(parsed.hostname)) errors.push("EXPO_PUBLIC_PLATFORM_API_URL cannot target localhost or a private network.");
      if (parsed.username || parsed.password) errors.push("EXPO_PUBLIC_PLATFORM_API_URL cannot contain credentials.");
      if (parsed.search || parsed.hash) errors.push("EXPO_PUBLIC_PLATFORM_API_URL cannot contain a query string or fragment.");
      if (parsed.pathname !== "/") errors.push("EXPO_PUBLIC_PLATFORM_API_URL must be an origin without a path or trailing slash.");
      if (apiOrigin.endsWith("/")) errors.push("EXPO_PUBLIC_PLATFORM_API_URL must not end with a slash.");
    } catch {
      errors.push("EXPO_PUBLIC_PLATFORM_API_URL must be a valid absolute URL.");
    }
  }

  if (!["true", "false"].includes(env.EXPO_PUBLIC_PUSH_REGISTRATION_ENABLED ?? "")) {
    errors.push("EXPO_PUBLIC_PUSH_REGISTRATION_ENABLED must be explicitly set to either \"true\" or \"false\".");
  }

  if (profile === "production") {
    const owner = config?.owner?.trim();
    const name = config?.name?.trim();
    const slug = config?.slug?.trim();
    const scheme = typeof config?.scheme === "string" ? config.scheme.trim() : "";
    const iosBundle = config?.ios?.bundleIdentifier?.trim();
    const androidPackage = config?.android?.package?.trim();

    if (!owner) {
      errors.push("Set the permanent Expo account or organization owner before a production build.");
    }
    if (!name || name.toLowerCase() === "gassetu") {
      errors.push("Replace the temporary GasSetu display name before a production build.");
    }
    if (!slug || slug.toLowerCase() === "gassetu") {
      errors.push("Replace the temporary gassetu Expo slug before a production build.");
    }
    if (!scheme || scheme.toLowerCase() === "gassetu") {
      errors.push("Replace the temporary gassetu deep-link scheme before a production build.");
    }
    if (!PACKAGE_PATTERN.test(iosBundle ?? "") || /(?:^|\.)demo(?:\.|$)/i.test(iosBundle ?? "")) {
      errors.push("Set a permanent, non-demo iOS bundle identifier before a production build.");
    }
    if (!PACKAGE_PATTERN.test(androidPackage ?? "") || /(?:^|\.)demo(?:\.|$)/i.test(androidPackage ?? "")) {
      errors.push("Set a permanent, non-demo Android package before a production build.");
    }
  }

  return errors;
}

function assertReleaseConfiguration(input) {
  const errors = collectReleaseConfigurationErrors(input);
  if (errors.length === 0) return;
  throw new Error(`Unsafe Expo ${input.profile} release configuration:\n- ${errors.join("\n- ")}`);
}

module.exports = { assertReleaseConfiguration, collectReleaseConfigurationErrors };
