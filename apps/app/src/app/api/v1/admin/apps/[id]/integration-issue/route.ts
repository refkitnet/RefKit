import { z } from "zod";
import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { markIntegrationIssue, serializeAdminApp } from "@/services/admin";

const bodySchema = z.object({
  note: z.string().nullable().optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    const body = await parseJsonBody(request, bodySchema);
    const app = await markIntegrationIssue(
      admin.userId,
      id,
      body.note ?? null
    );

    return Response.json(serializeAdminApp(app));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
