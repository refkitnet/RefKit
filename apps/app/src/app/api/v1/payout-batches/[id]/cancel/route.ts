import { handleRouteError, requireSession } from "@/lib/auth-context";
import {
  cancelPayoutRun,
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
    const session = await requireSession(request);
    const { id } = await context.params;
    const run = await cancelPayoutRun(session.userId, id);

    return Response.json(serializePayoutRun(run));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
