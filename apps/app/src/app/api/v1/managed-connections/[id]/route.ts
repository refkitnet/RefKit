import {
  handleRouteError,
  requireManagedConnectionDeleteKey,
} from "@/lib/auth-context";
import {
  redactManagedConnection,
  requireManagedConnectionAccess,
} from "@/services/managed-connections";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const auth = await requireManagedConnectionDeleteKey(request, id);

    if (auth.connectionStatus !== "redacted") {
      await requireManagedConnectionAccess(auth.managedAccountId, id);
    }

    return Response.json(await redactManagedConnection(id));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
