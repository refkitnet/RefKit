import { apiFetch } from "@/lib/api-client";

type ConnectLinkResult = {
  url: string | null;
  message?: string;
};

export async function startStripeConnectInstall(input: {
  appId: string;
  livemode: boolean;
  returnTo?: string;
  onConnected: () => unknown | Promise<unknown>;
}): Promise<{ redirected: boolean; sandboxMessage?: string }> {
  const returnTo =
    input.returnTo
    ?? (typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "/dashboard");

  const result = await apiFetch<ConnectLinkResult>("/api/v1/stripe/connect-link", {
    method: "POST",
    body: JSON.stringify({
      app_id: input.appId,
      livemode: input.livemode,
      return_to: returnTo,
    }),
  });

  if (!result.url) {
    await input.onConnected();
    return {
      redirected: false,
      sandboxMessage: result.message ?? "Stripe connection ready.",
    };
  }

  window.location.assign(result.url);

  return { redirected: true };
}
