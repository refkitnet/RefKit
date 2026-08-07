import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  handleRouteError,
  requireAffiliateAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  getAffiliatePayoutDetails,
  getAffiliatePayoutDetailsForMethods,
  getPayoutDetailsProgram,
  saveAffiliatePayoutDetails,
} from "@/services/payouts/payout-details";
import type { PayoutMethod } from "@/services/payouts/types";
import { requireProgramAffiliate } from "@/services/scoping";

const payoutDetailsSchema = z.object({
  program_id: z.string().trim().min(1),
  method: z.enum(["paypal", "bank_transfer"]),
  details: z.record(z.unknown()),
});

export async function GET(request: Request) {
  try {
    const auth = await requireAffiliateAuth(request);
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get("program_id");
    const method = searchParams.get("method") as PayoutMethod | null;

    if (!programId) {
      throw new AppError(
        "invalid_request",
        "program_id_required",
        "program_id query parameter is required.",
        400
      );
    }

    const membership = await requireProgramAffiliate(auth.userId, programId);

    const program = await getPayoutDetailsProgram(programId);

    if (method) {
      const details = await getAffiliatePayoutDetails(
        membership.id,
        method,
        program.currency
      );

      return Response.json({
        method,
        details,
      });
    }

    const rows = await getAffiliatePayoutDetailsForMethods(
      membership.id,
      program.supportedPayoutMethods,
      program.currency
    );

    return Response.json({
      data: rows,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAffiliateAuth(request);
    const body = await parseJsonBody(request, payoutDetailsSchema);

    const program = await getPayoutDetailsProgram(body.program_id);

    const membership = await requireProgramAffiliate(auth.userId, body.program_id);

    if (!program.supportedPayoutMethods.includes(body.method)) {
      throw new AppError(
        "invalid_request",
        "payout_method_not_supported",
        "This payout method is not supported by the program.",
        400
      );
    }

    const saved = await saveAffiliatePayoutDetails(
      membership.id,
      body.method,
      body.details,
      program.currency
    );

    return Response.json({
      method: saved.method,
      details: saved.details,
      warnings: saved.warnings,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
