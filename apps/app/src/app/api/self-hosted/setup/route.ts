import { z } from "zod";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { handleRouteError } from "@/lib/auth-context";
import { AppError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  bootstrapSelfHostedAdministrator,
  getSelfHostedBootstrapStatus,
} from "@/services/self-hosted/bootstrap";

const setupSchema = z.object({
  setup_token: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  organization_name: z.string().trim().min(1).max(120),
});

export async function GET() {
  try {
    const status = await getSelfHostedBootstrapStatus();
    return Response.json({ setup_required: status.setupRequired });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await checkRateLimit("self_hosted_bootstrap", 10);
    const body = await parseJsonBody(request, setupSchema);
    const result = await bootstrapSelfHostedAdministrator({
      setupToken: body.setup_token,
      name: body.name,
      email: body.email,
      organizationName: body.organization_name,
    });

    try {
      await auth.api.signInMagicLink({
        body: {
          email: result.administrator.email,
          name: result.administrator.name ?? body.name,
          callbackURL: "/",
          metadata: { type: "account_signup" },
        },
        headers: request.headers,
      });
    }
    catch (error) {
      console.error("Self-Hosted administrator email delivery failed.", error);
      throw new AppError(
        "internal",
        "setup_email_delivery_failed",
        "The administrator was created, but the sign-in email could not be sent. Repair email configuration, then sign in with the administrator email.",
        503
      );
    }

    return Response.json({ status: true }, { status: 202 });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
