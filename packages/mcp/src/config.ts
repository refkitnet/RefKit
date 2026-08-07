import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

export function getApiUrl(config: CliConfig | null) {
  if (process.env.REFKIT_API_URL) {
    return process.env.REFKIT_API_URL.replace(/\/$/, "");
  }

  if (config?.api_url) {
    return config.api_url.replace(/\/$/, "");
  }

  return getDefaultApiUrl().replace(/\/$/, "");
}
