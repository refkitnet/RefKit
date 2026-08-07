import { handleRouteError, ownerPrincipalId, requireOwnerAuth } from "@/lib/auth-context";
import { enableAffiliate, serializeAffiliate } from "@/services/affiliates";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id } = await context.params;
    const affiliate = await enableAffiliate(ownerPrincipalId(auth), id);

    return Response.json(serializeAffiliate(affiliate));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
