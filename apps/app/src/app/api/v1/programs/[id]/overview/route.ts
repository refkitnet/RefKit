import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseAppEnvironment } from "@/lib/app-environment";
import { getProgramOverview } from "@/services/programs/overview";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id } = await context.params;
    const environment = parseAppEnvironment(new URL(request.url).searchParams);
    const overview = await getProgramOverview(session.userId, id, {
      environment,
    });

    return Response.json(overview);
  }
  catch (error) {
    return handleRouteError(error);
  }
}
