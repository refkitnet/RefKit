import { AppError } from "@/lib/errors";
import { handleRouteError, requireSessionUser } from "@/lib/auth-context";
import { submitSupportRequest } from "@/services/support/submit";
import { assertDeploymentCapability } from "@/lib/deployment";

export async function POST(request: Request) {
  try {
    assertDeploymentCapability("refkit_support");
    const session = await requireSessionUser(request);
    const formData = await request.formData();
    const type = formData.get("type");
    const message = formData.get("message");
    const attachment = formData.get("file");

    if (typeof type !== "string") {
      throw new AppError(
        "invalid_request",
        "invalid_support_request_type",
        "Choose a support topic.",
        400
      );
    }

    if (typeof message !== "string") {
      throw new AppError(
        "invalid_request",
        "support_message_required",
        "Tell us what you need help with.",
        400
      );
    }

    await submitSupportRequest({
      userId: session.userId,
      userEmail: session.email,
      userName: session.name,
      type,
      message,
      attachment: attachment instanceof File && attachment.size > 0
        ? attachment
        : null,
    });

    return Response.json({ ok: true });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
