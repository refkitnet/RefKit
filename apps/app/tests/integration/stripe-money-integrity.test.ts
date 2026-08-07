import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  affiliatePromotionCodes,
  commissionEntries,
  customers,
  programAffiliates,
  programs,
  referrals,
  stripeConnections,
  stripeEvents,
  transactions,
  users,
} from "@/db/schema";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import {
  createSandboxStripeConnection,
  recordStripeAppAuthorization,
} from "@/services/stripe/connected-accounts";
import {
  ingestStripeEvent,
  processStoredStripeEvent,
} from "@/services/stripe/event-processor";
import {
  buildStripeEvent,
  registerCheckoutPaymentFixture,
  registerRefundFixture,
} from "@/services/stripe/fixtures";
import {
  clearFixtureObjects,
  createFixtureFetcher,
  registerFixtureObject,
  setStripeFetcherForTests,
} from "@/services/stripe/fetcher";
import { resolveAttributionFromMetadata } from "@/services/stripe/attribution";
import { createProgram } from "@/services/programs";
import { getAppSetupStatus } from "@/services/apps/setup-status";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

describe("Stripe money integrity", () => {
  let ctx: TestContext;
  let stripeAccountId: string;

  beforeAll(async () => {
    ctx = await seedAttributionGraph({ affiliateTestMode: true });
    const connection = await createSandboxStripeConnection(ctx.appId);
    ctx.stripeConnectionId = connection.id;
    stripeAccountId = connection.stripeAccountId;
    setStripeFetcherForTests(createFixtureFetcher());
    clearFixtureObjects();
  });

  afterAll(async () => {
    clearFixtureObjects();
    setStripeFetcherForTests(null);
    await cleanupTestContext(ctx);
  });

  async function processEvent(event: Record<string, unknown>) {
    const stored = await ingestStripeEvent({ stripeAccountId, event });
    expect(stored).not.toBeNull();
    await processStoredStripeEvent(stored!.id);
  }

  async function processInvoice(suffix: string, amount: number) {
    const invoiceId = `in_integrity_${suffix}_${ctx.suffix}`;
    const invoicePaymentId = `inpay_integrity_${suffix}_${ctx.suffix}`;
    const paymentIntentId = `pi_integrity_${suffix}_${ctx.suffix}`;
    const chargeId = `ch_integrity_${suffix}_${ctx.suffix}`;
    const created = Math.floor(Date.now() / 1000);
    const metadata = {
      refkit_click_id: ctx.clickId,
      refkit_customer_id: ctx.customerId,
      refkit_program_id: ctx.programId,
    };
    const invoicePayment = {
      id: invoicePaymentId,
      object: "invoice_payment",
      invoice: invoiceId,
      amount_paid: amount,
      status: "paid",
      payment: {
        type: "payment_intent",
        payment_intent: paymentIntentId,
      },
    };
    const invoice = {
      id: invoiceId,
      object: "invoice",
      amount_paid: amount,
      currency: "usd",
      created,
      metadata,
      payments: { data: [invoicePayment] },
    };

    registerFixtureObject(stripeAccountId, "invoice", invoice);
    registerFixtureObject(stripeAccountId, "invoice_payment", invoicePayment);
    registerFixtureObject(stripeAccountId, "payment_intent", {
      id: paymentIntentId,
      object: "payment_intent",
      latest_charge: chargeId,
    });
    registerFixtureObject(stripeAccountId, "charge", {
      id: chargeId,
      object: "charge",
      amount,
      currency: "usd",
      metadata,
    });

    await processEvent(buildStripeEvent({
      id: `evt_invoice_integrity_${suffix}_${ctx.suffix}`,
      type: "invoice.paid",
      account: stripeAccountId,
      livemode: false,
      object: invoice,
    }));

    return { invoiceId, chargeId };
  }

  it("links modern invoice payments to the exact refunded and disputed charge", async () => {
    const first = await processInvoice("first", 5000);
    const second = await processInvoice("second", 7000);
    const db = getDb();
    const paymentRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.stripeConnectionId, ctx.stripeConnectionId!));
    const firstPayment = paymentRows.find(
      (row) => row.externalId === first.invoiceId
    )!;
    const secondPayment = paymentRows.find(
      (row) => row.externalId === second.invoiceId
    )!;

    expect(firstPayment.stripeChargeId).toBe(first.chargeId);
    expect(secondPayment.stripeChargeId).toBe(second.chargeId);

    const refundId = `re_integrity_${ctx.suffix}`;
    registerRefundFixture({
      stripeAccountId,
      chargeId: second.chargeId,
      refundId,
      amount: 3500,
      currency: "usd",
    });
    await processEvent(buildStripeEvent({
      id: `evt_refund_integrity_${ctx.suffix}`,
      type: "charge.refunded",
      account: stripeAccountId,
      livemode: false,
      object: { id: second.chargeId },
    }));

    const [refund] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, refundId));
    const [reversal] = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.stripeRefundId, refundId));

    expect(refund.parentTransactionId).toBe(secondPayment.id);
    expect(reversal.transactionId).toBe(secondPayment.id);

    const disputeId = `dp_integrity_${ctx.suffix}`;
    registerFixtureObject(stripeAccountId, "dispute", {
      id: disputeId,
      object: "dispute",
      charge: second.chargeId,
      amount: 3500,
      currency: "usd",
      status: "needs_response",
    });
    await processEvent(buildStripeEvent({
      id: `evt_dispute_integrity_${ctx.suffix}`,
      type: "charge.dispute.created",
      account: stripeAccountId,
      livemode: false,
      object: {
        id: disputeId,
        charge: second.chargeId,
        amount: 3500,
        currency: "usd",
        status: "needs_response",
      },
    }));

    const earnedRows = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.programId, ctx.programId),
          eq(commissionEntries.kind, "earned")
        )
      );
    expect(
      earnedRows.find((entry) => entry.transactionId === firstPayment.id)?.status
    ).toBe("approved");
    expect(
      earnedRows.find((entry) => entry.transactionId === secondPayment.id)?.status
    ).toBe("disputed");
  });

  it("records refunds for unattributed Stripe payments", async () => {
    const sessionId = `cs_unattributed_${ctx.suffix}`;
    const { session, charge } = registerCheckoutPaymentFixture({
      stripeAccountId,
      sessionId,
      amount: 2000,
      currency: "usd",
      metadata: {},
      paymentStatus: "paid",
      mode: "payment",
    });
    const chargeId = charge.id;
    await processEvent(buildStripeEvent({
      id: `evt_unattributed_payment_${ctx.suffix}`,
      type: "checkout.session.completed",
      account: stripeAccountId,
      livemode: false,
      object: session,
    }));

    const refundId = `re_unattributed_${ctx.suffix}`;
    registerRefundFixture({
      stripeAccountId,
      chargeId,
      refundId,
      amount: 1000,
      currency: "usd",
    });
    await processEvent(buildStripeEvent({
      id: `evt_unattributed_refund_${ctx.suffix}`,
      type: "charge.refunded",
      account: stripeAccountId,
      livemode: false,
      object: { id: chargeId },
    }));

    const [payment] = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, sessionId));
    const [refund] = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, refundId));
    const entries = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.transactionId, payment.id));

    expect(payment.programAffiliateId).toBeNull();
    expect(refund).toMatchObject({
      parentTransactionId: payment.id,
      amount: -1000,
    });
    expect(entries).toHaveLength(0);
    await expect(
      getAppSetupStatus(ctx.ownerUserId, ctx.appId)
    ).resolves.toMatchObject({ unattributed_revenue_alarm: true });
  });

  it("retries a paid Checkout event until its charge is resolvable", async () => {
    const sessionId = `cs_charge_pending_${ctx.suffix}`;
    const { session, paymentIntent, charge } = registerCheckoutPaymentFixture({
      stripeAccountId,
      sessionId,
      amount: 2000,
      currency: "usd",
      metadata: {
        refkit_click_id: ctx.clickId,
        refkit_customer_id: ctx.customerId,
        refkit_program_id: ctx.programId,
      },
      paymentStatus: "paid",
      mode: "payment",
    });
    registerFixtureObject(stripeAccountId, "payment_intent", {
      ...paymentIntent,
      latest_charge: null,
    });
    const stored = await ingestStripeEvent({
      stripeAccountId,
      event: buildStripeEvent({
        id: `evt_charge_pending_${ctx.suffix}`,
        type: "checkout.session.completed",
        account: stripeAccountId,
        livemode: false,
        object: session,
      }),
    });

    const pendingFetcher = createFixtureFetcher();
    setStripeFetcherForTests({
      ...pendingFetcher,
      retrievePaymentIntent: async () => ({
        ...paymentIntent,
        latest_charge: null,
      }),
    });

    await expect(processStoredStripeEvent(stored!.id)).rejects.toThrow(
      "waiting for its charge"
    );
    const [failed] = await getDb()
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.id, stored!.id));
    const paymentBeforeRetry = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, sessionId));

    expect(failed.processingStatus).toBe("failed");
    expect(paymentBeforeRetry).toHaveLength(0);

    setStripeFetcherForTests(createFixtureFetcher());
    registerFixtureObject(stripeAccountId, "payment_intent", paymentIntent);
    await expect(processStoredStripeEvent(stored!.id)).resolves.toMatchObject({
      processingStatus: "processed",
    });
    const [payment] = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, sessionId));

    expect(payment.stripeChargeId).toBe(charge.id);
  });

  it("records full refunds for unattributed Stripe payments", async () => {
    const sessionId = `cs_unattributed_full_${ctx.suffix}`;
    const { session, charge } = registerCheckoutPaymentFixture({
      stripeAccountId,
      sessionId,
      amount: 2000,
      currency: "usd",
      metadata: {},
      paymentStatus: "paid",
      mode: "payment",
    });
    await processEvent(buildStripeEvent({
      id: `evt_unattributed_full_payment_${ctx.suffix}`,
      type: "checkout.session.completed",
      account: stripeAccountId,
      livemode: false,
      object: session,
    }));

    const refundId = `re_unattributed_full_${ctx.suffix}`;
    registerRefundFixture({
      stripeAccountId,
      chargeId: charge.id,
      refundId,
      amount: 2000,
      currency: "usd",
    });
    await processEvent(buildStripeEvent({
      id: `evt_unattributed_full_refund_${ctx.suffix}`,
      type: "charge.refunded",
      account: stripeAccountId,
      livemode: false,
      object: { id: charge.id },
    }));

    const [payment] = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, sessionId));
    const [refund] = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.externalId, refundId));
    const entries = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.transactionId, payment.id));

    expect(refund).toMatchObject({
      parentTransactionId: payment.id,
      amount: -2000,
    });
    expect(entries).toHaveLength(0);
  });

  it("fails closed for both Stripe mode mismatches and queued retries", async () => {
    const authorization = await recordStripeAppAuthorization({
      stripeAccountId,
      livemode: true,
    });
    expect(authorization).toMatchObject({
      status: "mode_mismatch",
      connection: null,
    });

    const stored = await ingestStripeEvent({
      stripeAccountId,
      event: buildStripeEvent({
        id: `evt_mode_mismatch_${ctx.suffix}`,
        type: "account.application.deauthorized",
        account: stripeAccountId,
        livemode: true,
        object: { id: stripeAccountId },
      }),
    });
    const [connection] = await getDb()
      .select()
      .from(stripeConnections)
      .where(eq(stripeConnections.id, ctx.stripeConnectionId!));

    expect(stored).toBeNull();
    expect(connection).toMatchObject({ livemode: false, status: "connected" });

    const queued = await ingestStripeEvent({
      stripeAccountId,
      event: buildStripeEvent({
        id: `evt_mode_queued_${ctx.suffix}`,
        type: "customer.created",
        account: stripeAccountId,
        livemode: false,
        object: { id: `cus_mode_queued_${ctx.suffix}` },
      }),
    });
    expect(queued).not.toBeNull();

    await getDb()
      .update(stripeConnections)
      .set({ livemode: true })
      .where(eq(stripeConnections.id, ctx.stripeConnectionId!));

    try {
      const reverseMismatch = await ingestStripeEvent({
        stripeAccountId,
        event: buildStripeEvent({
          id: `evt_mode_reverse_${ctx.suffix}`,
          type: "customer.created",
          account: stripeAccountId,
          livemode: false,
          object: { id: `cus_mode_reverse_${ctx.suffix}` },
        }),
      });
      expect(reverseMismatch).toBeNull();

      await expect(processStoredStripeEvent(queued!.id)).rejects.toThrow(
        "Stored Stripe event mode does not match its connection mode."
      );
      const [failed] = await getDb()
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.id, queued!.id));
      expect(failed.processingStatus).toBe("failed");

      const matchingLive = await ingestStripeEvent({
        stripeAccountId,
        event: buildStripeEvent({
          id: `evt_mode_matching_live_${ctx.suffix}`,
          type: "customer.created",
          account: stripeAccountId,
          livemode: true,
          object: { id: `cus_mode_matching_live_${ctx.suffix}` },
        }),
      });
      expect(matchingLive).not.toBeNull();
      await expect(
        processStoredStripeEvent(matchingLive!.id)
      ).resolves.toMatchObject({
        livemode: true,
        processingStatus: "processed",
      });
    }
    finally {
      await getDb()
        .update(stripeConnections)
        .set({ livemode: false })
        .where(eq(stripeConnections.id, ctx.stripeConnectionId!));
    }
  });

  it("uses promotion codes only as enabled fallback and preserves referrals", async () => {
    const db = getDb();
    const otherUserId = generateId(ID_PREFIXES.user);
    const otherAffiliateId = generateId(ID_PREFIXES.affiliate);
    const promotionCodeId = `promo_integrity_${ctx.suffix}`;

    await db.insert(users).values({
      id: otherUserId,
      email: `promo-${ctx.suffix}@refkit-vitest.test`,
    });
    await db.insert(programAffiliates).values({
      id: otherAffiliateId,
      programId: ctx.programId,
      userId: otherUserId,
      status: "active",
      isTest: false,
    });
    await db.insert(affiliatePromotionCodes).values({
      id: `apc_${ctx.suffix}`,
      programAffiliateId: otherAffiliateId,
      programId: ctx.programId,
      stripePromotionCodeId: promotionCodeId,
      stripeCouponId: `coupon_${ctx.suffix}`,
      code: `CODE${ctx.suffix.slice(-6)}`,
    });

    const metadata = { refkit_customer_id: ctx.customerId };
    await expect(resolveAttributionFromMetadata({
      appId: ctx.appId,
      metadata,
      promotionCodeId,
    })).resolves.toBeNull();

    await db
      .update(programs)
      .set({ promotionCodeFallback: true })
      .where(eq(programs.id, ctx.programId));
    const attribution = await resolveAttributionFromMetadata({
      appId: ctx.appId,
      metadata,
      promotionCodeId,
    });

    expect(attribution?.affiliateId).toBe(ctx.programAffiliateId);
    expect(attribution?.affiliateId).not.toBe(otherAffiliateId);

    const fallbackCustomerId = generateId(ID_PREFIXES.customer);
    await db.insert(customers).values({
      id: fallbackCustomerId,
      appId: ctx.appId,
      externalCustomerId: `promo-fallback-${ctx.suffix}`,
    });

    const fallbackInput = {
      appId: ctx.appId,
      metadata: {
        refkit_customer_id: fallbackCustomerId,
        refkit_program_id: ctx.programId,
      },
      promotionCodeId,
    };
    const [firstFallback, concurrentFallback] = await Promise.all([
      resolveAttributionFromMetadata(fallbackInput),
      resolveAttributionFromMetadata(fallbackInput),
    ]);
    const fallbackReferrals = await db
      .select()
      .from(referrals)
      .where(eq(referrals.customerId, fallbackCustomerId));

    expect(firstFallback).toMatchObject({
      programId: ctx.programId,
      affiliateId: otherAffiliateId,
      customerId: fallbackCustomerId,
      clickId: null,
    });
    expect(concurrentFallback?.referralId).toBe(firstFallback?.referralId);
    expect(fallbackReferrals).toHaveLength(1);
    expect(fallbackReferrals[0]).toMatchObject({
      programId: ctx.programId,
      programAffiliateId: otherAffiliateId,
      clickId: null,
    });

    const invalidCustomerId = generateId(ID_PREFIXES.customer);
    await db.insert(customers).values({
      id: invalidCustomerId,
      appId: ctx.appId,
      externalCustomerId: `promo-invalid-${ctx.suffix}`,
    });
    await expect(resolveAttributionFromMetadata({
      appId: ctx.appId,
      metadata: {
        refkit_customer_id: invalidCustomerId,
        refkit_program_id: ctx.programId,
      },
      promotionCodeId: `promo_invalid_${ctx.suffix}`,
    })).resolves.toBeNull();

    const crossProgram = await createProgram(ctx.ownerUserId, {
      appId: ctx.appId,
      name: `Cross program ${ctx.suffix}`,
      slug: `cross-${ctx.suffix}`,
      currency: "usd",
      destinationUrl: ctx.destinationUrl,
      commissionRule: { rewardType: "percent", percentValue: 20 },
      promotionCodeFallback: true,
    });
    const crossProgramCustomerId = generateId(ID_PREFIXES.customer);
    await db.insert(customers).values({
      id: crossProgramCustomerId,
      appId: ctx.appId,
      externalCustomerId: `promo-cross-program-${ctx.suffix}`,
    });
    await expect(resolveAttributionFromMetadata({
      appId: ctx.appId,
      metadata: {
        refkit_customer_id: crossProgramCustomerId,
        refkit_program_id: crossProgram.program!.id,
      },
      promotionCodeId,
    })).resolves.toBeNull();

    const rejectedReferrals = await db
      .select({ customerId: referrals.customerId })
      .from(referrals)
      .where(
        and(
          eq(referrals.programId, ctx.programId),
          eq(referrals.customerId, invalidCustomerId)
        )
      );
    const crossProgramReferrals = await db
      .select({ customerId: referrals.customerId })
      .from(referrals)
      .where(eq(referrals.customerId, crossProgramCustomerId));

    expect(rejectedReferrals).toHaveLength(0);
    expect(crossProgramReferrals).toHaveLength(0);
  });
});
