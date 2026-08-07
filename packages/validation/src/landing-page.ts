export function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Enter a website URL.");
  }

  const localHost = /^(?:localhost|[^/?#]+\.localhost|127\.0\.0\.1)(?::\d+)?(?:[/?#]|$)/i.test(
    trimmed,
  );
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `${localHost ? "http" : "https"}://${trimmed}`;

  try {
    const url = new URL(withProtocol);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new Error("Enter a valid website URL.");
    }

    const hostname = url.hostname.toLowerCase();
    const isLocal =
      hostname === "localhost"
      || hostname.endsWith(".localhost")
      || hostname === "127.0.0.1"
      || hostname === "::1";

    if (!isLocal && !hostname.includes(".")) {
      throw new Error("Enter a valid website URL.");
    }

    return url.toString();
  }
  catch (error) {
    if (error instanceof Error && error.message === "Enter a valid website URL.") {
      throw error;
    }

    throw new Error("Enter a valid website URL.");
  }
}

/** @deprecated Use normalizeWebsiteUrl */
export const normalizeLandingPageUrl = normalizeWebsiteUrl;

export function validateWebsiteUrl(value: string) {
  if (value.trim().length === 0) {
    return "Required.";
  }

  try {
    normalizeWebsiteUrl(value);
    return undefined;
  }
  catch (error) {
    return error instanceof Error
      ? error.message
      : "Enter a valid website URL.";
  }
}

/** @deprecated Use validateWebsiteUrl */
export const validateLandingPageUrl = validateWebsiteUrl;
