import Stripe from "stripe";
import { getStripeSecretKey } from "@/lib/env";
import { isStripeApiConfigured } from "@/services/stripe/config";

const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

const stripeClients = new Map<boolean, Stripe>();

export function getStripeClient(options: { livemode?: boolean } = {}) {
  if (!isStripeApiConfigured()) {
    throw new Error(
      "Stripe platform keys are not configured. Use fixture mode locally or set keys as documented in docs/stripe.md."
    );
  }

  const livemode = options.livemode ?? true;

  if (!stripeClients.has(livemode)) {
    stripeClients.set(
      livemode,
      new Stripe(getStripeSecretKey(livemode), {
        apiVersion: STRIPE_API_VERSION,
      })
    );
  }

  return stripeClients.get(livemode)!;
}

export { STRIPE_API_VERSION };
