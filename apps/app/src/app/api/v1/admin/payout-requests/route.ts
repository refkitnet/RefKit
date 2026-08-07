import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import { listAdminPayoutRequests, parseAdminListFilters } from "@/services/admin";
import { serializePayoutRequest } from "@/services/payouts/payout-requests";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const filters = parseAdminListFilters(url.searchParams);
    const result = await listAdminPayoutRequests(params, filters);

    return Response.json({
      data: result.data.map(serializePayoutRequest),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
