import {
  handleRouteError,
  requireLiveAppScopedKey,
} from "@/lib/auth-context";
import {
  getPayoutExecutionForApp,
  serializePayoutExecutionWithInstructions,
} from "@/services/payouts";

export async function GET(
  request: Request,
  context: { params: Promise<{ executionId: string }> }
) {
  try {
    const auth = await requireLiveAppScopedKey(request);
    const { executionId } = await context.params;
    const execution = await getPayoutExecutionForApp(
      auth.appId,
      executionId
    );

    return Response.json(serializePayoutExecutionWithInstructions(execution));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
