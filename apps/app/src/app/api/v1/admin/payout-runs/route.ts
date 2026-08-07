import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import { listAdminPayoutRuns, parseAdminListFilters } from "@/services/admin";
import { serializePayoutRun } from "@/services/payouts/payout-batches";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const filters = parseAdminListFilters(url.searchParams);
    const result = await listAdminPayoutRuns(params, filters);

    return Response.json({
      data: result.data.map((run) => serializePayoutRun(run)),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
