import { describe, expect, it } from "vitest";
import type { SetupStatus } from "@/lib/dashboard-types";
import { derivePaymentConnectionView } from "@/lib/payment-connection";
import { normalizeStripeInstallReturnTo } from "@/lib/stripe-install-return";

const baseStatus: SetupStatus = {
  revenue_source: "stripe",
  program_launched: true,
  api_key_created: true,
  first_click: false,
  first_identify: false,
  stripe_connected: false,
  first_stripe_event: false,
  first_revenue_event: false,
  first_commission: false,
  test_api_key_created: true,
  test_api_key: "rk_test_app_example",
  test_api_key_used: false,
  test_affiliate_created: false,
  test_first_click: false,
  test_first_identify: false,
  test_stripe_connected: false,
  test_first_revenue_event: false,
  test_first_commission: false,
  test_integration_complete: false,
  live_api_key_created: false,
  live_api_key_used: false,
  live_stripe_connected: false,
  live_first_revenue_event: false,
  live_first_commission: false,
  production_website_ready: false,
  production_ready: false,
  unattributed_revenue_alarm: false,
  cross_currency_alarm: false,
  cross_currency_message: null,
  integration_issue: null,
  integration_issue_at: null,
};

describe("stripe install return path", () => {
  it("defaults to dashboard", () => {
    expect(normalizeStripeInstallReturnTo(undefined)).toBe("/dashboard");
  });

  it("accepts dashboard paths", () => {
    expect(normalizeStripeInstallReturnTo("/dashboard/apps/app_123")).toBe(
      "/dashboard/apps/app_123",
    );
  });

  it("rejects external paths", () => {
    expect(normalizeStripeInstallReturnTo("https://evil.test/phish")).toBe("/dashboard");
  });

  it("rejects protocol-relative paths", () => {
    expect(normalizeStripeInstallReturnTo("//evil.test/phish")).toBe("/dashboard");
  });

  it("rejects local paths outside the dashboard", () => {
    expect(normalizeStripeInstallReturnTo("/affiliate")).toBe("/dashboard");
  });
});

describe("payment connection view", () => {
  it("does not let a live connection satisfy test setup", () => {
    const view = derivePaymentConnectionView(
      "stripe",
      {
        ...baseStatus,
        live_stripe_connected: true,
      },
      "test",
    );

    expect(view.relevantStripeConnected).toBe(false);
    expect(view.relevantStripeLabel).toBe("Test Stripe connected");
    expect(view.primaryActionLabel).toBe("Connect test Stripe");
  });

  it("requires a live connection for production setup", () => {
    const view = derivePaymentConnectionView(
      "stripe",
      {
        ...baseStatus,
        test_stripe_connected: true,
      },
      "live",
    );

    expect(view.relevantStripeConnected).toBe(false);
    expect(view.primaryActionLabel).toBe("Connect live Stripe");
  });

  it("keeps test and live Stripe status separate in settings", () => {
    const view = derivePaymentConnectionView(
      "stripe",
      {
        ...baseStatus,
        test_stripe_connected: true,
        live_stripe_connected: false,
      },
      "live",
    );

    expect(view.test).toEqual({
      connected: true,
      label: "Test Stripe",
      statusLabel: "Connected",
    });
    expect(view.live).toEqual({
      connected: false,
      label: "Live Stripe",
      statusLabel: "Not connected",
    });
    expect(view.relevantStripeConnected).toBe(false);
    expect(view.primaryActionLabel).toBe("Connect live Stripe");
    expect(view.disconnectAvailable).toBe(false);
  });

  it("reconnects live Stripe only after live mode is connected", () => {
    const view = derivePaymentConnectionView(
      "stripe",
      {
        ...baseStatus,
        test_stripe_connected: true,
        live_stripe_connected: true,
      },
      "live",
    );

    expect(view.relevantStripeConnected).toBe(true);
    expect(view.primaryActionLabel).toBe("Reconnect live Stripe");
  });

  it("shows test and live reporting state for API apps", () => {
    const view = derivePaymentConnectionView(
      "api",
      {
        ...baseStatus,
        revenue_source: "api",
        test_first_revenue_event: true,
        live_first_revenue_event: false,
      },
      "test",
    );

    expect(view.sourceLabel).toBe("API reporting");
    expect(view.test.statusLabel).toBe("Reporting works");
    expect(view.live.statusLabel).toBe("Waiting for live payment");
    expect(view.primaryActionLabel).toBeNull();
  });

  it("carries loading and error state into the shared presentation", () => {
    const view = derivePaymentConnectionView(
      "stripe",
      baseStatus,
      "live",
      { loading: true, loadingMode: "live", error: "Connection failed" },
    );

    expect(view.loading).toBe(true);
    expect(view.loadingMode).toBe("live");
    expect(view.error).toBe("Connection failed");
  });
});
