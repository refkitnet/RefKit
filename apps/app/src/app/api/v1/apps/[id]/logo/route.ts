import { AppError } from "@/lib/errors";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { getAppById, serializeApp } from "@/services/apps";
import { removeAppLogo, uploadAppLogo } from "@/services/apps/logo";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new AppError(
        "invalid_request",
        "logo_file_required",
        "A logo file is required.",
        400
      );
    }

    await uploadAppLogo(session.userId, id, file);
    const app = await getAppById(session.userId, id);
    return Response.json(serializeApp(app));
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id } = await context.params;
    await removeAppLogo(session.userId, id);
    const app = await getAppById(session.userId, id);
    return Response.json(serializeApp(app));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
