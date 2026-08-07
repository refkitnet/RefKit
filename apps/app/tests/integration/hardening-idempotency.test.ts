import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  commissionEntries,
  revenueDisputes,
  stripeEvents,
  transactions,
} from "@/db/schema";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";
import { createSandboxStripeConnection } from "@/services/stripe/connected-accounts";
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

describe("hardening idempotency", () => {
  describe("out-of-order webhook delivery", () => {
    let ctx: TestContext;
    let stripeAccountId: string;
    let sessionId: string;
    let chargeId: string;
    let refundStoredEventId: string;
    let refundProcessingError: Error | null = null;

    beforeAll(async () => {
      setStripeFetcherForTests(createFixtureFetcher());
      clearFixtureObjects();

      ctx = await seedAttributionGraph({ affiliateTestMode: true });
      const connection = await createSandboxStripeConnection(ctx.appId);
      ctx.stripeConnectionId = connection.id;
      stripeAccountId = connection.stripeAccountId;

      sessionId = `cs_test_ooo_${ctx.suffix}`;
      chargeId = `ch_fixture_${sessionId.replace("cs_", "")}`;

      registerCheckoutPaymentFixture({
        stripeAccountId,
        sessionId,
        chargeId,
        amount: 5000,
        currency: "usd",
        metadata: {
          refkit_click_id: ctx.clickId,
          refkit_customer_id: ctx.customerId,
          refkit_program_id: ctx.programId,
        },
        paymentStatus: "paid",
        mode: "payment",
      });

      const refundId = `re_ooo_${ctx.suffix}`;
      registerRefundFixture({
        stripeAccountId,
        chargeId,
        refundId,
        amount: 5000,
        currency: "usd",
      });

      const refundEvent = buildStripeEvent({
        id: `evt_refund_ooo_${ctx.suffix}`,
        type: "charge.refunded",
        account: stripeAccountId,
        livemode: false,
        object: {
          id: chargeId,
          object: "charge",
          amount: 5000,
          currency: "usd",
          refunds: {
            data: [
              {
                id: refundId,
                object: "refund",
                amount: 5000,
                currency: "usd",
                created: Math.floor(Date.now() / 1000),
              },
            ],
          },
        },
      });

      const refundStored = await ingestStripeEvent({
        stripeAccountId,
        event: refundEvent,
      });

      refundStoredEventId = refundStored!.id;
      try {
        await processStoredStripeEvent(refundStoredEventId);
      }
      catch (error) {
        refundProcessingError = error as Error;
      }
    });

    afterAll(async () => {
      clearFixtureObjects();
      setStripeFetcherForTests(null);
      await cleanupTestContext(ctx);
    });

    async function countMoneyRecords() {
      const db = getDb();

      const txnCount = await db
        .select({ id: transactions.id })
        .from(transactions)
        .where(eq(transactions.stripeConnectionId, ctx.stripeConnectionId!));

      const entryCount = await db
        .select({ id: commissionEntries.id })
        .from(commissionEntries)
        .where(eq(commissionEntries.programId, ctx.programId));

      return { txnCount: txnCount.length, entryCount: entryCount.length };
    }

    it("keeps an unmatched refund failed without creating money records", async () => {
      const counts = await countMoneyRecords();
      const [storedEvent] = await getDb()
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.id, refundStoredEventId));

      expect(refundProcessingError?.message).toContain(
        "waiting for its parent payment transaction"
      );
      expect(storedEvent.processingStatus).toBe("failed");
      expect(counts.txnCount).toBe(0);
      expect(counts.entryCount).toBe(0);
    });

    it("creates earned entry on checkout then reversal after refund reprocess", async () => {
      const checkoutEvent = buildStripeEvent({
        id: `evt_checkout_ooo_${ctx.suffix}`,
        type: "checkout.session.completed",
        account: stripeAccountId,
        livemode: false,
        object: {
          id: sessionId,
          object: "checkout.session",
          mode: "payment",
          payment_status: "paid",
          amount_total: 5000,
          currency: "usd",
          metadata: {
            refkit_click_id: ctx.clickId,
            refkit_customer_id: ctx.customerId,
            refkit_program_id: ctx.programId,
          },
        },
      });

      const checkoutStored = await ingestStripeEvent({
        stripeAccountId,
        event: checkoutEvent,
      });

      await processStoredStripeEvent(checkoutStored!.id);

      let counts = await countMoneyRecords();
      expect(counts.txnCount).toBe(1);
      expect(counts.entryCount).toBe(1);

      const db = getDb();
      await processStoredStripeEvent(refundStoredEventId);

      counts = await countMoneyRecords();
      expect(counts.txnCount).toBe(2);
      expect(counts.entryCount).toBe(2);

      const reversals = await db
        .select()
        .from(commissionEntries)
        .where(
          and(
            eq(commissionEntries.programId, ctx.programId),
            eq(commissionEntries.kind, "refund_reversal")
          )
        );

      expect(reversals).toHaveLength(1);
      expect(reversals[0].amount).toBe(-1000);
      expect(reversals[0].originalAmount).toBe(-5000);
    });
  });

  describe("out-of-order dispute delivery", () => {
    let ctx: TestContext;
    let stripeAccountId: string;
    let sessionId: string;
    let chargeId: string;
    let disputeId: string;
    let disputeStoredEventId: string;
    let disputeProcessingError: Error | null = null;

    beforeAll(async () => {
      setStripeFetcherForTests(createFixtureFetcher());
      clearFixtureObjects();

      ctx = await seedAttributionGraph({ affiliateTestMode: true });
      const connection = await createSandboxStripeConnection(ctx.appId);
      ctx.stripeConnectionId = connection.id;
      stripeAccountId = connection.stripeAccountId;
      sessionId = `cs_dispute_ooo_${ctx.suffix}`;
      chargeId = `ch_fixture_${sessionId.replace("cs_", "")}`;
      disputeId = `dp_ooo_${ctx.suffix}`;

      registerCheckoutPaymentFixture({
        stripeAccountId,
        sessionId,
        chargeId,
        amount: 4000,
        currency: "usd",
        metadata: {
          refkit_click_id: ctx.clickId,
          refkit_customer_id: ctx.customerId,
          refkit_program_id: ctx.programId,
        },
        paymentStatus: "paid",
        mode: "payment",
      });
      const dispute = {
        id: disputeId,
        object: "dispute",
        charge: chargeId,
        amount: 2000,
        currency: "usd",
        status: "needs_response",
      };
      registerFixtureObject(stripeAccountId, "dispute", dispute);
      const stored = await ingestStripeEvent({
        stripeAccountId,
        event: buildStripeEvent({
          id: `evt_dispute_ooo_${ctx.suffix}`,
          type: "charge.dispute.created",
          account: stripeAccountId,
          livemode: false,
          object: dispute,
        }),
      });

      disputeStoredEventId = stored!.id;
      try {
        await processStoredStripeEvent(disputeStoredEventId);
      }
      catch (error) {
        disputeProcessingError = error as Error;
      }
    });

    afterAll(async () => {
      clearFixtureObjects();
      setStripeFetcherForTests(null);
      await cleanupTestContext(ctx);
    });

    it("keeps an unmatched dispute failed without creating money records", async () => {
      const db = getDb();
      const [storedEvent] = await db
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.id, disputeStoredEventId));
      const paymentRows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.stripeConnectionId, ctx.stripeConnectionId!));
      const disputeRows = await db
        .select()
        .from(revenueDisputes)
        .where(eq(revenueDisputes.appId, ctx.appId));

      expect(disputeProcessingError?.message).toContain(
        "waiting for its parent payment transaction"
      );
      expect(storedEvent.processingStatus).toBe("failed");
      expect(paymentRows).toHaveLength(0);
      expect(disputeRows).toHaveLength(0);
    });

    it("applies the failed dispute after its parent payment arrives", async () => {
      const { session } = registerCheckoutPaymentFixture({
        stripeAccountId,
        sessionId,
        chargeId,
        amount: 4000,
        currency: "usd",
        metadata: {
          refkit_click_id: ctx.clickId,
          refkit_customer_id: ctx.customerId,
          refkit_program_id: ctx.programId,
        },
        paymentStatus: "paid",
        mode: "payment",
      });
      const checkoutStored = await ingestStripeEvent({
        stripeAccountId,
        event: buildStripeEvent({
          id: `evt_dispute_parent_${ctx.suffix}`,
          type: "checkout.session.completed",
          account: stripeAccountId,
          livemode: false,
          object: session,
        }),
      });
      await processStoredStripeEvent(checkoutStored!.id);
      await processStoredStripeEvent(disputeStoredEventId);

      const db = getDb();
      const [dispute] = await db
        .select()
        .from(revenueDisputes)
        .where(eq(revenueDisputes.externalId, disputeId));
      const [earned] = await db
        .select()
        .from(commissionEntries)
        .where(
          and(
            eq(commissionEntries.programId, ctx.programId),
            eq(commissionEntries.kind, "earned")
          )
        );
      const [storedEvent] = await db
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.id, disputeStoredEventId));

      expect(dispute).toMatchObject({ status: "opened", amount: 2000 });
      expect(earned.status).toBe("disputed");
      expect(storedEvent.processingStatus).toBe("processed");
    });
  });

  describe("replay processed Stripe event", () => {
    let ctx: TestContext;
    let storedEventId: string;

    beforeAll(async () => {
      setStripeFetcherForTests(createFixtureFetcher());
      clearFixtureObjects();

      ctx = await seedAttributionGraph({ affiliateTestMode: true });
      const connection = await createSandboxStripeConnection(ctx.appId);
      ctx.stripeConnectionId = connection.id;

      const sessionId = `cs_test_replay_${ctx.suffix}`;
      const chargeId = `ch_fixture_${sessionId.replace("cs_", "")}`;

      const { session } = registerCheckoutPaymentFixture({
        stripeAccountId: connection.stripeAccountId,
        sessionId,
        chargeId,
        amount: 3000,
        currency: "usd",
        metadata: {
          refkit_click_id: ctx.clickId,
          refkit_customer_id: ctx.customerId,
          refkit_program_id: ctx.programId,
        },
        paymentStatus: "paid",
        mode: "payment",
      });

      const stored = await ingestStripeEvent({
        stripeAccountId: connection.stripeAccountId,
        event: buildStripeEvent({
          id: `evt_replay_${ctx.suffix}`,
          type: "checkout.session.completed",
          account: connection.stripeAccountId,
          livemode: false,
          object: session,
        }),
      });

      storedEventId = stored!.id;
      await processStoredStripeEvent(storedEventId);
    });

    afterAll(async () => {
      clearFixtureObjects();
      setStripeFetcherForTests(null);
      await cleanupTestContext(ctx);
    });

    it("does not duplicate money records when processing runs again", async () => {
      await processStoredStripeEvent(storedEventId, { force: true });

      const db = getDb();

      const txnRows = await db
        .select()
        .from(transactions)
        .where(eq(transactions.stripeConnectionId, ctx.stripeConnectionId!));

      const earnedRows = await db
        .select()
        .from(commissionEntries)
        .where(
          and(
            eq(commissionEntries.programId, ctx.programId),
            eq(commissionEntries.kind, "earned")
          )
        );

      expect(txnRows).toHaveLength(1);
      expect(txnRows[0].amount).toBe(3000);
      expect(earnedRows).toHaveLength(1);
      expect(earnedRows[0].amount).toBe(600);

      const [event] = await db
        .select()
        .from(stripeEvents)
        .where(eq(stripeEvents.id, storedEventId));

      expect(event.processingStatus).toBe("processed");
    });
  });
});
