import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { adminDisableProgram } from "@/services/admin";
import { serializeProgram } from "@/services/programs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    const program = await adminDisableProgram(admin.userId, id);

    return Response.json(serializeProgram(program, null));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
