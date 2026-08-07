import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  commissionEntries,
  apps,
  apiKeys,
  customers,
  referrals,
  revenueDisputes,
  transactions,
  programs,
} from "@/db/schema";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";
import {
  apiRefundSourceEventId,
  reportDispute,
  reportPayment,
  reportRefund,
} from "@/services/revenue/report-payment";
import { createTransactionRecord } from "@/services/revenue/transactions";
import { updateAppRevenueSource } from "@/services/apps";
import { createApiKey } from "@/services/api-keys";
import { identifyCustomer } from "@/services/identify";

function appKeyAuth(
  ctx: TestContext,
  input: { keyId?: string; testMode?: boolean } = {}
) {
  return {
    type: "app_key" as const,
    userId: ctx.ownerUserId,
    keyId: input.keyId ?? ctx.apiKeyId,
    organizationId: ctx.organizationId,
    appId: ctx.appId,
    testMode: input.testMode ?? true,
  };
}

describe("api revenue reporting", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph({ affiliateTestMode: true });
    ctx.rateLimitScopes.push(`report-payment:${ctx.apiKeyId}`);
    ctx.rateLimitScopes.push(`report-refund:${ctx.apiKeyId}`);
    ctx.rateLimitScopes.push(`report-dispute:${ctx.apiKeyId}`);
    await updateAppRevenueSource(ctx.ownerUserId, ctx.appId, "api");
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("rejects reporting on stripe apps", async () => {
    const stripeCtx = await seedAttributionGraph({
      suffix: `${ctx.suffix}-stripe-only`,
    });
    stripeCtx.rateLimitScopes.push(`report-payment:${stripeCtx.apiKeyId}`);

    try {
      await expect(
        reportPayment(
          {
            type: "app_key",
            userId: stripeCtx.ownerUserId,
            keyId: stripeCtx.apiKeyId,
            organizationId: stripeCtx.organizationId,
            appId: stripeCtx.appId,
            testMode: true,
          },
          {
            paymentId: `pay_blocked_${stripeCtx.suffix}`,
            customerId: stripeCtx.customerId,
            programId: stripeCtx.programId,
            amount: 1000,
            currency: "usd",
          }
        )
      ).rejects.toThrow("API payment reporting is not enabled");
    }
    finally {
      await cleanupTestContext(stripeCtx);
    }
  });

  it("creates attributed payment and commission", async () => {
    const paymentId = `pay_${ctx.suffix}`;

    const result = await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 5000,
      currency: "usd",
    });

    expect(result.created).toBe(true);
    expect(result.attributed).toBe(true);
    expect(result.livemode).toBe(false);
    expect(result.commission_entry_id).toBeTruthy();

    const db = getDb();

    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, result.transaction_id))
      .limit(1);

    expect(transaction?.source).toBe("api");
    expect(transaction?.externalId).toBe(paymentId);
    expect(transaction?.amount).toBe(5000);
  });

  it("records a zero-value payment without a commission", async () => {
    const paymentId = `pay_zero_${ctx.suffix}`;
    const result = await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 0,
      currency: "usd",
    });

    expect(result).toMatchObject({
      attributed: true,
      commission_entry_id: null,
      created: true,
    });

    const [transaction] = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.id, result.transaction_id));

    expect(transaction.amount).toBe(0);
  });

  it("does not lock the revenue source on a zero-value live payment", async () => {
    const zeroCtx = await seedAttributionGraph();
    const liveKey = await createApiKey({
      userId: zeroCtx.ownerUserId,
      kind: "app",
      organizationId: zeroCtx.organizationId,
      appId: zeroCtx.appId,
      name: `Zero live key ${zeroCtx.suffix}`,
      testMode: false,
    });
    zeroCtx.affiliateApiKeyIds = [liveKey.id];
    zeroCtx.rateLimitScopes.push(`report-payment:${liveKey.id}`);

    try {
      await updateAppRevenueSource(
        zeroCtx.ownerUserId,
        zeroCtx.appId,
        "api"
      );
      await reportPayment(
        appKeyAuth(zeroCtx, { keyId: liveKey.id, testMode: false }),
        {
          paymentId: `pay_zero_live_${zeroCtx.suffix}`,
          customerId: zeroCtx.customerId,
          programId: zeroCtx.programId,
          amount: 0,
          currency: "usd",
        }
      );

      await expect(
        updateAppRevenueSource(zeroCtx.ownerUserId, zeroCtx.appId, "stripe")
      ).resolves.toMatchObject({ revenueSource: "stripe" });
    }
    finally {
      await cleanupTestContext(zeroCtx);
    }
  });

  it("replays payment idempotently", async () => {
    const paymentId = `pay_replay_${ctx.suffix}`;

    const first = await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 2500,
      currency: "usd",
    });

    const second = await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 2500,
      currency: "usd",
    });

    expect(second.created).toBe(false);
    expect(second.transaction_id).toBe(first.transaction_id);

    const db = getDb();
    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, paymentId));

    expect(rows).toHaveLength(1);
  });

  it("rejects conflicting payment id reuse", async () => {
    const paymentId = `pay_conflict_${ctx.suffix}`;

    await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 1000,
      currency: "usd",
    });

    await expect(
      reportPayment(appKeyAuth(ctx), {
        paymentId,
        customerId: ctx.customerId,
        programId: ctx.programId,
        amount: 2000,
        currency: "usd",
      })
    ).rejects.toThrow("already used with different details");
  });

  it("rolls back an API payment when its commission currency is unsupported", async () => {
    const paymentId = `pay_cross_currency_${ctx.suffix}`;
    const db = getDb();

    await db
      .update(programs)
      .set({ currency: "eur", updatedAt: new Date() })
      .where(eq(programs.id, ctx.programId));

    try {
      await expect(
        reportPayment(appKeyAuth(ctx), {
          paymentId,
          customerId: ctx.customerId,
          programId: ctx.programId,
          amount: 1000,
          currency: "usd",
        })
      ).rejects.toMatchObject({ code: "cross_currency_unsupported" });

      const rows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.externalId, paymentId));

      expect(rows).toHaveLength(0);

      const [app] = await db
        .select({ integrationIssue: apps.integrationIssue })
        .from(apps)
        .where(eq(apps.id, ctx.appId))
        .limit(1);

      expect(app?.integrationIssue).toContain("cross_currency_unsupported");
      expect(app?.integrationIssue).toContain("USD");
      expect(app?.integrationIssue).toContain("EUR");
    }
    finally {
      await db
        .update(programs)
        .set({ currency: "usd", updatedAt: new Date() })
        .where(eq(programs.id, ctx.programId));
      await db
        .update(apps)
        .set({
          integrationIssue: null,
          integrationIssueAt: null,
          updatedAt: new Date(),
        })
        .where(eq(apps.id, ctx.appId));
    }

    const retry = await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 1000,
      currency: "usd",
    });

    expect(retry.created).toBe(true);
    expect(retry.commission_entry_id).toBeTruthy();
  });

  it("rejects cross-currency unattributed and zero-value payments", async () => {
    const directCtx = await seedAttributionGraph({
      includeAttribution: false,
      affiliateTestMode: true,
    });
    const paymentId = `pay_unattributed_currency_${directCtx.suffix}`;
    const db = getDb();

    await db.insert(customers).values({
      id: directCtx.customerId,
      appId: directCtx.appId,
      externalCustomerId: `currency-${directCtx.suffix}`,
    });
    await updateAppRevenueSource(
      directCtx.ownerUserId,
      directCtx.appId,
      "api"
    );
    directCtx.rateLimitScopes.push(`report-payment:${directCtx.apiKeyId}`);
    await db
      .update(programs)
      .set({ currency: "eur", updatedAt: new Date() })
      .where(eq(programs.id, directCtx.programId));

    try {
      await expect(reportPayment(appKeyAuth(directCtx), {
        paymentId,
        customerId: directCtx.customerId,
        programId: directCtx.programId,
        amount: 0,
        currency: "usd",
      })).rejects.toMatchObject({ code: "cross_currency_unsupported" });

      const rows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.externalId, paymentId));
      const [app] = await db
        .select({ integrationIssue: apps.integrationIssue })
        .from(apps)
        .where(eq(apps.id, directCtx.appId));

      expect(rows).toHaveLength(0);
      expect(app.integrationIssue).toContain("cross_currency_unsupported");
    }
    finally {
      await cleanupTestContext(directCtx);
    }
  });

  it("creates proportional refund reversal", async () => {
    const paymentId = `pay_refund_${ctx.suffix}`;
    const refundId = `refund_${ctx.suffix}`;

    await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 5000,
      currency: "usd",
    });

    const refund = await reportRefund(appKeyAuth(ctx), {
      refundId,
      paymentId,
      amount: 2500,
    });

    expect(refund.created).toBe(true);
    expect(refund.commission_entry_id).toBeTruthy();
    expect(refund.livemode).toBe(false);

    const db = getDb();

    const [reversal] = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, refund.commission_entry_id!))
      .limit(1);

    expect(reversal?.kind).toBe("refund_reversal");
    expect(reversal?.amount).toBe(-500);
    expect(reversal?.originalAmount).toBe(-2500);
    expect(reversal?.sourceEventId).toBe(
      apiRefundSourceEventId(ctx.appId, refundId, false)
    );
  });

  it("replays refund idempotently after payment is fully refunded", async () => {
    const paymentId = `pay_full_refund_${ctx.suffix}`;
    const refundId = `refund_full_${ctx.suffix}`;

    await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 3000,
      currency: "usd",
    });

    const first = await reportRefund(appKeyAuth(ctx), {
      refundId,
      paymentId,
      amount: 3000,
    });

    const second = await reportRefund(appKeyAuth(ctx), {
      refundId,
      paymentId,
      amount: 3000,
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.transaction_id).toBe(first.transaction_id);
  });

  it("applies the complete dispute loss and reinstatement lifecycle", async () => {
    const paymentId = `pay_dispute_${ctx.suffix}`;
    const disputeId = `dispute_${ctx.suffix}`;
    const payment = await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 5000,
      currency: "usd",
    });

    const opened = await reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId,
      status: "opened",
      amount: 2500,
    });
    const openedReplay = await reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId,
      status: "opened",
      amount: 2500,
    });
    const [heldEntry] = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, payment.commission_entry_id!));

    expect(opened).toMatchObject({
      status: "opened",
      created: true,
      updated: false,
    });
    expect(openedReplay).toMatchObject({
      status: "opened",
      created: false,
      updated: false,
    });
    expect(heldEntry.status).toBe("disputed");

    const lost = await reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId,
      status: "lost",
      amount: 2500,
    });
    const lostReplay = await reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId,
      status: "lost",
      amount: 2500,
    });
    const [restoredEntry] = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, payment.commission_entry_id!));
    const [reversal] = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, lost.commission_entry_id!));

    expect(lost).toMatchObject({
      status: "lost",
      created: false,
      updated: true,
    });
    expect(lostReplay).toMatchObject({ updated: false });
    expect(restoredEntry.status).toBe("approved");
    expect(reversal).toMatchObject({
      kind: "dispute_reversal",
      disputeId,
      amount: -500,
      originalAmount: -2500,
    });

    const reinstated = await reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId,
      status: "funds_reinstated",
      amount: 2500,
    });
    const [reinstatement] = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, reinstated.commission_entry_id!));
    const [dispute] = await getDb()
      .select()
      .from(revenueDisputes)
      .where(eq(revenueDisputes.externalId, disputeId));

    expect(reinstated).toMatchObject({
      status: "funds_reinstated",
      updated: true,
    });
    expect(reinstatement).toMatchObject({
      kind: "dispute_reinstatement",
      amount: 500,
      originalAmount: 2500,
    });
    expect(dispute).toMatchObject({
      paymentTransactionId: payment.transaction_id,
      source: "api",
      status: "funds_reinstated",
      livemode: false,
    });
  });

  it("restores held commission when a dispute is withdrawn", async () => {
    const paymentId = `pay_dispute_withdrawn_${ctx.suffix}`;
    const disputeId = `dispute_withdrawn_${ctx.suffix}`;
    const payment = await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 2000,
      currency: "usd",
    });

    await reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId,
      status: "opened",
      amount: 2000,
    });
    const withdrawn = await reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId,
      status: "withdrawn",
      amount: 2000,
    });
    const [earned] = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, payment.commission_entry_id!));

    expect(withdrawn).toMatchObject({ status: "withdrawn", updated: true });
    expect(earned.status).toBe("approved");
  });

  it("accepts a terminal dispute before open and ignores the late open", async () => {
    const paymentId = `pay_dispute_order_${ctx.suffix}`;
    const disputeId = `dispute_order_${ctx.suffix}`;
    await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 1000,
      currency: "usd",
    });

    const won = await reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId,
      status: "won",
      amount: 1000,
    });
    const lateOpen = await reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId,
      status: "opened",
      amount: 1000,
    });

    expect(won).toMatchObject({ status: "won", created: true });
    expect(lateOpen).toMatchObject({
      status: "won",
      created: false,
      updated: false,
    });
  });

  it("rejects conflicting dispute identity and terminal status reuse", async () => {
    const firstPaymentId = `pay_dispute_conflict_a_${ctx.suffix}`;
    const secondPaymentId = `pay_dispute_conflict_b_${ctx.suffix}`;
    const disputeId = `dispute_conflict_${ctx.suffix}`;

    for (const paymentId of [firstPaymentId, secondPaymentId]) {
      await reportPayment(appKeyAuth(ctx), {
        paymentId,
        customerId: ctx.customerId,
        programId: ctx.programId,
        amount: 1000,
        currency: "usd",
      });
    }

    await reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId: firstPaymentId,
      status: "won",
      amount: 1000,
    });

    await expect(reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId: secondPaymentId,
      status: "won",
      amount: 1000,
    })).rejects.toMatchObject({ code: "dispute_id_conflict" });
    await expect(reportDispute(appKeyAuth(ctx), {
      disputeId,
      paymentId: firstPaymentId,
      status: "lost",
      amount: 1000,
    })).rejects.toMatchObject({ code: "dispute_status_conflict" });
  });

  it("rejects combined refund and dispute exposure above the payment", async () => {
    const paymentId = `pay_combined_exposure_${ctx.suffix}`;
    const payment = await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 1000,
      currency: "usd",
    });

    await reportRefund(appKeyAuth(ctx), {
      refundId: `refund_combined_exposure_${ctx.suffix}`,
      paymentId,
      amount: 600,
    });

    await expect(reportDispute(appKeyAuth(ctx), {
      disputeId: `dispute_combined_exposure_${ctx.suffix}`,
      paymentId,
      status: "opened",
      amount: 500,
    })).rejects.toMatchObject({ code: "invalid_dispute_amount" });

    const disputes = await getDb()
      .select()
      .from(revenueDisputes)
      .where(eq(revenueDisputes.paymentTransactionId, payment.transaction_id));

    expect(disputes).toHaveLength(0);
  });

  it("keeps overlapping disputes held and caps their aggregate exposure", async () => {
    const paymentId = `pay_overlapping_disputes_${ctx.suffix}`;
    const payment = await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 1000,
      currency: "usd",
    });
    const firstDisputeId = `dispute_overlap_a_${ctx.suffix}`;
    const secondDisputeId = `dispute_overlap_b_${ctx.suffix}`;

    await reportDispute(appKeyAuth(ctx), {
      disputeId: firstDisputeId,
      paymentId,
      status: "opened",
      amount: 400,
    });
    await reportDispute(appKeyAuth(ctx), {
      disputeId: secondDisputeId,
      paymentId,
      status: "opened",
      amount: 600,
    });
    await reportDispute(appKeyAuth(ctx), {
      disputeId: firstDisputeId,
      paymentId,
      status: "won",
      amount: 400,
    });

    const [stillHeld] = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, payment.commission_entry_id!));

    expect(stillHeld.status).toBe("disputed");

    await expect(reportDispute(appKeyAuth(ctx), {
      disputeId: `dispute_overlap_extra_${ctx.suffix}`,
      paymentId,
      status: "lost",
      amount: 500,
    })).rejects.toMatchObject({ code: "invalid_dispute_amount" });

    await reportDispute(appKeyAuth(ctx), {
      disputeId: secondDisputeId,
      paymentId,
      status: "won",
      amount: 600,
    });

    const [released] = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, payment.commission_entry_id!));

    expect(released.status).toBe("approved");
  });

  it("requires the payment before a refund or dispute", async () => {
    const missingPaymentId = `pay_missing_${ctx.suffix}`;

    await expect(reportRefund(appKeyAuth(ctx), {
      refundId: `refund_missing_${ctx.suffix}`,
      paymentId: missingPaymentId,
      amount: 100,
    })).rejects.toMatchObject({ code: "payment_not_found" });
    await expect(reportDispute(appKeyAuth(ctx), {
      disputeId: `dispute_missing_${ctx.suffix}`,
      paymentId: missingPaymentId,
      status: "opened",
      amount: 100,
    })).rejects.toMatchObject({ code: "payment_not_found" });
  });

  it("rejects org-wide api keys for refunds", async () => {
    const paymentId = `pay_org_key_${ctx.suffix}`;
    const orgKey = await createApiKey({
      userId: ctx.ownerUserId,
      kind: "app",
      organizationId: ctx.organizationId,
      name: `Org key ${ctx.suffix}`,
      testMode: true,
    });

    ctx.rateLimitScopes.push(`report-refund:${orgKey.id}`);

    await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 1000,
      currency: "usd",
    });

    await expect(
      reportRefund(
        {
          type: "app_key",
          userId: ctx.ownerUserId,
          keyId: orgKey.id,
          organizationId: ctx.organizationId,
          appId: null,
          testMode: true,
        },
        {
          refundId: `refund_org_${ctx.suffix}`,
          paymentId,
          amount: 500,
        }
      )
    ).rejects.toThrow("app-scoped API key");

    const db = getDb();
    await db.delete(apiKeys).where(eq(apiKeys.id, orgKey.id));
  });

  it("allows the same refund id across different apps", async () => {
    const otherCtx = await seedAttributionGraph({
      suffix: `${ctx.suffix}-other-app`,
      affiliateTestMode: true,
    });
    otherCtx.rateLimitScopes.push(`report-payment:${otherCtx.apiKeyId}`);
    otherCtx.rateLimitScopes.push(`report-refund:${otherCtx.apiKeyId}`);

    try {
      await updateAppRevenueSource(otherCtx.ownerUserId, otherCtx.appId, "api");

      const sharedRefundId = `shared_refund_${ctx.suffix}`;
      const paymentA = `pay_shared_a_${ctx.suffix}`;
      const paymentB = `pay_shared_b_${ctx.suffix}`;

      await reportPayment(appKeyAuth(ctx), {
        paymentId: paymentA,
        customerId: ctx.customerId,
        programId: ctx.programId,
        amount: 2000,
        currency: "usd",
      });

      await reportPayment(appKeyAuth(otherCtx), {
        paymentId: paymentB,
        customerId: otherCtx.customerId,
        programId: otherCtx.programId,
        amount: 2000,
        currency: "usd",
      });

      const refundA = await reportRefund(appKeyAuth(ctx), {
        refundId: sharedRefundId,
        paymentId: paymentA,
        amount: 1000,
      });

      const refundB = await reportRefund(appKeyAuth(otherCtx), {
        refundId: sharedRefundId,
        paymentId: paymentB,
        amount: 1000,
      });

      expect(refundA.created).toBe(true);
      expect(refundB.created).toBe(true);
      expect(refundA.transaction_id).not.toBe(refundB.transaction_id);
    }
    finally {
      await cleanupTestContext(otherCtx);
    }
  });

  it("rejects cumulative refunds that exceed the payment", async () => {
    const paymentId = `pay_over_refund_${ctx.suffix}`;

    await reportPayment(appKeyAuth(ctx), {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 4000,
      currency: "usd",
    });

    await reportRefund(appKeyAuth(ctx), {
      refundId: `refund_partial_${ctx.suffix}`,
      paymentId,
      amount: 2500,
    });

    await expect(
      reportRefund(appKeyAuth(ctx), {
        refundId: `refund_extra_${ctx.suffix}`,
        paymentId,
        amount: 2000,
      })
    ).rejects.toThrow("remaining payment balance");
  });

  it("rejects reuse of a refund id for another parent payment", async () => {
    const refundId = `refund_parent_${ctx.suffix}`;
    const firstPaymentId = `pay_parent_a_${ctx.suffix}`;
    const secondPaymentId = `pay_parent_b_${ctx.suffix}`;

    for (const paymentId of [firstPaymentId, secondPaymentId]) {
      await reportPayment(appKeyAuth(ctx), {
        paymentId,
        customerId: ctx.customerId,
        programId: ctx.programId,
        amount: 1000,
        currency: "usd",
      });
    }

    await reportRefund(appKeyAuth(ctx), {
      refundId,
      paymentId: firstPaymentId,
      amount: 500,
    });

    await expect(reportRefund(appKeyAuth(ctx), {
      refundId,
      paymentId: secondPaymentId,
      amount: 500,
    })).rejects.toMatchObject({ code: "transaction_id_conflict" });
  });

  it("uses cumulative refund rounding and never over-reverses commission", async () => {
    const tinyCtx = await seedAttributionGraph({
      commissionPercent: 50,
      affiliateTestMode: true,
    });
    await updateAppRevenueSource(tinyCtx.ownerUserId, tinyCtx.appId, "api");
    tinyCtx.rateLimitScopes.push(`report-payment:${tinyCtx.apiKeyId}`);
    tinyCtx.rateLimitScopes.push(`report-refund:${tinyCtx.apiKeyId}`);

    try {
      const paymentId = `pay_tiny_${tinyCtx.suffix}`;
      const payment = await reportPayment(appKeyAuth(tinyCtx), {
        paymentId,
        customerId: tinyCtx.customerId,
        programId: tinyCtx.programId,
        amount: 3,
        currency: "usd",
      });

      for (let index = 1; index <= 3; index += 1) {
        await reportRefund(appKeyAuth(tinyCtx), {
          refundId: `refund_tiny_${index}_${tinyCtx.suffix}`,
          paymentId,
          amount: 1,
        });
      }

      const reversals = await getDb()
        .select()
        .from(commissionEntries)
        .where(eq(commissionEntries.transactionId, payment.transaction_id));
      const reversedAmount = reversals
        .filter((entry) => entry.kind === "refund_reversal")
        .reduce((total, entry) => total + Math.abs(entry.amount), 0);

      expect(reversedAmount).toBe(2);
    }
    finally {
      await cleanupTestContext(tinyCtx);
    }
  });

  it("freezes an unattributed payment when attribution appears before replay", async () => {
    const lateCtx = await seedAttributionGraph({
      includeAttribution: false,
      affiliateTestMode: true,
    });
    const externalCustomerId = `late-${lateCtx.suffix}`;
    await getDb().insert(customers).values({
      id: lateCtx.customerId,
      appId: lateCtx.appId,
      externalCustomerId,
    });
    await updateAppRevenueSource(lateCtx.ownerUserId, lateCtx.appId, "api");
    lateCtx.rateLimitScopes.push(`report-payment:${lateCtx.apiKeyId}`);
    lateCtx.rateLimitScopes.push(`identify:${lateCtx.apiKeyId}`);

    try {
      const paymentId = `pay_late_${lateCtx.suffix}`;
      const first = await reportPayment(appKeyAuth(lateCtx), {
        paymentId,
        customerId: lateCtx.customerId,
        programId: lateCtx.programId,
        amount: 1000,
        currency: "usd",
      });
      expect(first).toMatchObject({ attributed: false, created: true });

      await identifyCustomer(appKeyAuth(lateCtx), {
        clickId: lateCtx.clickId,
        externalCustomerId,
      });
      const replay = await reportPayment(appKeyAuth(lateCtx), {
        paymentId,
        customerId: lateCtx.customerId,
        programId: lateCtx.programId,
        amount: 1000,
        currency: "usd",
      });

      expect(replay).toMatchObject({
        attributed: false,
        commission_entry_id: null,
        created: false,
      });
    }
    finally {
      await cleanupTestContext(lateCtx);
    }
  });

  it("rejects a live payment attributed to the Test Affiliate", async () => {
    const paymentId = `pay_mode_mismatch_${ctx.suffix}`;
    const liveKey = await createApiKey({
      userId: ctx.ownerUserId,
      kind: "app",
      organizationId: ctx.organizationId,
      appId: ctx.appId,
      name: `Mismatched live key ${ctx.suffix}`,
      testMode: false,
    });
    ctx.affiliateApiKeyIds = [
      ...(ctx.affiliateApiKeyIds ?? []),
      liveKey.id,
    ];
    ctx.rateLimitScopes.push(`report-payment:${liveKey.id}`);

    const commissionsBefore = await getDb()
      .select({ id: commissionEntries.id })
      .from(commissionEntries)
      .where(eq(commissionEntries.programAffiliateId, ctx.programAffiliateId));
    const [referralBefore] = await getDb()
      .select({
        termsVersionId: referrals.termsVersionId,
        pinnedRuleId: referrals.pinnedRuleId,
      })
      .from(referrals)
      .where(eq(referrals.id, ctx.referralId));

    await expect(reportPayment(
      appKeyAuth(ctx, { keyId: liveKey.id, testMode: false }),
      {
        paymentId,
        customerId: ctx.customerId,
        programId: ctx.programId,
        amount: 1000,
        currency: "usd",
      }
    )).rejects.toMatchObject({ code: "affiliate_mode_mismatch" });

    const transactionRows = await getDb()
      .select({ id: transactions.id })
      .from(transactions)
      .where(eq(transactions.externalId, paymentId));
    const commissionsAfter = await getDb()
      .select({ id: commissionEntries.id })
      .from(commissionEntries)
      .where(eq(commissionEntries.programAffiliateId, ctx.programAffiliateId));
    const [referral] = await getDb()
      .select({
        termsVersionId: referrals.termsVersionId,
        pinnedRuleId: referrals.pinnedRuleId,
      })
      .from(referrals)
      .where(eq(referrals.id, ctx.referralId));

    expect(transactionRows).toHaveLength(0);
    expect(commissionsAfter).toHaveLength(commissionsBefore.length);
    expect(referral).toEqual(referralBefore);
  });

  it("allows a live API key to refund its live payment", async () => {
    const liveCtx = await seedAttributionGraph();
    await updateAppRevenueSource(liveCtx.ownerUserId, liveCtx.appId, "api");
    const paymentId = `pay_livemode_${liveCtx.suffix}`;
    const refundId = `refund_livemode_${liveCtx.suffix}`;
    const liveKey = await createApiKey({
      userId: liveCtx.ownerUserId,
      kind: "app",
      organizationId: liveCtx.organizationId,
      appId: liveCtx.appId,
      name: `Live revenue key ${liveCtx.suffix}`,
      testMode: false,
    });
    liveCtx.affiliateApiKeyIds = [liveKey.id];
    liveCtx.rateLimitScopes.push(`report-payment:${liveKey.id}`);
    liveCtx.rateLimitScopes.push(`report-refund:${liveKey.id}`);

    try {
      const payment = await reportPayment(
        appKeyAuth(liveCtx, { keyId: liveKey.id, testMode: false }),
        {
          paymentId,
          customerId: liveCtx.customerId,
          programId: liveCtx.programId,
          amount: 1200,
          currency: "usd",
        }
      );

      const refund = await reportRefund(
        appKeyAuth(liveCtx, { keyId: liveKey.id, testMode: false }),
        {
          refundId,
          paymentId,
          amount: 600,
        }
      );

      expect(refund.livemode).toBe(true);

      const db = getDb();
      const [refundTransaction] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, refund.transaction_id))
        .limit(1);

      expect(refundTransaction?.livemode).toBe(true);
      expect(payment.livemode).toBe(true);
      await expect(
        updateAppRevenueSource(liveCtx.ownerUserId, liveCtx.appId, "stripe")
      ).rejects.toMatchObject({ code: "revenue_source_locked" });
    }
    finally {
      await cleanupTestContext(liveCtx);
    }
  });

  it("keeps identical payment, refund, and dispute IDs isolated by API key mode", async () => {
    const modeCtx = await seedAttributionGraph({ includeAttribution: false });
    await updateAppRevenueSource(modeCtx.ownerUserId, modeCtx.appId, "api");
    await getDb().insert(customers).values({
      id: modeCtx.customerId,
      appId: modeCtx.appId,
      externalCustomerId: `mode-customer-${modeCtx.suffix}`,
    });
    const paymentId = `pay_mode_scoped_${modeCtx.suffix}`;
    const refundId = `refund_mode_scoped_${modeCtx.suffix}`;
    const disputeId = `dispute_mode_scoped_${modeCtx.suffix}`;
    const liveKey = await createApiKey({
      userId: modeCtx.ownerUserId,
      kind: "app",
      organizationId: modeCtx.organizationId,
      appId: modeCtx.appId,
      name: `Live mode isolation key ${modeCtx.suffix}`,
      testMode: false,
    });
    modeCtx.affiliateApiKeyIds = [liveKey.id];
    modeCtx.rateLimitScopes.push(`report-payment:${modeCtx.apiKeyId}`);
    modeCtx.rateLimitScopes.push(`report-refund:${modeCtx.apiKeyId}`);
    modeCtx.rateLimitScopes.push(`report-dispute:${modeCtx.apiKeyId}`);
    modeCtx.rateLimitScopes.push(`report-payment:${liveKey.id}`);
    modeCtx.rateLimitScopes.push(`report-refund:${liveKey.id}`);
    modeCtx.rateLimitScopes.push(`report-dispute:${liveKey.id}`);

    try {
      const testPayment = await reportPayment(appKeyAuth(modeCtx), {
        paymentId,
        customerId: modeCtx.customerId,
        programId: modeCtx.programId,
        amount: 1200,
        currency: "usd",
      });
      const livePayment = await reportPayment(
        appKeyAuth(modeCtx, { keyId: liveKey.id, testMode: false }),
        {
          paymentId,
          customerId: modeCtx.customerId,
          programId: modeCtx.programId,
          amount: 1200,
          currency: "usd",
        }
      );

      const testRefund = await reportRefund(appKeyAuth(modeCtx), {
        refundId,
        paymentId,
        amount: 600,
      });
      const liveRefund = await reportRefund(
        appKeyAuth(modeCtx, { keyId: liveKey.id, testMode: false }),
        {
          refundId,
          paymentId,
          amount: 600,
        }
      );
      const testDispute = await reportDispute(appKeyAuth(modeCtx), {
        disputeId,
        paymentId,
        status: "won",
        amount: 600,
      });
      const liveDispute = await reportDispute(
        appKeyAuth(modeCtx, { keyId: liveKey.id, testMode: false }),
        {
          disputeId,
          paymentId,
          status: "won",
          amount: 600,
        }
      );

      expect(testPayment).toMatchObject({ created: true, livemode: false });
      expect(livePayment).toMatchObject({ created: true, livemode: true });
      expect(testRefund).toMatchObject({ created: true, livemode: false });
      expect(liveRefund).toMatchObject({ created: true, livemode: true });
      expect(testPayment.transaction_id).not.toBe(livePayment.transaction_id);
      expect(testRefund.transaction_id).not.toBe(liveRefund.transaction_id);
      expect(testRefund.commission_entry_id).toBeNull();
      expect(liveRefund.commission_entry_id).toBeNull();
      expect(testDispute).toMatchObject({ created: true, livemode: false });
      expect(liveDispute).toMatchObject({ created: true, livemode: true });

      const db = getDb();
      const paymentRows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.externalId, paymentId));
      const refundRows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.externalId, refundId));

      expect(paymentRows).toHaveLength(2);
      expect(refundRows).toHaveLength(2);
      expect(new Set(paymentRows.map((row) => row.livemode))).toEqual(
        new Set([false, true])
      );
      expect(new Set(refundRows.map((row) => row.livemode))).toEqual(
        new Set([false, true])
      );
    }
    finally {
      await cleanupTestContext(modeCtx);
    }
  });

  it("rejects payment identity reuse across revenue sources", async () => {
    const sourceCtx = await seedAttributionGraph({ affiliateTestMode: true });
    const paymentId = `pay_source_identity_${sourceCtx.suffix}`;

    try {
      await createTransactionRecord({
        appId: sourceCtx.appId,
        source: "stripe",
        externalId: paymentId,
        programId: sourceCtx.programId,
        customerId: sourceCtx.customerId,
        programAffiliateId: sourceCtx.programAffiliateId,
        action: "payment",
        amount: 1000,
        currency: "usd",
        livemode: false,
        transactionDate: new Date(),
      });
      await updateAppRevenueSource(
        sourceCtx.ownerUserId,
        sourceCtx.appId,
        "api"
      );
      sourceCtx.rateLimitScopes.push(`report-payment:${sourceCtx.apiKeyId}`);

      await expect(reportPayment(appKeyAuth(sourceCtx), {
        paymentId,
        customerId: sourceCtx.customerId,
        programId: sourceCtx.programId,
        amount: 1000,
        currency: "usd",
      })).rejects.toMatchObject({ code: "transaction_id_conflict" });
    }
    finally {
      await cleanupTestContext(sourceCtx);
    }
  });

  it("rejects a refund when the App source switches while it waits for the row lock", async () => {
    const raceCtx = await seedAttributionGraph({ affiliateTestMode: true });
    const paymentId = `pay_source_race_${raceCtx.suffix}`;
    const refundId = `refund_source_race_${raceCtx.suffix}`;

    try {
      await updateAppRevenueSource(
        raceCtx.ownerUserId,
        raceCtx.appId,
        "api"
      );
      raceCtx.rateLimitScopes.push(`report-payment:${raceCtx.apiKeyId}`);
      raceCtx.rateLimitScopes.push(`report-refund:${raceCtx.apiKeyId}`);
      await reportPayment(appKeyAuth(raceCtx), {
        paymentId,
        customerId: raceCtx.customerId,
        programId: raceCtx.programId,
        amount: 1000,
        currency: "usd",
      });

      let refundResult: Promise<
        | { status: "fulfilled" }
        | { status: "rejected"; reason: unknown }
      > | null = null;
      const db = getDb();

      await db.transaction(async (tx) => {
        await tx
          .select({ id: apps.id })
          .from(apps)
          .where(eq(apps.id, raceCtx.appId))
          .for("update");

        refundResult = reportRefund(appKeyAuth(raceCtx), {
          refundId,
          paymentId,
          amount: 500,
        }).then(
          () => ({ status: "fulfilled" as const }),
          (reason: unknown) => ({ status: "rejected" as const, reason })
        );

        await new Promise((resolve) => setTimeout(resolve, 100));
        await tx
          .update(apps)
          .set({ revenueSource: "stripe", updatedAt: new Date() })
          .where(eq(apps.id, raceCtx.appId));
      });

      const outcome = await refundResult!;
      const refundRows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.externalId, refundId));

      expect(outcome.status).toBe("rejected");
      if (outcome.status === "rejected") {
        expect(outcome.reason).toMatchObject({
          code: "revenue_source_conflict",
        });
      }
      expect(refundRows).toHaveLength(0);
    }
    finally {
      await cleanupTestContext(raceCtx);
    }
  });

  it("does not let a test API key refund a live payment", async () => {
    const liveCtx = await seedAttributionGraph();
    await updateAppRevenueSource(liveCtx.ownerUserId, liveCtx.appId, "api");
    const paymentId = `pay_live_isolation_${liveCtx.suffix}`;
    const liveKey = await createApiKey({
      userId: liveCtx.ownerUserId,
      kind: "app",
      organizationId: liveCtx.organizationId,
      appId: liveCtx.appId,
      name: `Live isolation key ${liveCtx.suffix}`,
      testMode: false,
    });
    liveCtx.affiliateApiKeyIds = [liveKey.id];
    liveCtx.rateLimitScopes.push(`report-payment:${liveKey.id}`);
    liveCtx.rateLimitScopes.push(`report-refund:${liveKey.id}`);
    liveCtx.rateLimitScopes.push(`report-refund:${liveCtx.apiKeyId}`);

    try {
      const livePayment = await reportPayment(
        appKeyAuth(liveCtx, { keyId: liveKey.id, testMode: false }),
        {
          paymentId,
          customerId: liveCtx.customerId,
          programId: liveCtx.programId,
          amount: 1200,
          currency: "usd",
        }
      );

      await expect(
        reportRefund(appKeyAuth(liveCtx), {
          refundId: `refund_test_key_${liveCtx.suffix}`,
          paymentId,
          amount: 600,
        })
      ).rejects.toMatchObject({ code: "payment_not_found" });

      const db = getDb();
      const refundRows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.parentTransactionId, livePayment.transaction_id));

      expect(refundRows).toHaveLength(0);
    }
    finally {
      await cleanupTestContext(liveCtx);
    }
  });
});
