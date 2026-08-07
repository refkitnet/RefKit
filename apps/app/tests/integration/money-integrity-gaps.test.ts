import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  apps,
  appAgreementVersions,
  apiKeys,
  commissionEntries,
  organizationMembers,
  organizations,
  payoutRequestItems,
  payoutRequests,
  programs,
} from "@/db/schema";
import { createApiKey } from "@/services/api-keys";
import { createOrganization } from "@/services/organizations";
import { createApp } from "@/services/apps";
import { createPayoutRequest } from "@/services/payouts/payout-requests";
import { saveAffiliatePayoutDetails } from "@/services/payouts/payout-details";
import { createEarnedCommissionEntry } from "@/services/revenue/commission-ledger";
import { createTransactionRecord } from "@/services/revenue/transactions";
import { getExchangeRate } from "@/services/stripe/exchange-rates";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

describe("money integrity hardening gaps", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("rejects app API keys scoped to an app outside the organization", async () => {
    const otherOrg = await createOrganization(
      ctx.ownerUserId,
      `Other Org ${ctx.suffix}`
    );
    const otherApp = await createApp(ctx.ownerUserId, {
      organizationId: otherOrg.id,
      name: `Other App ${ctx.suffix}`,
      websiteUrl: `https://other-${ctx.suffix}.example.com`,
    });

    await expect(
      createApiKey({
        userId: ctx.ownerUserId,
        kind: "app",
        organizationId: ctx.organizationId,
        appId: otherApp.id,
        name: "cross-org",
        testMode: true,
      })
    ).rejects.toMatchObject({
      code: "app_organization_mismatch",
    });

    const db = getDb();
    await db.delete(apiKeys).where(eq(apiKeys.appId, otherApp.id));
    await db
      .delete(appAgreementVersions)
      .where(eq(appAgreementVersions.appId, otherApp.id));
    await db.delete(apps).where(eq(apps.id, otherApp.id));
    await db
      .delete(organizationMembers)
      .where(eq(organizationMembers.organizationId, otherOrg.id));
    await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  });

  it("rejects cross-currency exchange rates", async () => {
    await expect(getExchangeRate("usd", "eur", new Date())).rejects.toMatchObject({
      code: "cross_currency_unsupported",
    });

    await expect(getExchangeRate("usd", "usd", new Date())).resolves.toBe("1");
  });

  it("rejects direct cross-currency commission creation", async () => {
    const db = getDb();

    await db
      .update(programs)
      .set({ currency: "eur", updatedAt: new Date() })
      .where(eq(programs.id, ctx.programId));

    try {
      const { transaction } = await createTransactionRecord({
        appId: ctx.appId,
        source: "api",
        externalId: `fx-pay-${ctx.suffix}`,
        programId: ctx.programId,
        customerId: ctx.customerId,
        programAffiliateId: ctx.programAffiliateId,
        action: "payment",
        amount: 5000,
        currency: "usd",
        livemode: true,
        transactionDate: new Date(),
      });

      await expect(
        createEarnedCommissionEntry({
          transactionId: transaction!.id,
          programId: ctx.programId,
          programAffiliateId: ctx.programAffiliateId,
          customerId: ctx.customerId,
          ruleId: ctx.ruleId,
          basisAmountMinor: 5000,
          basisCurrency: "usd",
          transactionDate: new Date(),
          livemode: true,
          eventCreatedAt: new Date(),
        })
      ).rejects.toMatchObject({
        code: "cross_currency_unsupported",
      });
    }
    finally {
      await db
        .update(programs)
        .set({ currency: "usd", updatedAt: new Date() })
        .where(eq(programs.id, ctx.programId));
    }
  });

  it("allocates payable entries when creating a payout request", async () => {
    const db = getDb();

    await db
      .update(programs)
      .set({
        supportedPayoutMethods: ["paypal"],
        minimumPayoutAmount: 0,
        updatedAt: new Date(),
      })
      .where(eq(programs.id, ctx.programId));

    await saveAffiliatePayoutDetails(
      ctx.programAffiliateId,
      "paypal",
      { email: `affiliate-${ctx.suffix}@refkit-vitest.test` },
      "usd"
    );

    const { transaction } = await createTransactionRecord({
      appId: ctx.appId,
      source: "api",
      externalId: `alloc-pay-${ctx.suffix}`,
      programId: ctx.programId,
      customerId: ctx.customerId,
      programAffiliateId: ctx.programAffiliateId,
      action: "payment",
      amount: 10000,
      currency: "usd",
      livemode: true,
      transactionDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
    });

    const earned = await createEarnedCommissionEntry({
      transactionId: transaction!.id,
      programId: ctx.programId,
      programAffiliateId: ctx.programAffiliateId,
      customerId: ctx.customerId,
      ruleId: ctx.ruleId,
      basisAmountMinor: 10000,
      basisCurrency: "usd",
      transactionDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      livemode: true,
      eventCreatedAt: new Date(),
    });

    expect(earned?.amount).toBe(2000);
    expect(earned?.currency).toBe("usd");

    await db
      .update(commissionEntries)
      .set({ status: "approved", approvedAt: new Date() })
      .where(eq(commissionEntries.id, earned!.id));

    const request = await createPayoutRequest(
      ctx.affiliateUserId,
      ctx.programId
    );

    expect(request.amount).toBe(2000);

    const allocations = await db
      .select()
      .from(payoutRequestItems)
      .where(eq(payoutRequestItems.payoutRequestId, request.id));

    expect(allocations).toHaveLength(1);
    expect(allocations[0].commissionEntryId).toBe(earned!.id);

    await db
      .delete(payoutRequestItems)
      .where(eq(payoutRequestItems.payoutRequestId, request.id));
    await db.delete(payoutRequests).where(eq(payoutRequests.id, request.id));
  });
});
