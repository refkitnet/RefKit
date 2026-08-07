import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { adminDisableAffiliate } from "@/services/admin";
import { serializeAffiliate } from "@/services/affiliates";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    const affiliate = await adminDisableAffiliate(admin.userId, id);

    return Response.json(serializeAffiliate(affiliate));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
