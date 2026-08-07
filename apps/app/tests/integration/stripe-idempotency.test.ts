import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { commissionEntries, stripeEvents, transactions } from "@/db/schema";
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
} from "@/services/stripe/fixtures";
import { injectChargeRefundedEvent } from "@/services/stripe/test-inject";
import {
  clearFixtureObjects,
  createFixtureFetcher,
  registerFixtureObject,
  setStripeFetcherForTests,
} from "@/services/stripe/fetcher";

describe("stripe webhook idempotency", () => {
  let ctx: TestContext;
  let stripeAccountId: string;
  let sessionId: string;
  let chargeId: string;
  let stripeEventId: string;
  let storedEventId: string;

  beforeAll(async () => {
    setStripeFetcherForTests(null);
    setStripeFetcherForTests(createFixtureFetcher());
    clearFixtureObjects();

    ctx = await seedAttributionGraph({ affiliateTestMode: true });
    const connection = await createSandboxStripeConnection(ctx.appId);
    ctx.stripeConnectionId = connection.id;
    stripeAccountId = connection.stripeAccountId;

    sessionId = `cs_test_${ctx.suffix}`;
    chargeId = `ch_fixture_${sessionId.replace("cs_", "")}`;
    stripeEventId = `evt_checkout_${ctx.suffix}`;

    const { session } = registerCheckoutPaymentFixture({
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

    const event = buildStripeEvent({
      id: stripeEventId,
      type: "checkout.session.completed",
      account: stripeAccountId,
      livemode: false,
      object: session,
    });

    const storedEvent = await ingestStripeEvent({
      stripeAccountId,
      event,
    });

    expect(storedEvent).not.toBeNull();
    storedEventId = storedEvent!.id;

    await processStoredStripeEvent(storedEventId);
  });

  afterAll(async () => {
    clearFixtureObjects();
    setStripeFetcherForTests(null);
    await cleanupTestContext(ctx);
  });

  async function countPaymentRecords() {
    const db = getDb();

    const txnRows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.stripeConnectionId, ctx.stripeConnectionId!),
          eq(transactions.action, "payment")
        )
      );

    const earnedRows = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.programId, ctx.programId),
          eq(commissionEntries.kind, "earned")
        )
      );

    return { txnRows, earnedRows };
  }

  it("creates one payment transaction and one earned commission entry", async () => {
    const { txnRows, earnedRows } = await countPaymentRecords();

    expect(txnRows).toHaveLength(1);
    expect(txnRows[0].amount).toBe(5000);
    expect(txnRows[0].action).toBe("payment");
    expect(txnRows[0].livemode).toBe(false);
    expect(txnRows[0].stripeChargeId).toBe(chargeId);

    expect(earnedRows).toHaveLength(1);
    expect(earnedRows[0].amount).toBe(1000);
    expect(earnedRows[0].status).toBe("approved");
    expect(earnedRows[0].approvedAt).not.toBeNull();
  });

  it("replays processing without duplicating records", async () => {
    await processStoredStripeEvent(storedEventId);

    const duplicateIngest = await ingestStripeEvent({
      stripeAccountId,
      event: buildStripeEvent({
        id: stripeEventId,
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
      }),
    });

    expect(duplicateIngest?.id).toBe(storedEventId);

    const { txnRows, earnedRows } = await countPaymentRecords();
    expect(txnRows).toHaveLength(1);
    expect(earnedRows).toHaveLength(1);
  });

  it("creates one refund reversal and ignores replay", async () => {
    const refundId = `re_idem_${ctx.suffix}`;
    const refundStored = await injectChargeRefundedEvent({
      appId: ctx.appId,
      chargeId,
      refundId,
      amount: 2500,
      currency: "usd",
      metadata: {
        refkit_click_id: ctx.clickId,
        refkit_customer_id: ctx.customerId,
        refkit_program_id: ctx.programId,
      },
    });

    expect(refundStored).not.toBeNull();
    await processStoredStripeEvent(refundStored!.id);

    const db = getDb();
    const reversalRows = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.programId, ctx.programId),
          eq(commissionEntries.kind, "refund_reversal")
        )
      );

    expect(reversalRows).toHaveLength(1);
    expect(reversalRows[0].amount).toBe(-500);
    expect(reversalRows[0].originalAmount).toBe(-2500);
    expect(reversalRows[0].stripeRefundId).toBe(refundId);

    await processStoredStripeEvent(refundStored!.id);

    const reversalRowsAfterReplay = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.programId, ctx.programId),
          eq(commissionEntries.kind, "refund_reversal")
        )
      );

    expect(reversalRowsAfterReplay).toHaveLength(1);
  });

  it("handles dispute lifecycle with idempotent reinstatement", async () => {
    const disputeId = `dp_test_${ctx.suffix}`;

    registerFixtureObject(stripeAccountId, "dispute", {
      id: disputeId,
      object: "dispute",
      charge: chargeId,
      amount: 2500,
      currency: "usd",
      status: "needs_response",
    });

    const createdEvent = buildStripeEvent({
      id: `evt_dispute_created_${ctx.suffix}`,
      type: "charge.dispute.created",
      account: stripeAccountId,
      livemode: false,
      object: {
        id: disputeId,
        object: "dispute",
        charge: chargeId,
        amount: 2500,
        status: "needs_response",
      },
    });

    const createdStored = await ingestStripeEvent({
      stripeAccountId,
      event: createdEvent,
    });
    await processStoredStripeEvent(createdStored!.id);

    const db = getDb();
    const [earnedAfterDispute] = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.programId, ctx.programId),
          eq(commissionEntries.kind, "earned")
        )
      );

    expect(earnedAfterDispute.status).toBe("disputed");
    expect(earnedAfterDispute.statusBeforeDispute).toBe("approved");

    registerFixtureObject(stripeAccountId, "dispute", {
      id: disputeId,
      object: "dispute",
      charge: chargeId,
      amount: 2500,
      currency: "usd",
      status: "lost",
    });

    const closedEvent = buildStripeEvent({
      id: `evt_dispute_closed_${ctx.suffix}`,
      type: "charge.dispute.closed",
      account: stripeAccountId,
      livemode: false,
      object: {
        id: disputeId,
        object: "dispute",
        charge: chargeId,
        amount: 2500,
        status: "lost",
      },
    });

    const closedStored = await ingestStripeEvent({
      stripeAccountId,
      event: closedEvent,
    });
    await processStoredStripeEvent(closedStored!.id);

    const reversalRows = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.stripeDisputeId, disputeId),
          eq(commissionEntries.kind, "dispute_reversal")
        )
      );

    expect(reversalRows).toHaveLength(1);
    expect(reversalRows[0].amount).toBe(-500);
    expect(reversalRows[0].originalAmount).toBe(-2500);
    expect(reversalRows[0].status).toBe("approved");

    const [earnedAfterLoss] = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.programId, ctx.programId),
          eq(commissionEntries.kind, "earned")
        )
      );

    expect(earnedAfterLoss.status).toBe("approved");

    registerFixtureObject(stripeAccountId, "dispute", {
      id: disputeId,
      object: "dispute",
      charge: chargeId,
      amount: 2500,
      currency: "usd",
      status: "lost",
    });

    const reinstatedEvent = buildStripeEvent({
      id: `evt_dispute_reinstated_${ctx.suffix}`,
      type: "charge.dispute.funds_reinstated",
      account: stripeAccountId,
      livemode: false,
      object: {
        id: disputeId,
        object: "dispute",
        charge: chargeId,
        amount: 2500,
        status: "lost",
      },
    });

    const reinstatedStored = await ingestStripeEvent({
      stripeAccountId,
      event: reinstatedEvent,
    });
    await processStoredStripeEvent(reinstatedStored!.id);

    const reinstatementRows = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.stripeDisputeId, disputeId),
          eq(commissionEntries.kind, "dispute_reinstatement")
        )
      );

    expect(reinstatementRows).toHaveLength(1);
    expect(reinstatementRows[0].amount).toBe(500);
    expect(reinstatementRows[0].originalAmount).toBe(2500);

    await processStoredStripeEvent(reinstatedStored!.id);

    const reinstatementAfterReplay = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.stripeDisputeId, disputeId),
          eq(commissionEntries.kind, "dispute_reinstatement")
        )
      );

    expect(reinstatementAfterReplay).toHaveLength(1);

    const eventCount = await db
      .select()
      .from(stripeEvents)
      .where(eq(stripeEvents.stripeConnectionId, ctx.stripeConnectionId!));

    expect(eventCount).toHaveLength(5);
  });

  it("maps a closed Stripe warning to a withdrawn dispute", async () => {
    const disputeId = `dp_warning_${ctx.suffix}`;
    const warningSessionId = `cs_warning_${ctx.suffix}`;
    const warningChargeId = `ch_fixture_${warningSessionId.replace("cs_", "")}`;
    const db = getDb();
    const { session } = registerCheckoutPaymentFixture({
      stripeAccountId,
      sessionId: warningSessionId,
      chargeId: warningChargeId,
      amount: 2500,
      currency: "usd",
      metadata: {
        refkit_click_id: ctx.clickId,
        refkit_customer_id: ctx.customerId,
        refkit_program_id: ctx.programId,
      },
      paymentStatus: "paid",
      mode: "payment",
    });
    const payment = await ingestStripeEvent({
      stripeAccountId,
      event: buildStripeEvent({
        id: `evt_warning_payment_${ctx.suffix}`,
        type: "checkout.session.completed",
        account: stripeAccountId,
        livemode: false,
        object: session,
      }),
    });
    await processStoredStripeEvent(payment!.id);

    registerFixtureObject(stripeAccountId, "dispute", {
      id: disputeId,
      object: "dispute",
      charge: warningChargeId,
      amount: 2500,
      currency: "usd",
      status: "warning_needs_response",
    });
    const opened = await ingestStripeEvent({
      stripeAccountId,
      event: buildStripeEvent({
        id: `evt_dispute_warning_created_${ctx.suffix}`,
        type: "charge.dispute.created",
        account: stripeAccountId,
        livemode: false,
        object: {
          id: disputeId,
          object: "dispute",
          charge: warningChargeId,
          amount: 2500,
          currency: "usd",
          status: "warning_needs_response",
        },
      }),
    });
    await processStoredStripeEvent(opened!.id);

    registerFixtureObject(stripeAccountId, "dispute", {
      id: disputeId,
      object: "dispute",
      charge: warningChargeId,
      amount: 2500,
      currency: "usd",
      status: "warning_closed",
    });
    const closed = await ingestStripeEvent({
      stripeAccountId,
      event: buildStripeEvent({
        id: `evt_dispute_warning_closed_${ctx.suffix}`,
        type: "charge.dispute.closed",
        account: stripeAccountId,
        livemode: false,
        object: {
          id: disputeId,
          object: "dispute",
          charge: warningChargeId,
          amount: 2500,
          currency: "usd",
          status: "warning_closed",
        },
      }),
    });
    await processStoredStripeEvent(closed!.id);

    const [earned] = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.programId, ctx.programId),
          eq(commissionEntries.kind, "earned")
        )
      );

    expect(earned.status).toBe("approved");
  });
});
