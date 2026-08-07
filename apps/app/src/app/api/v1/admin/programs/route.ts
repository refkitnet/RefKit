import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import { listAdminPrograms, parseAdminListFilters } from "@/services/admin";
import { serializeProgram } from "@/services/programs";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const filters = parseAdminListFilters(url.searchParams);
    const result = await listAdminPrograms(params, filters);

    return Response.json({
      data: result.data.map((program) => serializeProgram(program, null)),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
