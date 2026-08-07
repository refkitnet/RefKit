import { z } from "zod";
import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { nonNegativeMinorUnitAmountSchema } from "@/lib/money";
import {
  getDefaultCommissionRule,
  serializeProgram,
  updateProgram,
} from "@/services/programs";
import { requireProgramAccess } from "@/services/scoping";

const updateProgramSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  join_page_enabled: z.boolean().optional(),
  join_page_approval: z.enum(["active", "pending"]).optional(),
  minimum_payout_amount: nonNegativeMinorUnitAmountSchema.optional(),
  supported_payout_methods: z
    .array(z.enum(["paypal", "bank_transfer"]))
    .min(1)
    .optional(),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id } = await context.params;
    const program = await requireProgramAccess(ownerPrincipalId(auth), id);
    const rule = await getDefaultCommissionRule(program.id);

    return Response.json(serializeProgram(program, rule));
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id } = await context.params;
    const body = await parseJsonBody(request, updateProgramSchema);
    const updated = await updateProgram(ownerPrincipalId(auth), id, {
      name: body.name,
      joinPageEnabled: body.join_page_enabled,
      joinPageApproval: body.join_page_approval,
      minimumPayoutAmount: body.minimum_payout_amount,
      supportedPayoutMethods: body.supported_payout_methods,
    });
    const rule = await getDefaultCommissionRule(updated.id);

    return Response.json(serializeProgram(updated, rule));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
