import { z } from "zod";
import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { markAffiliatePayoutPaid } from "@/services/payouts/payout-batches";

const markPaidSchema = z.object({
  external_reference: z.string().trim().min(1).max(200).optional(),
});

type RouteContext = {
  params: Promise<{ id: string; programAffiliateId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id, programAffiliateId } = await context.params;
    const body = await parseJsonBody(request, markPaidSchema);
    const payout = await markAffiliatePayoutPaid(
      ownerPrincipalId(auth),
      id,
      programAffiliateId,
      { externalReference: body.external_reference }
    );

    return Response.json({
      program_affiliate_id: payout.programAffiliateId,
      payout_batch_id: payout.payoutBatch.id,
      amount: {
        amount: payout.amount,
        currency: payout.currency,
      },
      status: payout.status,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
