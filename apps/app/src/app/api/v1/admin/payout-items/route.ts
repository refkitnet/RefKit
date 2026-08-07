import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import { listAdminPayoutItems } from "@/services/admin";
import { serializePayoutItem } from "@/services/payouts/payout-batches";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const result = await listAdminPayoutItems(params);

    return Response.json({
      data: result.data.map(serializePayoutItem),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
