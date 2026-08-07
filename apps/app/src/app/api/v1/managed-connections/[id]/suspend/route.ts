import { handleRouteError, requireManagedKey } from "@/lib/auth-context";
import {
  requireManagedConnectionAccess,
  suspendManagedConnection,
} from "@/services/managed-connections";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireManagedKey(request);
    const { id } = await context.params;
    await requireManagedConnectionAccess(auth.managedAccountId, id);
    return Response.json(await suspendManagedConnection(id));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
