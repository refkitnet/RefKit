import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { getEmailDeliveryMode } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { sendEmailDiagnostic } from "@/services/emails/send-diagnostic";

export async function POST(request: Request) {
  try {
    const administrator = await requireAdmin(request);
    await checkRateLimit(`email_diagnostic:${administrator.userId}`, 5);

    if (!administrator.email) {
      throw new AppError(
        "invalid_request",
        "admin_email_required",
        "The administrator account needs an email address.",
        400
      );
    }

    await sendEmailDiagnostic(administrator.email);

    return Response.json({
      status: "sent",
      provider: getEmailDeliveryMode(),
      recipient: administrator.email,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
