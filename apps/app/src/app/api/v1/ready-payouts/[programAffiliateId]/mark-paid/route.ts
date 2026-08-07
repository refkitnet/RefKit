import { z } from "zod";
import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { markReadyPayoutPaid } from "@/services/payouts/ready-payouts";

const markPaidSchema = z.object({
  program_id: z.string().trim().min(1),
  external_reference: z.string().trim().min(1).max(200).optional(),
});

type RouteContext = {
  params: Promise<{ programAffiliateId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const auth = await requireOwnerAuth(request);
    const { programAffiliateId } = await context.params;
    const body = await parseJsonBody(request, markPaidSchema);
    const payout = await markReadyPayoutPaid(
      ownerPrincipalId(auth),
      body.program_id,
      programAffiliateId,
      { externalReference: body.external_reference }
    );

    return Response.json({
      program_id: body.program_id,
      program_affiliate_id: payout.programAffiliateId,
      amount: { amount: payout.amount, currency: payout.currency },
      status: payout.status,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
