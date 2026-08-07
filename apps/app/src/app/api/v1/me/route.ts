import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import { handleRouteError, requireSessionUser } from "@/lib/auth-context";
import { getMeProfile } from "@/services/users/me";
import { updateUserName } from "@/services/users/update-profile";

const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function GET(request: Request) {
  try {
    const session = await requireSessionUser(request);
    const profile = await getMeProfile(
      session.userId,
      session.email,
      session.name
    );

    return Response.json(profile);
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireSessionUser(request);
    const body = await parseJsonBody(request, updateMeSchema);
    const profile = await updateUserName(
      session.userId,
      body.name,
      session.email
    );

    return Response.json(profile);
  }
  catch (error) {
    return handleRouteError(error);
  }
}
