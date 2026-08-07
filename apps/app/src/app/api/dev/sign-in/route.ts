import { NextResponse } from "next/server";
import { z } from "zod";
import { AppError, jsonError } from "@/lib/errors";
import { createDevSession } from "@/services/auth/dev-sign-in";
import { getDefaultHomePathForUser } from "@/services/users/me";

const querySchema = z.object({
  userId: z.string().trim().min(1),
  redirect: z.string().optional(),
});

function resolveRedirectPath(redirect: string | undefined) {
  if (
    redirect
    && redirect !== "/"
    && redirect.startsWith("/")
    && !redirect.startsWith("//")
  ) {
    return redirect;
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const query = querySchema.parse({
      userId: url.searchParams.get("userId"),
      redirect: url.searchParams.get("redirect") ?? undefined,
    });

    const { user, cookies } = await createDevSession(query.userId);
    const homePath =
      resolveRedirectPath(query.redirect) ??
      (await getDefaultHomePathForUser(user.id, user.email, user.name));

    const response = NextResponse.redirect(new URL(homePath, request.url));

    for (const cookie of cookies) {
      response.cookies.set(cookie.name, cookie.value, {
        path: cookie.path,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite?.toLowerCase() as "lax" | "strict" | "none",
        ...(cookie.expires
          ? { expires: new Date(cookie.expires * 1000) }
          : {}),
      });
    }

    return response;
  }
  catch (error) {
    if (error instanceof AppError) {
      return jsonError(error);
    }

    if (error instanceof z.ZodError) {
      return jsonError(
        new AppError(
          "invalid_request",
          "invalid_query",
          "Missing or invalid userId.",
          400
        )
      );
    }

    console.error(error);

    return jsonError(
      new AppError(
        "internal",
        "dev_sign_in_failed",
        "Could not create dev session.",
        500
      )
    );
  }
}
