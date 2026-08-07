import { handleRouteError, requireSession } from "@/lib/auth-context";
import {
  dispatchPayoutBatch,
  serializePayoutExecution,
} from "@/services/payouts";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id } = await context.params;
    const executions = await dispatchPayoutBatch(session.userId, id);

    return Response.json(
      { data: executions.map(serializePayoutExecution) },
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
