import { getStripeWebhookSecrets } from "@/lib/env";
import { getStripeClient } from "@/services/stripe/client";

export function verifyStripeConnectWebhook(
  payload: string,
  signature: string
): Record<string, unknown> {
  const secrets = getStripeWebhookSecrets();

  if (secrets.length === 0) {
    throw new Error("Stripe Connect webhook secrets are not configured.");
  }

  const stripe = getStripeClient();
  let lastError: unknown;

  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(
        payload,
        signature,
        secret
      ) as unknown as Record<string, unknown>;
    }
    catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
