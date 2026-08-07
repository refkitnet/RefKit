#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = dirname(dirname(dirname(scriptDir)));

function run(label, command, args) {
  console.log(`\n> ${label}`);
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("Start local Postgres and migrate", "npm", ["run", "test:db", "-w", "@refkitnet/app"]);
run("Build app", "npm", ["run", "build:app"]);

console.log("\nSetup test complete.");
console.log("Start dev server: npm run dev:app");
console.log("Health check: http://localhost:3000/api/health");
