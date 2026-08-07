import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { reprocessStripeEvent, serializeStripeEvent } from "@/services/admin";
import { assertDeploymentCapability } from "@/lib/deployment";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    assertDeploymentCapability("managed_stripe");
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    const event = await reprocessStripeEvent(admin.userId, id);

    return Response.json(serializeStripeEvent(event));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
