import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { loadE2eEnv } from "./helpers/env";

export default async function globalSetup() {
  loadE2eEnv();

  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required for e2e global setup. Set it in apps/app/.env.local.",
    );
  }

  const appRoot = join(__dirname, "..");
  const runNodeScript = (relativePath: string, args: string[] = []) => {
    execFileSync(process.execPath, [join(appRoot, relativePath), ...args], {
      cwd: appRoot,
      stdio: "inherit",
      env: process.env,
    });
  };

  runNodeScript("scripts/self-hosted/migrate.mjs");
  runNodeScript("scripts/db-seed.mjs", ["--reset"]);
}
