import { handleRouteError } from "@/lib/auth-context";
import {
  acknowledgeManagedCredentials,
  requireManagedProvisioningSecret,
} from "@/services/managed-connections";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; ackId: string }> }
) {
  try {
    requireManagedProvisioningSecret(request);
    const { id, ackId } = await context.params;
    const connection = await acknowledgeManagedCredentials(id, ackId);

    return Response.json(connection);
  }
  catch (error) {
    return handleRouteError(error);
  }
}
