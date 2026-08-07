import { AppError } from "@/lib/errors";
import { handleRouteError, requireSessionUser } from "@/lib/auth-context";
import { removeUserPhoto, uploadUserPhoto } from "@/services/users/photo";

export async function POST(request: Request) {
  try {
    const session = await requireSessionUser(request);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new AppError(
        "invalid_request",
        "photo_file_required",
        "A photo file is required.",
        400
      );
    }

    const profile = await uploadUserPhoto(
      session.userId,
      session.email,
      session.name,
      file
    );

    return Response.json(profile);
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await requireSessionUser(request);
    const profile = await removeUserPhoto(
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
