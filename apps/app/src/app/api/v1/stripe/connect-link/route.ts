import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { assertDeploymentCapability } from "@/lib/deployment";
import {
  createStripeAppInstallUrl,
  getStripeConnectionForApp,
  serializeStripeConnection,
} from "@/services/stripe/connected-accounts";
import { getStripeRuntimeMode } from "@/services/stripe/config";
import { ensureSandboxStripeConnection } from "@/services/stripe/test-inject";
import { assertAppRevenueSource } from "@/services/revenue/guards";
import { requireAppAccess } from "@/services/scoping";
import { normalizeStripeInstallReturnTo } from "@/lib/stripe-install-return";

const connectLinkSchema = z.object({
  app_id: z.string().trim().min(1),
  return_to: z.string().trim().min(1).optional(),
  livemode: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    assertDeploymentCapability("managed_stripe");
    const session = await requireSession(request);
    const body = await parseJsonBody(request, connectLinkSchema);

    if (getStripeRuntimeMode() === "fixture") {
      await requireAppAccess(session.userId, body.app_id);
      await assertAppRevenueSource(body.app_id, "stripe");
      const connection = await ensureSandboxStripeConnection(body.app_id);

      return Response.json({
        mode: "sandbox",
        url: null,
        connection: serializeStripeConnection(connection),
        message:
          "Platform Stripe is not configured. A local sandbox connection was created for fixture testing.",
      });
    }

    const result = await createStripeAppInstallUrl(
      session.userId,
      body.app_id,
      normalizeStripeInstallReturnTo(body.return_to),
      body.livemode ?? true,
    );
    const existingConnection = await getStripeConnectionForApp(body.app_id);

    return Response.json({
      mode: "stripe_app",
      url: result.url,
      connection: existingConnection
        ? serializeStripeConnection(existingConnection)
        : null,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
