import { handleRouteError, ownerPrincipalId, requireOwnerAuth } from "@/lib/auth-context";
import {
  listReadyPayouts,
  serializeReadyPayout,
} from "@/services/payouts/ready-payouts";

export async function GET(request: Request) {
  try {
    const auth = await requireOwnerAuth(request);
    const programId = new URL(request.url).searchParams.get("program_id");

    if (!programId) {
      return Response.json(
        {
          error: {
            type: "invalid_request",
            code: "program_scope_required",
            message: "program_id query parameter is required.",
          },
        },
        { status: 400 }
      );
    }

    const payouts = await listReadyPayouts(ownerPrincipalId(auth), programId);

    return Response.json({
      data: payouts.map(serializeReadyPayout),
      has_more: false,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
