import { NextResponse } from "next/server";
import { isStripeWebhookConfigured } from "@/services/stripe/config";
import { receiveVerifiedStripeWebhook } from "@/services/stripe/event-processor";
import { verifyStripeConnectWebhook } from "@/services/stripe/webhook-verify";
import {
  deploymentCapabilityUnavailableResponse,
  isSelfHosted,
} from "@/lib/deployment";

export async function POST(request: Request) {
  if (isSelfHosted()) {
    return deploymentCapabilityUnavailableResponse();
  }

  if (!isStripeWebhookConfigured()) {
    return NextResponse.json(
      {
        error: {
          type: "invalid_request",
          code: "stripe_not_configured",
          message: "Stripe webhooks are not configured on this environment.",
        },
      },
      { status: 503 }
    );
  }

  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      {
        error: {
          type: "invalid_request",
          code: "missing_signature",
          message: "Missing Stripe signature header.",
        },
      },
      { status: 400 }
    );
  }

  let event: Record<string, unknown>;

  try {
    const payload = await request.text();
    event = verifyStripeConnectWebhook(payload, signature);
  }
  catch {
    console.error("Stripe webhook verification failed.");

    return NextResponse.json(
      {
        error: {
          type: "invalid_request",
          code: "webhook_verification_failed",
          message: "Stripe webhook verification failed.",
        },
      },
      { status: 400 }
    );
  }

  try {
    await receiveVerifiedStripeWebhook(event);

    return NextResponse.json({ received: true });
  }
  catch (error) {
    // A non-2xx response makes Stripe redeliver the stored event later.
    console.error(error);

    return NextResponse.json(
      {
        error: {
          type: "internal",
          code: "webhook_processing_failed",
          message: "Stripe webhook could not be processed.",
        },
      },
      { status: 500 }
    );
  }
}
