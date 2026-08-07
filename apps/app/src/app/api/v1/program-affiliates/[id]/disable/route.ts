import { handleRouteError, ownerPrincipalId, requireOwnerAuth } from "@/lib/auth-context";
import { disableAffiliate, serializeAffiliate } from "@/services/affiliates";

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
    const affiliate = await disableAffiliate(ownerPrincipalId(auth), id);

    return Response.json(serializeAffiliate(affiliate));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
