import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { requireSession } from "@/lib/auth-context";
import { normalizeStripeInstallReturnTo } from "@/lib/stripe-install-return";
import { completeStripeAppInstallFromAccountId } from "@/services/stripe/connected-accounts";
import {
  deploymentCapabilityUnavailableResponse,
  isSelfHosted,
} from "@/lib/deployment";

function redirectWithMessage(path: string, params: Record<string, string>) {
  const env = getServerEnv();
  const url = new URL(path, env.APP_URL);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  if (isSelfHosted()) {
    return deploymentCapabilityUnavailableResponse();
  }

  const url = new URL(request.url);
  const stripeAccountId = url.searchParams.get("account_id");
  const livemode = url.searchParams.get("livemode") !== "false";

  if (!stripeAccountId) {
    return redirectWithMessage("/dashboard", {
      stripe: "error",
      message: "Missing Stripe account after install.",
    });
  }

  try {
    const session = await requireSession(request);
    await completeStripeAppInstallFromAccountId({
      userId: session.userId,
      stripeAccountId,
      livemode,
    });

    return redirectWithMessage(normalizeStripeInstallReturnTo("/dashboard"), {
      stripe: "connected",
    });
  }
  catch (error) {
    console.error(error);

    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Stripe connection failed.";

    return redirectWithMessage("/dashboard", {
      stripe: "error",
      message,
    });
  }
}
