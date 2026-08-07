import { AppError } from "@/lib/errors";
import {
  handleRouteError,
  requireAffiliateAuth,
} from "@/lib/auth-context";
import { computePayableBalance } from "@/services/payouts/balance";
import { requireProgramAffiliate } from "@/services/scoping";

export async function GET(request: Request) {
  try {
    const auth = await requireAffiliateAuth(request);
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get("program_id");

    if (!programId) {
      throw new AppError(
        "invalid_request",
        "program_id_required",
        "program_id query parameter is required.",
        400
      );
    }

    const membership = await requireProgramAffiliate(
      auth.userId,
      programId
    );
    const balance = await computePayableBalance(
      membership.id,
      programId
    );

    return Response.json({
      amount: balance.amount,
      currency: balance.currency,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
