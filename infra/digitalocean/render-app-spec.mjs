import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(directory, "app.production.template.yaml");
const checkOnly = process.argv.includes("--check");
const positional = process.argv.slice(2).filter((argument) => !["--", "--check"].includes(argument));
const outputPath = path.resolve(positional[0] ?? ".do/app.yaml");

function required(name, validate = () => true) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  if (!validate(value)) throw new Error(`${name} is invalid`);
  return value;
}

function optional(name, fallback, validate = () => true) {
  const value = process.env[name] ?? fallback;
  if (!validate(value)) throw new Error(`${name} is invalid`);
  return value;
}

function canonicalBase64Key(value) {
  const decoded = Buffer.from(value, "base64");
  return decoded.length === 32 && decoded.toString("base64").replace(/=+$/, "") === value.replace(/=+$/, "");
}

const runtimeDatabaseUser = required(
  "DO_DATABASE_RUNTIME_USER",
  (value) => /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value),
);
const migrationDatabaseUser = optional(
  "DO_DATABASE_MIGRATION_USER",
  "platform_migrator",
  (value) => /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value),
);
if (migrationDatabaseUser === runtimeDatabaseUser) {
  throw new Error("DO_DATABASE_MIGRATION_USER must differ from DO_DATABASE_RUNTIME_USER");
}

const authenticationSecrets = {
  SESSION_TOKEN_PEPPER: required("SESSION_TOKEN_PEPPER", (value) => value.length >= 32),
  OTP_HASH_PEPPER: required("OTP_HASH_PEPPER", (value) => value.length >= 32),
  OTP_DELIVERY_KEY: required("OTP_DELIVERY_KEY", canonicalBase64Key),
  MFA_ENCRYPTION_KEY: required("MFA_ENCRYPTION_KEY", canonicalBase64Key),
  PUSH_TOKEN_ENCRYPTION_KEY: required("PUSH_TOKEN_ENCRYPTION_KEY", canonicalBase64Key),
  MFA_TICKET_PEPPER: required("MFA_TICKET_PEPPER", (value) => value.length >= 32),
};
if (new Set(Object.values(authenticationSecrets)).size !== Object.keys(authenticationSecrets).length) {
  throw new Error("authentication secrets and encryption keys must all be independent values");
}

const objectStorageSecrets = {
  OBJECT_STORAGE_ACCESS_KEY: required("OBJECT_STORAGE_ACCESS_KEY", (value) => value.length >= 8),
  OBJECT_STORAGE_SECRET_KEY: required("OBJECT_STORAGE_SECRET_KEY", (value) => value.length >= 16),
};
if (objectStorageSecrets.OBJECT_STORAGE_ACCESS_KEY === objectStorageSecrets.OBJECT_STORAGE_SECRET_KEY) {
  throw new Error("OBJECT_STORAGE_ACCESS_KEY and OBJECT_STORAGE_SECRET_KEY must differ");
}

const messageIndiaConfig = {
  MESSAGEINDIA_SEND_URL: required("MESSAGEINDIA_SEND_URL", (value) => {
    try { return new URL(value).protocol === "https:"; } catch { return false; }
  }),
  MESSAGEINDIA_USERNAME: required("MESSAGEINDIA_USERNAME"),
  MESSAGEINDIA_API_KEY: required("MESSAGEINDIA_API_KEY", (value) => value.length >= 16),
  MESSAGEINDIA_SENDER_NAME: required("MESSAGEINDIA_SENDER_NAME", (value) => /^[A-Z0-9]{6}$/.test(value)),
  MESSAGEINDIA_ENTITY_ID: required("MESSAGEINDIA_ENTITY_ID", (value) => /^[0-9]{6,30}$/.test(value)),
  MESSAGEINDIA_LOGIN_OTP_TEMPLATE_ID: required("MESSAGEINDIA_LOGIN_OTP_TEMPLATE_ID", (value) => /^[0-9]{6,30}$/.test(value)),
  MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT: required("MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT", (value) => value.length <= 1000 && value.includes("{{code}}")),
  MESSAGEINDIA_RELAY_SIGNING_SECRET: required("MESSAGEINDIA_RELAY_SIGNING_SECRET", (value) => value.length >= 32),
};

