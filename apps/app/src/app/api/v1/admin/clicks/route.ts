import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import { listAdminClicks, parseAdminListFilters } from "@/services/admin";
import { serializeClick } from "@/services/clicks/list";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const filters = parseAdminListFilters(url.searchParams);
    const result = await listAdminClicks(params, filters);

    return Response.json({
      data: result.data.map(serializeClick),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
