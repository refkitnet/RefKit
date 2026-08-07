import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { assertDeploymentCapability } from "@/lib/deployment";
import {
  disconnectStripeConnectionForApp,
  serializeStripeConnection,
} from "@/services/stripe/connected-accounts";

const disconnectSchema = z.object({
  app_id: z.string().trim().min(1),
  livemode: z.boolean().optional(),
});

export async function POST(request: Request) {
  try {
    assertDeploymentCapability("managed_stripe");
    const session = await requireSession(request);
    const body = await parseJsonBody(request, disconnectSchema);
    const connection = await disconnectStripeConnectionForApp(
      session.userId,
      body.app_id,
      { livemode: body.livemode }
    );

    return Response.json({
      connection: serializeStripeConnection(connection),
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
