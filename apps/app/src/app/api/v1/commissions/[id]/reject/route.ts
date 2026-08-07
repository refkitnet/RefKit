import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  rejectFlaggedCommission,
  serializeCommissionEntry,
} from "@/services/commissions";

const rejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id } = await context.params;
    const body = await parseJsonBody(request, rejectSchema).catch(() => ({
      reason: undefined,
    }));
    const entry = await rejectFlaggedCommission(
      session.userId,
      id,
      body.reason
    );

    return Response.json(serializeCommissionEntry(entry));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
