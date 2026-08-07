import { z } from "zod";
import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { createBetaUser } from "@/services/admin/users";

const bodySchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  primary_mode: z.enum(["owner", "affiliate"]),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(request);
    const body = await parseJsonBody(request, bodySchema);
    const user = await createBetaUser(
      admin.userId,
      {
        name: body.name,
        email: body.email.trim().toLowerCase(),
        primaryMode: body.primary_mode,
      },
      request.headers
    );

    return Response.json(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        primary_mode: user.primaryMode,
      },
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
