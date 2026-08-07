import * as p from "@clack/prompts";
import {
  normalizeWebsiteUrl,
  validateWebsiteUrl,
} from "@refkitnet/validation";
import { ApiRequestError, apiRequest } from "../api.js";

type AppRecord = {
  id: string;
  website_url: string | null;
};

export {
  normalizeWebsiteUrl,
  validateWebsiteUrl,
  normalizeWebsiteUrl as normalizeLandingPageUrl,
  validateWebsiteUrl as validateLandingPageUrl,
};

function printPromptError(error: unknown) {
  if (error instanceof ApiRequestError) {
    p.log.error(error.message);
    return;
  }

  if (error instanceof Error) {
    p.log.error(error.message);
    return;
  }

  p.log.error("Something went wrong.");
}

export async function promptWebsiteUrlInput() {
  const value = await p.text({
    message: "Website URL",
    placeholder: "https://yourapp.com",
    validate: validateWebsiteUrl,
  });

  if (p.isCancel(value)) {
    p.cancel("Cancelled");
    process.exit(0);
  }

  return normalizeWebsiteUrl(value);
}

/** @deprecated Use promptWebsiteUrlInput */
export const promptLandingPageUrlInput = promptWebsiteUrlInput;

export async function fetchAppWebsiteUrl(
  apiUrl: string,
  token: string,
  appId: string
) {
  const app = await apiRequest<AppRecord>(`/v1/apps/${appId}`, {
    apiUrl,
    token,
  });

  return app.website_url ?? null;
}

export async function saveAppWebsiteUrl(
  apiUrl: string,
  token: string,
  appId: string,
  websiteUrl: string
) {
  await apiRequest(`/v1/apps/${appId}`, {
    apiUrl,
    token,
    method: "PATCH",
    body: {
      website_url: websiteUrl,
    },
  });
}

export async function resolveProgramWebsiteUrl(
  apiUrl: string,
  token: string,
  appId: string,
  destinationUrl?: string
) {
  const websiteUrl = await fetchAppWebsiteUrl(apiUrl, token, appId);

  if (destinationUrl) {
    const normalized = normalizeWebsiteUrl(destinationUrl);

    if (!websiteUrl) {
      await saveAppWebsiteUrl(apiUrl, token, appId, normalized);
      return normalized;
    }

    if (normalized !== websiteUrl) {
      throw new Error(
        `Program destination URL must match the app website URL (${websiteUrl}).`
      );
    }

    return websiteUrl;
  }

  if (websiteUrl) {
    return websiteUrl;
  }

  while (true) {
    const url = await promptWebsiteUrlInput();

    try {
      await saveAppWebsiteUrl(apiUrl, token, appId, url);
      return url;
    }
    catch (error) {
      printPromptError(error);
    }
  }
}

/** @deprecated Use resolveProgramWebsiteUrl */
export const resolveProgramLandingPageUrl = resolveProgramWebsiteUrl;

export async function resolveAppWebsiteUrl(destinationUrl?: string) {
  if (!destinationUrl) {
    return promptWebsiteUrlInput();
  }

  return normalizeWebsiteUrl(destinationUrl);
}

/** @deprecated Use resolveAppWebsiteUrl */
export const resolveAppLandingPageUrl = resolveAppWebsiteUrl;
