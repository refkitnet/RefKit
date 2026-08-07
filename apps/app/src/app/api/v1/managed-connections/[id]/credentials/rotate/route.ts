import {
  handleRouteError,
  requireManagedKey,
} from "@/lib/auth-context";
import {
  requireManagedConnectionAccess,
  rotateManagedCredentials,
} from "@/services/managed-connections";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireManagedKey(request);
    const { id } = await context.params;
    await requireManagedConnectionAccess(auth.managedAccountId, id);
    const result = await rotateManagedCredentials(id);

    return Response.json({
      ...result.connection,
      credentials: {
        management_key: result.credentials.managementKey,
        live_revenue_key: result.credentials.liveRevenueKey,
        test_revenue_key: result.credentials.testRevenueKey,
        acknowledgement_id:
          result.credentials.credentialsAcknowledgementId,
        version: result.credentials.credentialsVersion,
      },
      rotated: result.rotated,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
