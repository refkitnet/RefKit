import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { parseJsonBody } from "@/lib/api";
import { handleRouteError } from "@/lib/auth-context";
import { AppError } from "@/lib/errors";
import {
  deploymentCapabilityUnavailableResponse,
  isSelfHosted,
} from "@/lib/deployment";
import { assertDevStripeTestingEnabled } from "@/services/stripe/config";
import {
  injectChargeRefundedEvent,
  injectCheckoutCompletedEvent,
} from "@/services/stripe/test-inject";

const injectSchema = z.discriminatedUnion("scenario", [
  z.object({
    scenario: z.literal("checkout.session.completed"),
    app_id: z.string().trim().min(1),
    session_id: z.string().trim().min(1).optional(),
    amount: z.number().int().positive().optional(),
    currency: z.string().trim().optional(),
    metadata: z.record(z.string()),
  }),
  z.object({
    scenario: z.literal("charge.refunded"),
    app_id: z.string().trim().min(1),
    charge_id: z.string().trim().min(1),
    amount: z.number().int().positive(),
    currency: z.string().trim().optional(),
    metadata: z.record(z.string()),
  }),
]);

function authorizeDevRequest(request: Request) {
  const authHeader = request.headers.get("authorization");

  if (
    !process.env.DEV_API_SECRET ||
    authHeader !== `Bearer ${process.env.DEV_API_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

export async function POST(request: Request) {
  if (isSelfHosted()) {
    return deploymentCapabilityUnavailableResponse();
  }

  const unauthorized = authorizeDevRequest(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    assertDevStripeTestingEnabled();
  }
  catch (error) {
    return NextResponse.json(
      {
        error: {
          type: "forbidden",
          code: "dev_stripe_disabled",
          message:
            error instanceof Error
              ? error.message
              : "Dev Stripe testing is disabled.",
        },
      },
      { status: 403 }
    );
  }

  try {
    const body = await parseJsonBody(request, injectSchema);

    if (body.scenario === "checkout.session.completed") {
      const result = await injectCheckoutCompletedEvent({
        appId: body.app_id,
        sessionId: body.session_id,
        amount: body.amount,
        currency: body.currency,
        metadata: body.metadata,
      });

      return NextResponse.json({
        status: "processed",
        stripe_event_id: result.storedEvent?.id ?? null,
        session_id: result.sessionId,
        charge_id: result.chargeId,
      });
    }

    const storedEvent = await injectChargeRefundedEvent({
      appId: body.app_id,
      chargeId: body.charge_id,
      amount: body.amount,
      currency: body.currency,
      metadata: body.metadata,
    });

    return NextResponse.json({
      status: "processed",
      stripe_event_id: storedEvent?.id ?? null,
    });
  }
  catch (error) {
    if (
      error instanceof ZodError
      || (error instanceof AppError && error.code === "invalid_request_body")
    ) {
      return handleRouteError(error);
    }

    console.error(error);

    return NextResponse.json(
      {
        error: {
          type: "invalid_request",
          code: "inject_failed",
          message:
            error instanceof Error ? error.message : "Could not inject event.",
        },
      },
      { status: 400 }
    );
  }
}
