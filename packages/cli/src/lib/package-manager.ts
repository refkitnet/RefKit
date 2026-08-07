import { existsSync } from "node:fs";
import { join } from "node:path";

export type PackageManager = "npm" | "yarn" | "pnpm" | "bun";

export function detectPackageManager(cwd = process.cwd()): PackageManager {
  if (existsSync(join(cwd, "bun.lockb")) || existsSync(join(cwd, "bun.lock"))) {
    return "bun";
  }

  if (existsSync(join(cwd, "pnpm-lock.yaml"))) {
    return "pnpm";
  }

  if (existsSync(join(cwd, "yarn.lock"))) {
    return "yarn";
  }

  if (existsSync(join(cwd, "package-lock.json"))) {
    return "npm";
  }

  return "npm";
}

export function getInstallCommand(packageManager: PackageManager, pkg: string) {
  if (packageManager === "yarn") {
    return ["yarn", "add", pkg];
  }

  if (packageManager === "pnpm") {
    return ["pnpm", "add", pkg];
  }

  if (packageManager === "bun") {
    return ["bun", "add", pkg];
  }

  return ["npm", "install", pkg];
}
