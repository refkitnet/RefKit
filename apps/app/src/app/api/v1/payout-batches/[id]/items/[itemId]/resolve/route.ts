import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  resolvePayoutItem,
  serializePayoutItem,
} from "@/services/payouts/payout-batches";

const resolveSchema = z.object({
  status: z.enum(["paid", "failed", "pending"]),
  failure_reason: z.string().trim().min(1).max(500).optional(),
  external_reference: z.string().trim().min(1).max(200).optional(),
});

type RouteContext = {
  params: Promise<{ id: string; itemId: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const session = await requireSession(request);
    const { id, itemId } = await context.params;
    const body = await parseJsonBody(request, resolveSchema);
    const item = await resolvePayoutItem(session.userId, id, itemId, {
      status: body.status,
      failureReason: body.failure_reason,
      externalReference: body.external_reference,
    });

    return Response.json(serializePayoutItem(item));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
