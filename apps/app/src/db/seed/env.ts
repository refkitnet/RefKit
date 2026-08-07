import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resetServerEnvCache } from "@/lib/env";

function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
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

export function configureSeedEnv() {
  const appRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const envPath = join(appRoot, ".env.local");

  if (existsSync(envPath)) {
    const parsed = parseEnvFile(readFileSync(envPath, "utf8"));

    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Add it to apps/app/.env.local before seeding."
    );
  }

  process.env.STRIPE_FIXTURE_MODE = "true";
  process.env.EMAIL_DELIVERY = "log";

  const defaults: Record<string, string> = {
    BETTER_AUTH_SECRET:
      "seed-better-auth-secret-at-least-32-chars-long",
    IP_HASH_SALT: "seed-ip-hash-salt-min-16",
    APP_URL: "http://localhost:3000",
    DEV_API_SECRET: "seed-dev-api-secret-min16",
    RESEND_API_KEY: "re_seed_placeholder_key",
    RESEND_FROM_EMAIL: "auth@refkit.net",
    PAYOUT_DETAILS_ENCRYPTION_KEY:
      "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  resetServerEnvCache();
}
