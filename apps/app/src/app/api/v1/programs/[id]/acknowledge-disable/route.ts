import { handleRouteError, ownerPrincipalId, requireOwnerAuth } from "@/lib/auth-context";
import { acknowledgeProgramDisable } from "@/services/programs/disable";
import { getDefaultCommissionRule, serializeProgram } from "@/services/programs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id } = await context.params;
    const program = await acknowledgeProgramDisable(ownerPrincipalId(auth), id);
    const rule = await getDefaultCommissionRule(program.id);

    return Response.json(serializeProgram(program, rule));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
