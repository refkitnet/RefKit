import { z } from "zod";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { handleRouteError } from "@/lib/auth-context";
import {
  CLOSED_BETA_REGISTER_MESSAGE,
  PRIVATE_INSTANCE_REGISTER_MESSAGE,
} from "@/lib/closed-beta";
import {
  isClosedBetaBypassEmail,
  isClosedBetaEnforced,
} from "@/lib/closed-beta.server";
import { AppError } from "@/lib/errors";
import { isSelfHosted } from "@/lib/deployment";
import { checkRateLimit } from "@/lib/rate-limit";
import { registerPendingUser } from "@/services/users/register";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().email(),
  primary_mode: z.enum(["owner", "affiliate"]),
  callback_url: z
    .string()
    .refine(
      (value) => value.startsWith("/") && !value.startsWith("//"),
      "Must be an app-relative path."
    )
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = await parseJsonBody(request, registerSchema);
    const email = body.email.trim().toLowerCase();

    if (isSelfHosted()) {
      throw new AppError(
        "forbidden",
        "registration_closed",
        PRIVATE_INSTANCE_REGISTER_MESSAGE,
        403
      );
    }

    if (isClosedBetaEnforced() && !isClosedBetaBypassEmail(email)) {
      throw new AppError(
        "forbidden",
        "closed_beta",
        CLOSED_BETA_REGISTER_MESSAGE,
        403
      );
    }

    await checkRateLimit(`signup:${email}`);
    const user = await registerPendingUser({
      name: body.name,
      email,
      primaryMode: body.primary_mode,
    });

    await auth.api.signInMagicLink({
      body: {
        email: user.email,
        name: user.name ?? body.name,
        callbackURL: body.callback_url ?? "/",
        metadata: { type: "account_signup" },
      },
      headers: request.headers,
    });

    return Response.json({ status: true }, { status: 202 });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
