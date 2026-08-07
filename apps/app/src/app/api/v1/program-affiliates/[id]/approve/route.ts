import { handleRouteError, ownerPrincipalId, requireOwnerAuth } from "@/lib/auth-context";
import { approvePendingAffiliate } from "@/services/affiliates/approve";
import {
  getAffiliateUsers,
  serializeAffiliate,
} from "@/services/affiliates";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id } = await context.params;
    const affiliate = await approvePendingAffiliate(ownerPrincipalId(auth), id);
    const userMap = await getAffiliateUsers([affiliate]);
    const user = userMap.get(affiliate.userId);

    return Response.json(serializeAffiliate(affiliate, user));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
