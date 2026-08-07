import { describe, expect, it } from "vitest";
import {
  affiliateDisplayLabel,
  canAccessOwnerActivityPages,
  commissionKindLabel,
  customerDisplayLabel,
  formatInternalCustomerId,
  getUserInitials,
  hasLiveDashboardInfo,
  referralsEmptyStateMessage,
  userDisplayLabel,
} from "@/lib/dashboard-display";
import type { SetupStatus } from "@/lib/dashboard-types";

const baseStatus: SetupStatus = {
  revenue_source: "stripe",
  program_launched: true,
  api_key_created: true,
  first_click: true,
  first_identify: true,
  stripe_connected: true,
  first_stripe_event: true,
  first_revenue_event: true,
  first_commission: true,
  test_api_key_created: true,
  test_api_key: "rk_test_app_fixture",
  test_api_key_used: true,
  test_affiliate_created: true,
  test_first_click: true,
  test_first_identify: true,
  test_stripe_connected: true,
  test_first_revenue_event: true,
  test_first_commission: true,
  test_integration_complete: true,
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

describe("dashboard-display", () => {
  it("labels commission kinds for humans", () => {
    expect(commissionKindLabel("refund_reversal")).toBe("Refund adjustment");
    expect(commissionKindLabel("earned")).toBe("Commission");
  });

  it("formats seed customer ids", () => {
    expect(formatInternalCustomerId("rcus_seed_shipfast_1")).toBe(
      "Referred customer 1"
    );
  });

  it("prefers customer email in display label", () => {
    expect(
      customerDisplayLabel({
        customer_id: "rcus_seed_shipfast_1",
        customer_email: "buyer@example.com",
      })
    ).toBe("buyer@example.com");
  });

  it("prefers affiliate name in display label", () => {
    expect(
      affiliateDisplayLabel({
        id: "aff_seed_jordan_chartgrid",
        name: "Jordan Blake",
        link_code: "jordan-grid",
      })
    ).toBe("Jordan Blake");
  });

  it("builds user display labels and initials", () => {
    expect(
      userDisplayLabel({
        id: "aff_123",
        name: "Jordan Blake",
        email: "jordan@example.com",
      })
    ).toBe("Jordan Blake");
    expect(getUserInitials("jordan@example.com", "Jordan Blake")).toBe("JB");
    expect(getUserInitials("jordan@example.com", null)).toBe("JO");
    expect(getUserInitials(null, null)).toBe("RK");
  });

  it("allows activity pages when a program exists", () => {
    expect(
      canAccessOwnerActivityPages({ hasApp: true, programCount: 1 })
    ).toBe(true);
    expect(
      canAccessOwnerActivityPages({ hasApp: true, programCount: 0 })
    ).toBe(false);
  });

  it("detects when live dashboard info should lock the environment", () => {
    expect(hasLiveDashboardInfo(baseStatus)).toBe(false);
    expect(
      hasLiveDashboardInfo({ ...baseStatus, live_api_key_created: true }),
    ).toBe(true);
    expect(
      hasLiveDashboardInfo({ ...baseStatus, live_stripe_connected: true }),
    ).toBe(true);
    expect(
      hasLiveDashboardInfo({ ...baseStatus, production_ready: true }),
    ).toBe(true);
  });

  it("explains when test referrals are hidden from the live list", () => {
    expect(referralsEmptyStateMessage(null)).toEqual({
      title: "No referrals yet",
      description:
        "Referred customers appear after affiliate signups are matched.",
    });
    expect(
      referralsEmptyStateMessage({ ...baseStatus, test_first_identify: true }),
    ).toEqual({
      title: "Test referral received",
      description:
        "Test activity stays out of live referrals. Live referrals appear after go-live.",
    });
  });
});
