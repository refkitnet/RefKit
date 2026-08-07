import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const appRoot = join(__dirname, "../..");

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

export function loadE2eEnv() {
  const envPath = join(appRoot, ".env.local");

  if (existsSync(envPath)) {
    const parsed = parseEnvFile(readFileSync(envPath, "utf8"));

    for (const [key, value] of Object.entries(parsed)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  if (!process.env.PLAYWRIGHT_BASE_URL) {
    process.env.PLAYWRIGHT_BASE_URL = "http://localhost:3000";
    process.env.APP_URL = process.env.PLAYWRIGHT_BASE_URL;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for e2e tests. Set it in apps/app/.env.local."
    );
  }
}

export function getBaseUrl() {
  return (
    process.env.PLAYWRIGHT_BASE_URL ??
    process.env.APP_URL ??
    "http://localhost:3000"
  );
}
