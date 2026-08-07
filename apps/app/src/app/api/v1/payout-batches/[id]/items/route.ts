import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import {
  listPayoutItemsForRunOwner,
  serializePayoutItem,
} from "@/services/payouts/payout-batches";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id } = await context.params;
    const items = await listPayoutItemsForRunOwner(ownerPrincipalId(auth), id);

    return Response.json({
      data: items.map(serializePayoutItem),
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
