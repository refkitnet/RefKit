import { handleRouteError, requireSession } from "@/lib/auth-context";
import { revokeApiKey } from "@/services/api-keys";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requireSession(request);
    const { id } = await context.params;
    const result = await revokeApiKey(session.userId, id);

    return Response.json(result);
  }
  catch (error) {
    return handleRouteError(error);
  }
}
