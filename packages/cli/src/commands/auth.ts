import * as p from "@clack/prompts";
import type { Command } from "commander";
import { apiRequest, ApiRequestError, handleCommandError } from "../api.js";
import {
  getApiUrl,
  getStoredToken,
  loadConfig,
  requireStoredToken,
  saveConfig,
} from "../config.js";
import { DEVICE_CLIENT_ID, openBrowser, sleep } from "../lib/process.js";

type DeviceCodeResponse = {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
};

type DeviceTokenResponse = {
  access_token?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type MeProfile = {
  email: string | null;
  name: string | null;
  primary_mode: "owner" | "affiliate";
  organizations: Array<{ id: string; name: string }>;
};

async function requestDeviceCode(apiUrl: string) {
  const response = await fetch(`${apiUrl}/api/auth/device/code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: DEVICE_CLIENT_ID,
    }),
  });

  const body = (await response.json()) as DeviceCodeResponse & {
    error?: string;
    error_description?: string;
  };

  if (!response.ok) {
    throw new Error(body.error_description ?? body.error ?? "Device code request failed.");
  }

  return body;
}

async function pollDeviceToken(
  apiUrl: string,
  deviceCode: string,
  intervalSeconds: number
) {
  let pollingInterval = intervalSeconds;

  while (true) {
    await sleep(pollingInterval * 1000);

    const response = await fetch(`${apiUrl}/api/auth/device/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        device_code: deviceCode,
        client_id: DEVICE_CLIENT_ID,
      }),
    });

    const body = (await response.json()) as DeviceTokenResponse;

    if (body.access_token) {
      return body.access_token;
    }

    if (body.error === "authorization_pending") {
      continue;
    }

    if (body.error === "slow_down") {
      pollingInterval += 5;
      continue;
    }

    if (body.error === "access_denied") {
      throw new Error("Access was denied.");
    }

    if (body.error === "expired_token") {
      throw new Error("The device code expired. Run `refkitnet auth login` again.");
    }

    throw new Error(body.error_description ?? body.error ?? "Device authorization failed.");
  }
}

export async function runAuthLogin(options: { apiUrl?: string }) {
  const apiUrl = getApiUrl(loadConfig(), options.apiUrl);

  p.intro("RefKit CLI login");

  const device = await requestDeviceCode(apiUrl);
  const verificationUrl =
    device.verification_uri_complete ??
    `${apiUrl}${device.verification_uri}?user_code=${encodeURIComponent(device.user_code)}`;

  p.log.info(`Verification URL: ${verificationUrl}`);
  p.log.info(`User code: ${device.user_code}`);
  p.log.message("Opening browser...");

  try {
    openBrowser(verificationUrl);
  }
  catch {
    p.log.warn("Could not open a browser automatically. Open the URL above manually.");
  }

  const spinner = p.spinner();
  spinner.start("Waiting for approval");

  let token: string;

  try {
    token = await pollDeviceToken(
      apiUrl,
      device.device_code,
      device.interval ?? 5
    );
  }
  catch (error) {
    spinner.stop("Authorization failed");
    throw error;
  }

  saveConfig({
    api_url: apiUrl,
    token,
  });

  spinner.stop("Authenticated");

  const me = await apiRequest<MeProfile>("/v1/me", {
    apiUrl,
    token,
  });

  const label = me.name ?? me.email ?? "user";
  p.outro(`Logged in as ${label}`);
}

export async function ensureCliSession(options: { apiUrl?: string }) {
  const config = loadConfig();
  const apiUrl = getApiUrl(config, options.apiUrl);

  async function signIn(message: string) {
    p.log.message(message);
    await runAuthLogin({ apiUrl: options.apiUrl });
    const nextConfig = loadConfig();
    const token = getStoredToken(nextConfig);

    if (!token) {
      throw new Error("Authentication failed.");
    }

    return {
      apiUrl: getApiUrl(nextConfig, options.apiUrl),
      token,
    };
  }

  const token = getStoredToken(config);

  if (!token) {
    return signIn(
      "Sign in to link this CLI to your RefKit account. A browser window will open.",
    );
  }

  try {
    await apiRequest<MeProfile>("/v1/me", { apiUrl, token });
    return { apiUrl, token };
  }
  catch (error) {
    if (
      error instanceof ApiRequestError &&
      error.status === 401 &&
      (error.code === "invalid_credentials" || error.code === "missing_credentials")
    ) {
      saveConfig({ api_url: apiUrl });
      return signIn(
        "Saved CLI credentials expired or do not match this API. Signing in again…",
      );
    }

    throw error;
  }
}

export async function runAuthLogout(options: { apiUrl?: string }) {
  const config = loadConfig();
  const apiUrl = getApiUrl(config, options.apiUrl);
  const token = config?.token;

  if (token) {
    try {
      await fetch(`${apiUrl}/api/auth/sign-out`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    }
    catch {
      // Best effort.
    }
  }

  saveConfig({
    api_url: apiUrl,
  });

  p.outro("Logged out");
}

export function registerAuthCommands(program: Command) {
  const auth = program
    .command("auth")
    .description("Authenticate the CLI");

  auth
    .command("login")
    .description("Sign in via device authorization")
    .option("--api-url <url>", "RefKit API base URL")
    .action(async (options: { apiUrl?: string }) => {
      try {
        await runAuthLogin(options);
      }
      catch (error) {
        handleCommandError(error);
      }
    });

  auth
    .command("logout")
    .description("Clear the stored session token")
    .option("--api-url <url>", "RefKit API base URL")
    .action(async (options: { apiUrl?: string }) => {
      try {
        await runAuthLogout(options);
      }
      catch (error) {
        handleCommandError(error);
      }
    });
}

export function getAuthContext(options: { apiUrl?: string }) {
  const config = loadConfig();
  const apiUrl = getApiUrl(config, options.apiUrl);
  const token = requireStoredToken(config);

  return {
    config,
    apiUrl,
    token,
  };
}
