import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import { assertDeploymentCapability } from "@/lib/deployment";
import {
  listAdminStripeEvents,
  parseAdminListFilters,
  serializeStripeEvent,
} from "@/services/admin";

export async function GET(request: Request) {
  try {
    assertDeploymentCapability("managed_stripe");
    await requireAdmin(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const filters = parseAdminListFilters(url.searchParams);
    const result = await listAdminStripeEvents(params, filters);

    return Response.json({
      data: result.data.map(serializeStripeEvent),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
