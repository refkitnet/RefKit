import { handleRouteError, ownerPrincipalId, requireOwnerAuth } from "@/lib/auth-context";
import {
  getDefaultCommissionRule,
  resumeProgram,
  serializeProgram,
} from "@/services/programs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id } = await context.params;
    const program = await resumeProgram(ownerPrincipalId(auth), id);
    const rule = await getDefaultCommissionRule(program.id);

    return Response.json(serializeProgram(program, rule));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
