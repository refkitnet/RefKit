import { loadConfig, getApiUrl } from "./config.js";

export type AuthCredentials = {
  apiUrl: string;
  sessionToken: string | null;
  affiliateKey: string | null;
  appKey: string | null;
};

export function getCredentials(): AuthCredentials {
  const config = loadConfig();

  return {
    apiUrl: getApiUrl(config),
    sessionToken: process.env.REFKIT_TOKEN ?? config?.token ?? null,
    affiliateKey: process.env.REFKIT_AFFILIATE_KEY ?? null,
    appKey: process.env.REFKIT_API_KEY ?? null,
  };
}

export function requireAppKeyAuth() {
  const credentials = getCredentials();

  if (!credentials.appKey) {
    throw new Error(
      "App API key required. Set REFKIT_API_KEY to an App-scoped test or live key."
    );
  }

  return {
    apiUrl: credentials.apiUrl,
    token: credentials.appKey,
  };
}

export function requireSessionAuth() {
  const credentials = getCredentials();

  if (!credentials.sessionToken) {
    throw new Error(
      "Not authenticated. Run `npx refkitnet auth login` first, or set REFKIT_TOKEN."
    );
  }

  return {
    apiUrl: credentials.apiUrl,
    token: credentials.sessionToken,
  };
}

export function requireAffiliateAuth() {
  const credentials = getCredentials();
  const token = credentials.affiliateKey ?? credentials.sessionToken;

  if (!token) {
    throw new Error(
      "Affiliate auth required. Set REFKIT_AFFILIATE_KEY or run `npx refkitnet auth login`."
    );
  }

  return {
    apiUrl: credentials.apiUrl,
    token,
    usedAffiliateKey: Boolean(credentials.affiliateKey),
  };
}
