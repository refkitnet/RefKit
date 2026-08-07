import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import {
  getAdminOrganizationMemberDetails,
  listAdminOrganizationMembers,
  parseAdminListFilters,
  serializeOrganizationMember,
} from "@/services/admin";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const filters = parseAdminListFilters(url.searchParams);
    const result = await listAdminOrganizationMembers(params, filters);
    const details = await getAdminOrganizationMemberDetails(result.data);

    return Response.json({
      data: result.data.map((member) =>
        serializeOrganizationMember(member, details.get(member.id))
      ),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
