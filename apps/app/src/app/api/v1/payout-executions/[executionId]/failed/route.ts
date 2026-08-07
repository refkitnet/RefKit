import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import {
  handleRouteError,
  requireLiveAppScopedKey,
} from "@/lib/auth-context";
import { AppError } from "@/lib/errors";
import {
  markPayoutExecutionFailed,
  serializePayoutExecution,
} from "@/services/payouts";

const failedSchema = z.object({
  failure_reason: z.string().trim().min(1).max(2_000),
  external_reference: z.string().trim().min(1).max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ executionId: string }> }
) {
  try {
    const auth = await requireLiveAppScopedKey(request);
    const { executionId } = await context.params;
    const body = await parseJsonBody(request, failedSchema);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();

    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new AppError(
        "invalid_request",
        "idempotency_key_required",
        "Provide an Idempotency-Key header of at most 255 characters.",
        400
      );
    }

    const execution = await markPayoutExecutionFailed(
      auth.appId,
      executionId,
      {
        failureReason: body.failure_reason,
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
