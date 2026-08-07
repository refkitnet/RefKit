import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import {
  handleRouteError,
  requireLiveAppScopedKey,
} from "@/lib/auth-context";
import { AppError } from "@/lib/errors";
import {
  markPayoutExecutionSucceeded,
  serializePayoutExecution,
} from "@/services/payouts";

const succeededSchema = z.object({
  external_reference: z.string().trim().min(1).max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ executionId: string }> }
) {
  try {
    const auth = await requireLiveAppScopedKey(request);
    const { executionId } = await context.params;
    const body = await parseJsonBody(request, succeededSchema);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();

    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new AppError(
        "invalid_request",
        "idempotency_key_required",
        "Provide an Idempotency-Key header of at most 255 characters.",
        400
      );
    }

    const actorId = auth.userId ?? auth.managedAccountId;

    if (!actorId) {
      throw new AppError("unauthorized", "invalid_api_key", "Invalid API key.", 401);
    }

    const execution = await markPayoutExecutionSucceeded(
      actorId,
      auth.appId,
      executionId,
      {
        externalReference: body.external_reference,
        idempotencyKey,
      }
    );

    return Response.json(serializePayoutExecution(execution));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
