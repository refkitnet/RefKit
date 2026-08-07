import { handleRouteError, requireSession } from "@/lib/auth-context";
import { getAppSetupStatus } from "@/services/apps/setup-status";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id } = await context.params;
    const status = await getAppSetupStatus(session.userId, id);

    return Response.json(status);
  }
  catch (error) {
    return handleRouteError(error);
  }
}
