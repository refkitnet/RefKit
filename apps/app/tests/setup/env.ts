import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eqIdx = trimmed.indexOf("=");

    if (eqIdx === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadEnvLocal() {
  const appRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const envPath = join(appRoot, ".env.local");

  if (!existsSync(envPath)) {
    return;
  }

  const parsed = parseEnvFile(readFileSync(envPath, "utf8"));

  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvLocal();

process.env.STRIPE_FIXTURE_MODE = "true";

const databaseUrl =
  process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL or DATABASE_URL must be set (via apps/app/.env.local)."
  );
}

process.env.DATABASE_URL = databaseUrl;

const defaults: Record<string, string> = {
  BETTER_AUTH_SECRET:
    "vitest-better-auth-secret-at-least-32-chars-long",
  IP_HASH_SALT: "vitest-ip-hash-salt-min-16",
  APP_URL: "http://localhost:3000",
  DEV_API_SECRET: "vitest-dev-api-secret-min16",
  RESEND_API_KEY: "re_vitest_placeholder_key",
  RESEND_FROM_EMAIL: "auth@refkit.net",
  MANAGED_CONNECTIONS_PROVISIONING_SECRET:
    "vitest-managed-provisioning-secret-32-chars",
  PAYOUT_DETAILS_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

for (const [key, value] of Object.entries(defaults)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

// Always log email in Vitest - never call Resend from integration tests.
process.env.EMAIL_DELIVERY = "log";
