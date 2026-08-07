import { NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { normalizeStripeInstallReturnTo } from "@/lib/stripe-install-return";
import { verifyStripeInstallState } from "@/lib/stripe-install-state";
import { completeStripeAppInstall } from "@/services/stripe/connected-accounts";
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
  const stripeUserId = url.searchParams.get("user_id");
  const stripeAccountId = url.searchParams.get("account_id");
  const state = url.searchParams.get("state");
  const installSignature = url.searchParams.get("install_signature");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (error) {
    return redirectWithMessage("/dashboard", {
      stripe: "error",
      message: errorDescription ?? error,
    });
  }

  if (!stripeUserId || !stripeAccountId || !state || !installSignature) {
    return redirectWithMessage("/dashboard", {
      stripe: "error",
      message: "Missing Stripe App installation details.",
    });
  }

  let returnTo = "/dashboard";

  try {
    const statePayload = verifyStripeInstallState(state);
    returnTo = normalizeStripeInstallReturnTo(statePayload.returnTo);
    await completeStripeAppInstall({
      stripeUserId,
      stripeAccountId,
      state,
      installSignature,
      livemode: url.searchParams.get("livemode") !== "false",
    });

    return redirectWithMessage(
      returnTo,
      {
        stripe: "connected",
      }
    );
  }
  catch (error) {
    console.error(error);

    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Stripe connection failed.";

    return redirectWithMessage(returnTo, {
      stripe: "error",
      message,
    });
  }
}
