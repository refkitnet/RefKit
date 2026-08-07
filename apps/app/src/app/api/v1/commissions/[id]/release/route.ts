import { handleRouteError, requireSession } from "@/lib/auth-context";
import {
  releaseFlaggedCommission,
  serializeCommissionEntry,
} from "@/services/commissions";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id } = await context.params;
    const entry = await releaseFlaggedCommission(session.userId, id);

    return Response.json(serializeCommissionEntry(entry));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
