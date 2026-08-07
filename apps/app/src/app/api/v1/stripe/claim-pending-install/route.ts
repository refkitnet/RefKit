import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { assertDeploymentCapability } from "@/lib/deployment";
import {
  claimPendingStripeInstall,
  serializeStripeConnection,
} from "@/services/stripe/connected-accounts";

const claimSchema = z.object({
  app_id: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    assertDeploymentCapability("managed_stripe");
    const session = await requireSession(request);
    const body = await parseJsonBody(request, claimSchema);
    const result = await claimPendingStripeInstall({
      userId: session.userId,
      appId: body.app_id,
    });

    return Response.json({
      status: result.status,
      message: "message" in result ? result.message : undefined,
      connection: result.connection
        ? serializeStripeConnection(result.connection)
        : null,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
