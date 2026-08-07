import { z } from "zod";
import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { currencyCodeSchema, minorUnitAmountSchema } from "@/lib/money";
import { createCommissionAdjustment } from "@/services/admin";
import { serializeCommissionEntry } from "@/services/commissions";

const bodySchema = z.object({
  program_affiliate_id: z.string().min(1),
  amount: minorUnitAmountSchema.refine((value) => value !== 0, {
    message: "Amount must be non-zero.",
  }),
  currency: currencyCodeSchema,
  reason: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await parseJsonBody(request, bodySchema);
    const entry = await createCommissionAdjustment(admin.userId, {
      programAffiliateId: body.program_affiliate_id,
      amount: body.amount,
      currency: body.currency,
      reason: body.reason,
    });

    return Response.json(serializeCommissionEntry(entry), { status: 201 });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
