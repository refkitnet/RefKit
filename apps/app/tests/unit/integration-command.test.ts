import { describe, expect, it } from "vitest";
import {
  affiliateTrackingUrl,
  DEFAULT_INTEGRATION_API_URL,
  getJourneySteps,
  installEnvExample,
  integrationCommand,
  needsNeutralBillingChoice,
} from "@/components/dashboard/integration-journey";
import type { SetupStatus } from "@/lib/dashboard-types";

describe("integrationCommand", () => {
  it("omits --api-url for production", () => {
    expect(
      integrationCommand("app_test", "prg_test", DEFAULT_INTEGRATION_API_URL)
    ).toBe("npx refkitnet init --app-id app_test --program-id prg_test");
  });

  it("includes --api-url for local development", () => {
    expect(
      integrationCommand("app_test", "prg_test", "http://localhost:3000")
    ).toBe(
      "npx refkitnet init --app-id app_test --program-id prg_test --api-url http://localhost:3000"
    );
  });

  it("works without a program id", () => {
    expect(integrationCommand("app_test", undefined, "http://127.0.0.1:3000")).toBe(
      "npx refkitnet init --app-id app_test --api-url http://127.0.0.1:3000"
    );
  });

  it("adds --live for a production-first setup", () => {
    expect(
      integrationCommand(
        "app_test",
        "prg_test",
        DEFAULT_INTEGRATION_API_URL,
        { live: true },
      ),
    ).toBe(
      "npx refkitnet init --app-id app_test --program-id prg_test --live",
    );
  });
});

describe("installEnvExample", () => {
  it("uses server-only env keys for manual REST integration", () => {
    expect(
      installEnvExample("http://localhost:3000", {
        apiKey: "rk_test_app_secret",
      }),
    ).toBe(
      [
        "REFKIT_API_URL=http://localhost:3000",
        "REFKIT_API_KEY=rk_test_app_secret",
      ].join("\n")
    );
  });

});

describe("affiliateTrackingUrl", () => {
  it("includes only the unique via code for production links", () => {
    expect(
      affiliateTrackingUrl(
        "http://localhost:5173",
        "kcqqjbn4",
      )
    ).toBe("http://localhost:5173/?via=kcqqjbn4");
  });

  it("adds refkit_app for dashboard Test links", () => {
    expect(
      affiliateTrackingUrl(
        "http://localhost:5173",
        "kcqqjbn4",
        "app_test123",
      )
    ).toBe(
      "http://localhost:5173/?via=kcqqjbn4&refkit_app=app_test123"
    );
  });
});

const baseSetupStatus: SetupStatus = {
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
  test_api_key: "rk_test_app_fixture",
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

describe("getJourneySteps", () => {
  it("keeps Test and Live as separate journeys", () => {
    expect(
      getJourneySteps(baseSetupStatus, "test").map((step) => step.id),
    ).toEqual(["billing", "install", "click", "identify", "payment", "done"]);
    expect(
      getJourneySteps(baseSetupStatus, "production").map((step) => step.id),
    ).toEqual(["billing", "website", "key", "install", "done"]);
  });
});

describe("needsNeutralBillingChoice", () => {
  it("requires an explicit choice for new unconnected Stripe apps", () => {
    expect(needsNeutralBillingChoice(baseSetupStatus, "test")).toBe(true);
  });

  it("skips neutral choice for API reporting apps", () => {
    expect(
      needsNeutralBillingChoice(
        { ...baseSetupStatus, revenue_source: "api" },
        "test",
      ),
    ).toBe(false);
  });

  it("skips neutral choice after Stripe is connected", () => {
    expect(
      needsNeutralBillingChoice(
        { ...baseSetupStatus, test_stripe_connected: true },
        "test",
      ),
    ).toBe(false);
  });
});
