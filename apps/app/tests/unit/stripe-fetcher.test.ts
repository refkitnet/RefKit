import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getStripeClient, retrieveInvoice } = vi.hoisted(() => ({
  getStripeClient: vi.fn(),
  retrieveInvoice: vi.fn(),
}));

vi.mock("@/services/stripe/client", () => ({
  getStripeClient,
}));

import { createLiveStripeFetcher } from "@/services/stripe/fetcher";

describe("live Stripe fetcher account options", () => {
  beforeEach(() => {
    getStripeClient.mockReset();
    retrieveInvoice.mockReset();
    retrieveInvoice.mockResolvedValue({ id: "in_direct" });
    getStripeClient.mockReturnValue({
      invoices: {
        retrieve: retrieveInvoice,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("omits the account header for the matching direct account in nonproduction", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STRIPE_DIRECT_ACCOUNT_ID", "acct_direct");

    await createLiveStripeFetcher(false).retrieveInvoice(
      "in_direct",
      "acct_direct"
    );

    expect(getStripeClient).toHaveBeenCalledWith({ livemode: false });
    expect(retrieveInvoice).toHaveBeenCalledWith("in_direct", {}, {});
  });

  it.each([
    ["test", "acct_other"],
    ["production", "acct_direct"],
  ])(
    "keeps the account header in %s for requested account %s",
    async (nodeEnv, requestedAccount) => {
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("STRIPE_DIRECT_ACCOUNT_ID", "acct_direct");

      await createLiveStripeFetcher().retrieveInvoice(
        "in_direct",
        requestedAccount
      );

      expect(retrieveInvoice).toHaveBeenCalledWith("in_direct", {}, {
        stripeAccount: requestedAccount,
      });
    }
  );
});
