import type { SetupStatus } from "@/lib/dashboard-types";

export type PaymentConnectionMode = "test" | "live";
export type RevenueSource = SetupStatus["revenue_source"];

export type PaymentConnectionState = {
  connected: boolean;
  label: string;
  statusLabel: string;
};

export type PaymentConnectionView = {
  revenueSource: RevenueSource;
  sourceLabel: string;
  mode: PaymentConnectionMode;
  test: PaymentConnectionState;
  live: PaymentConnectionState;
  relevantStripeConnected: boolean;
  relevantStripeLabel: string;
  primaryActionLabel: string | null;
  disconnectAvailable: boolean;
  loading: boolean;
  loadingMode: PaymentConnectionMode | null;
  error: string | null;
};

export function derivePaymentConnectionView(
  revenueSource: RevenueSource,
  status: SetupStatus,
  mode: PaymentConnectionMode,
  ui: {
    loading?: boolean;
    loadingMode?: PaymentConnectionMode | null;
    error?: string | null;
  } = {},
): PaymentConnectionView {
  const testStripeConnected = status.test_stripe_connected;
  const liveStripeConnected = status.live_stripe_connected;
  const relevantStripeConnected = mode === "test"
    ? testStripeConnected
    : liveStripeConnected;
  const relevantStripeLabel = mode === "live"
    ? "Live Stripe connected"
    : "Test Stripe connected";

  const test = revenueSource === "stripe"
    ? {
        connected: testStripeConnected,
        label: "Test Stripe",
        statusLabel: testStripeConnected ? "Connected" : "Not connected",
      }
    : {
        connected: status.test_first_revenue_event,
        label: "Test reporting",
        statusLabel: status.test_first_revenue_event
          ? "Reporting works"
          : "Waiting for test payment",
      };
  const live = revenueSource === "stripe"
    ? {
        connected: liveStripeConnected,
        label: "Live Stripe",
        statusLabel: liveStripeConnected ? "Connected" : "Not connected",
      }
    : {
        connected: status.live_first_revenue_event,
        label: "Live reporting",
        statusLabel: status.live_first_revenue_event
          ? "Reporting works"
          : "Waiting for live payment",
      };

  let primaryActionLabel: string | null = null;
  if (revenueSource === "stripe") {
    if (mode === "live") {
      primaryActionLabel = liveStripeConnected
        ? "Reconnect live Stripe"
        : "Connect live Stripe";
    }
    else {
      primaryActionLabel = testStripeConnected
        ? "Reconnect test Stripe"
        : "Connect test Stripe";
    }
  }

  return {
    revenueSource,
    sourceLabel: revenueSource === "stripe" ? "Stripe" : "API reporting",
    mode,
    test,
    live,
    relevantStripeConnected,
    relevantStripeLabel,
    primaryActionLabel,
    disconnectAvailable: relevantStripeConnected,
    loading: ui.loading ?? false,
    loadingMode: ui.loadingMode ?? null,
    error: ui.error ?? null,
  };
}
