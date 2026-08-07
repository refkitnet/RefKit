export type StripeConnectRedirectResult =
  | {
      kind: "connected";
    }
  | {
      kind: "error";
      message: string;
    }
  | null;

export function readStripeConnectRedirect(
  searchParams: URLSearchParams
): StripeConnectRedirectResult {
  const stripe = searchParams.get("stripe");

  if (stripe === "connected") {
    return { kind: "connected" };
  }

  if (stripe === "error") {
    return {
      kind: "error",
      message: searchParams.get("message") ?? "Stripe connection failed.",
    };
  }

  return null;
}

export function stripStripeConnectRedirectParams(
  searchParams: URLSearchParams
) {
  const params = new URLSearchParams(searchParams.toString());

  params.delete("stripe");
  params.delete("message");

  return params;
}

export function buildPathWithoutStripeConnectRedirect(
  pathname: string,
  searchParams: URLSearchParams
) {
  const params = stripStripeConnectRedirectParams(searchParams);

  return params.toString() ? `${pathname}?${params.toString()}` : pathname;
}

export const STRIPE_CONNECTED_MESSAGE =
  "Your Stripe account is connected. Commissions will be created when payment events include RefKit attribution metadata.";
