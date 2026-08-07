import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { assertDeploymentCapability } from "@/lib/deployment";
import { assertDevStripeTestingEnabled } from "@/services/stripe/config";
import { ensureSandboxStripeConnection } from "@/services/stripe/test-inject";
import { requireAppAccess } from "@/services/scoping";

const sandboxSchema = z.object({
  app_id: z.string().trim().min(1),
});

async function authorizeSandboxRequest(request: Request, appId: string) {
  const authHeader = request.headers.get("authorization");

  if (
    process.env.DEV_API_SECRET &&
    authHeader === `Bearer ${process.env.DEV_API_SECRET}`
  ) {
    return;
  }

  const session = await requireSession(request);
  await requireAppAccess(session.userId, appId);
}

export async function POST(request: Request) {
  try {
    assertDeploymentCapability("managed_stripe");
    assertDevStripeTestingEnabled();

    const body = await parseJsonBody(request, sandboxSchema);
    await authorizeSandboxRequest(request, body.app_id);

    const connection = await ensureSandboxStripeConnection(body.app_id);

    return NextResponse.json({
      id: connection.id,
      app_id: connection.appId,
      stripe_account_id: connection.stripeAccountId,
      livemode: connection.livemode,
      status: connection.status,
    });
  }
  catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Dev Stripe testing routes are disabled")
    ) {
      return NextResponse.json(
        {
          error: {
            type: "forbidden",
            code: "dev_stripe_disabled",
            message: error.message,
          },
        },
        { status: 403 }
      );
    }

    return handleRouteError(error);
  }
}
