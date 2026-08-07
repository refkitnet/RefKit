import { closeDb } from "@/db/client";
import { getAdminEmailAllowlist } from "@/lib/env";
import { validateAdminAccess } from "@/services/admin/gate";
import { SEED_USERS } from "@/db/seed/ids";
import {
  buildSeedData,
  getSeedApiKeyLines,
  getSeedScenarioLines,
  getSeedSignInLines,
} from "@/db/seed/build";
import { resetSeedData } from "@/db/seed/reset";
import { seedExists } from "@/db/seed/upsert";

type RunSeedOptions = {
  reset?: boolean;
};

export async function runSeed(options: RunSeedOptions = {}) {
  const reset = options.reset ?? false;

  if (reset) {
    console.log("Resetting seed data...");
    await resetSeedData();
  }
  else if (await seedExists()) {
    console.log("Seed data already present. Running idempotent upsert.");
  }

  await buildSeedData();

  const databaseTarget = (() => {
    try {
      const url = new URL(process.env.DATABASE_URL ?? "");

      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
        return `local Postgres (${url.hostname}:${url.port || "5432"}${url.pathname})`;
      }

      return `remote (${url.hostname})`;
    }
    catch {
      return "unknown";
    }
  })();

  console.log("");
  console.log("Seeded RefKit demo data.");
  console.log(`Database: ${databaseTarget}`);
  console.log("");
  console.log("Sign in locally via magic link (emails log to terminal):");
  for (const line of getSeedSignInLines()) {
    console.log(line);
  }

  const adminEmail = SEED_USERS.admin.email;
  const allowlist = getAdminEmailAllowlist();

  if (!validateAdminAccess(adminEmail, true)) {
    console.log("");
    console.log(
      `  Warning: ${adminEmail} is not on ADMIN_EMAIL_ALLOWLIST - admin panel and /v1/admin routes will be blocked.`
    );
    console.log(
      `  Set ADMIN_EMAIL_ALLOWLIST in apps/app/.env.local (current: ${allowlist.length ? allowlist.join(", ") : "(empty)"}).`
    );
  }
  console.log("");
  console.log("Demo scenarios:");
  for (const line of getSeedScenarioLines()) {
    console.log(line);
  }
  console.log("");
  console.log("Testing guide: apps/app/docs/testing.md");
  console.log("Test API keys:");
  for (const line of getSeedApiKeyLines()) {
    console.log(line);
  }
  console.log("");
  console.log("Re-run with --reset to wipe and recreate seed data.");
}

export async function runSeedCli(argv: string[] = process.argv.slice(2)) {
  const reset = argv.includes("--reset");

  try {
    await runSeed({ reset });
  }
  finally {
    await closeDb();
  }
}
