import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type CliConfig = {
  api_url: string;
  token?: string;
};

export const DEFAULT_API_URL = "https://app.refkit.net";

export function getConfigPath() {
  return join(homedir(), ".refkitnet", "config.json");
}

export function getDefaultApiUrl() {
  return process.env.REFKIT_API_URL ?? DEFAULT_API_URL;
}

export function resolveApiUrl(flag?: string) {
  if (flag) {
    return flag.replace(/\/$/, "");
  }

  return getDefaultApiUrl().replace(/\/$/, "");
}

export function loadConfig(): CliConfig | null {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as CliConfig;

    return {
      api_url: parsed.api_url ?? getDefaultApiUrl(),
      token: parsed.token,
    };
  }
  catch {
    return null;
  }
}

export function saveConfig(config: CliConfig) {
  const configPath = getConfigPath();
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });

  try {
    chmodSync(configPath, 0o600);
  }
  catch {
    // Best effort; ignored on Windows.
  }
}

export function getStoredToken(config: CliConfig | null) {
  return config?.token ?? null;
}

export function requireStoredToken(config: CliConfig | null): string {
  const token = getStoredToken(config);

  if (!token) {
    throw new Error("Not authenticated. Run `refkitnet auth login` first.");
  }

  return token;
}

export function getApiUrl(config: CliConfig | null, flag?: string) {
  if (flag) {
    return resolveApiUrl(flag);
  }

  if (process.env.REFKIT_API_URL) {
    return process.env.REFKIT_API_URL.replace(/\/$/, "");
  }

  if (config?.api_url) {
    return config.api_url.replace(/\/$/, "");
  }

  return resolveApiUrl();
}
