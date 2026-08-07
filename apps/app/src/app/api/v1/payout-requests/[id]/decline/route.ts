import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  declinePayoutRequest,
  serializePayoutRequest,
} from "@/services/payouts/payout-requests";

const declineSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});

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
    const body = await parseJsonBody(request, declineSchema);
    const payoutRequest = await declinePayoutRequest(
      session.userId,
      id,
      body.reason
    );

    return Response.json(serializePayoutRequest(payoutRequest));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
