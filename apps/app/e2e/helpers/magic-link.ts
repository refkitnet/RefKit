import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getBaseUrl, loadE2eEnv } from "./env";

loadE2eEnv();

const appRoot = join(__dirname, "../..");

export async function closeE2eDb() {
  // Magic links are read from the application log, so there is no helper
  // database connection to close.
}

function readMagicLinkFromLocalEmailLog() {
  const logPath = join(appRoot, ".local", "last-email-links.txt");

  if (!existsSync(logPath)) {
    return null;
  }

  const baseUrl = getBaseUrl().replace(/\/$/, "");
  const links = readFileSync(logPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return [...links]
    .reverse()
    .find((link) => link.startsWith(`${baseUrl}/api/auth/magic-link/verify?`))
    ?? null;
}

export async function waitForMagicLink(
  email: string,
  options: {
    callbackURL?: string;
    timeoutMs?: number;
    preserveCallback?: boolean;
  } = {}
) {
  const callbackURL = options.callbackURL ?? "/";
  const timeoutMs = options.timeoutMs ?? 15_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const loggedLink = readMagicLinkFromLocalEmailLog();

    if (loggedLink) {
      if (options.preserveCallback) {
        return loggedLink;
      }

      const url = new URL(loggedLink);
      url.searchParams.set("callbackURL", callbackURL);
      return url.toString();
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Magic link for ${email} not found within ${timeoutMs}ms.`);
}
