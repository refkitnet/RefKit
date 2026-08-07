import { getServerEnv, getStripeWebhookSecrets } from "@/lib/env";

export type StripeRuntimeMode = "live" | "fixture";

export function isLocalDevApp() {
  try {
    const host = new URL(getServerEnv().APP_URL).hostname;
    return host === "localhost" || host === "127.0.0.1";
  }
  catch {
    return false;
  }
}

export function isStripeApiConfigured() {
  return Boolean(getServerEnv().STRIPE_SECRET_KEY);
}

export function isStripeWebhookConfigured() {
  const env = getServerEnv();
  return Boolean(env.STRIPE_SECRET_KEY && getStripeWebhookSecrets().length > 0);
}

export function isStripeAppInstallConfigured() {
  const env = getServerEnv();
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_APP_INSTALL_URL &&
      env.STRIPE_APP_SECRET
  );
}

export function isStripePlatformConfigured() {
  const env = getServerEnv();
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_APP_INSTALL_URL &&
      env.STRIPE_APP_SECRET &&
      getStripeWebhookSecrets().length > 0
  );
}

export function getStripeRuntimeMode(): StripeRuntimeMode {
  if (process.env.STRIPE_FIXTURE_MODE === "true") {
    return "fixture";
  }

  if (process.env.STRIPE_FIXTURE_MODE === "false") {
    return "live";
  }

  if (isLocalDevApp() && !isStripePlatformConfigured()) {
    return "fixture";
  }

  return "live";
}

export function isDevStripeTestingEnabled() {
  return isLocalDevApp() || process.env.STRIPE_FIXTURE_MODE === "true";
}

export function assertDevStripeTestingEnabled() {
  if (!isDevStripeTestingEnabled()) {
    throw new Error("Dev Stripe testing routes are disabled in this environment.");
  }
}
