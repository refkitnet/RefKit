import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import {
  getAdminAppOrganizationNames,
  listAdminApps,
  serializeAdminApp,
} from "@/services/admin";

export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const result = await listAdminApps(params);
    const organizationNames = await getAdminAppOrganizationNames(result.data);

    return Response.json({
      data: result.data.map((app) =>
        serializeAdminApp(app, organizationNames.get(app.organizationId) ?? null)
      ),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
