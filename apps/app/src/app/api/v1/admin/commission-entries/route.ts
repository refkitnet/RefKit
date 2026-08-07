import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import { listAdminCommissionEntries, parseAdminListFilters } from "@/services/admin";
import { serializeCommissionEntry } from "@/services/commissions";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const filters = parseAdminListFilters(url.searchParams);
    const result = await listAdminCommissionEntries(params, filters);

    return Response.json({
      data: result.data.map(serializeCommissionEntry),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
