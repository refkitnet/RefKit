import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import { getAffiliateUsers, serializeAffiliate } from "@/services/affiliates";
import {
  listAdminAffiliates,
  parseAdminListFilters,
} from "@/services/admin";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const filters = parseAdminListFilters(url.searchParams);
    const result = await listAdminAffiliates(params, filters);
    const userMap = await getAffiliateUsers(result.data);

    return Response.json({
      data: result.data.map((affiliate) =>
        serializeAffiliate(affiliate, userMap.get(affiliate.userId))
      ),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