const values = new Map([
  ["__GITHUB_REPOSITORY__", required("DO_GITHUB_REPOSITORY", (value) => /^[^/\s]+\/[^/\s]+$/.test(value))],
  ["__GITHUB_BRANCH__", optional("DO_GITHUB_BRANCH", "main", (value) => /^[A-Za-z0-9._/-]+$/.test(value))],
  ["__DATABASE_CLUSTER__", required("DO_DATABASE_CLUSTER", (value) => /^[A-Za-z0-9_-]{2,63}$/.test(value))],
  ["__DATABASE_NAME__", optional("DO_DATABASE_NAME", "platform_staging", (value) => /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(value))],
  ["__DATABASE_RUNTIME_USER__", runtimeDatabaseUser],
  ["__DATABASE_MIGRATION_USER__", migrationDatabaseUser],
  ["__SESSION_TOKEN_PEPPER__", authenticationSecrets.SESSION_TOKEN_PEPPER],
  ["__OTP_HASH_PEPPER__", authenticationSecrets.OTP_HASH_PEPPER],
  ["__OTP_DELIVERY_KEY__", authenticationSecrets.OTP_DELIVERY_KEY],
  ["__MFA_ENCRYPTION_KEY__", authenticationSecrets.MFA_ENCRYPTION_KEY],
  ["__PUSH_TOKEN_ENCRYPTION_KEY__", authenticationSecrets.PUSH_TOKEN_ENCRYPTION_KEY],
  ["__MFA_TICKET_PEPPER__", authenticationSecrets.MFA_TICKET_PEPPER],
  ["__OBJECT_STORAGE_ACCESS_KEY__", objectStorageSecrets.OBJECT_STORAGE_ACCESS_KEY],
  ["__OBJECT_STORAGE_SECRET_KEY__", objectStorageSecrets.OBJECT_STORAGE_SECRET_KEY],
  ["__MESSAGEINDIA_SEND_URL__", messageIndiaConfig.MESSAGEINDIA_SEND_URL],
  ["__MESSAGEINDIA_USERNAME__", messageIndiaConfig.MESSAGEINDIA_USERNAME],
  ["__MESSAGEINDIA_API_KEY__", messageIndiaConfig.MESSAGEINDIA_API_KEY],
  ["__MESSAGEINDIA_SENDER_NAME__", messageIndiaConfig.MESSAGEINDIA_SENDER_NAME],
  ["__MESSAGEINDIA_ENTITY_ID__", messageIndiaConfig.MESSAGEINDIA_ENTITY_ID],
  ["__MESSAGEINDIA_LOGIN_OTP_TEMPLATE_ID__", messageIndiaConfig.MESSAGEINDIA_LOGIN_OTP_TEMPLATE_ID],
  ["__MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT__", messageIndiaConfig.MESSAGEINDIA_LOGIN_OTP_TEMPLATE_TEXT],
  ["__MESSAGEINDIA_RELAY_SIGNING_SECRET__", messageIndiaConfig.MESSAGEINDIA_RELAY_SIGNING_SECRET],
]);

let rendered = await readFile(templatePath, "utf8");
for (const [token, value] of values) rendered = rendered.replaceAll(token, JSON.stringify(value));

const unresolved = rendered.match(/__[A-Z0-9_]+__/g);
if (unresolved) throw new Error(`unresolved template values: ${[...new Set(unresolved)].join(", ")}`);
if (rendered.includes("OTP_LOCAL_CODE") || rendered.includes("LOCAL_MESSAGE_REVEAL_CONTENT")) {
  throw new Error("local-only authentication controls are forbidden in the production spec");
}

if (checkOnly) {
  process.stdout.write("DigitalOcean production App Spec inputs are valid.\n");
} else {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, rendered, { mode: 0o600 });
  await chmod(outputPath, 0o600);
  process.stdout.write(`Rendered git-ignored App Spec to ${outputPath}. It contains secrets; do not commit it.\n`);
}
