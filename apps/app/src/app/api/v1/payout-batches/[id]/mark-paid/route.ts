import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import {
  markPayoutRunPaid,
  serializePayoutRun,
} from "@/services/payouts/payout-batches";

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
    const run = await markPayoutRunPaid(ownerPrincipalId(auth), id);

    return Response.json(serializePayoutRun(run));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
