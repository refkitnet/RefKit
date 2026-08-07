import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { parseJsonBody } from "@/lib/api";
import { handleRouteError } from "@/lib/auth-context";
import {
  CLOSED_BETA_UNKNOWN_EMAIL_MESSAGE,
  PRIVATE_INSTANCE_UNKNOWN_EMAIL_MESSAGE,
} from "@/lib/closed-beta";
import {
  isClosedBetaBypassEmail,
  isClosedBetaEnforced,
} from "@/lib/closed-beta.server";
import { AppError } from "@/lib/errors";
import { isSelfHosted } from "@/lib/deployment";
import { checkRateLimit } from "@/lib/rate-limit";

const signInSchema = z.object({
  email: z.string().email(),
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
    const body = await parseJsonBody(request, signInSchema);
    const email = body.email.trim().toLowerCase();

    await checkRateLimit(`signin:${email}`);

    if (isSelfHosted() || isClosedBetaEnforced()) {
      const [user] = await getDb()
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (
        !user
        && (isSelfHosted() || !isClosedBetaBypassEmail(email))
      ) {
        throw new AppError(
          "forbidden",
          isSelfHosted() ? "registration_closed" : "closed_beta",
          isSelfHosted()
            ? PRIVATE_INSTANCE_UNKNOWN_EMAIL_MESSAGE
            : CLOSED_BETA_UNKNOWN_EMAIL_MESSAGE,
          403
        );
      }
    }

    await auth.api.signInMagicLink({
      body: {
        email,
        callbackURL: body.callback_url ?? "/",
        metadata: { type: "account_signin" },
      },
      headers: request.headers,
    });

    return Response.json({ status: true }, { status: 202 });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
