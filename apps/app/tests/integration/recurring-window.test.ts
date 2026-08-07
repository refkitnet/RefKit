import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { commissionEntries, commissionRules, transactions } from "@/db/schema";
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
import {
  clearFixtureObjects,
  createFixtureFetcher,
  setStripeFetcherForTests,
} from "@/services/stripe/fetcher";

describe("recurring commission window", () => {
  let ctx: TestContext;
  let stripeAccountId: string;

  beforeAll(async () => {
    setStripeFetcherForTests(null);
    setStripeFetcherForTests(createFixtureFetcher());
    clearFixtureObjects();

    ctx = await seedAttributionGraph({
      recurringDurationMonths: 1,
      affiliateTestMode: true,
    });

    const db = getDb();
    await db
      .update(commissionRules)
      .set({ recurringDurationMonths: 1 })
      .where(eq(commissionRules.id, ctx.ruleId));

    const connection = await createSandboxStripeConnection(ctx.appId);
    ctx.stripeConnectionId = connection.id;
    stripeAccountId = connection.stripeAccountId;
  });

  afterAll(async () => {
    clearFixtureObjects();
    setStripeFetcherForTests(null);
    await cleanupTestContext(ctx);
  });

  async function ingestCheckout(sessionId: string, createdUnix: number) {
    const { session } = registerCheckoutPaymentFixture({
      stripeAccountId,
      sessionId,
      amount: 5000,
      currency: "usd",
      metadata: {
        refkit_click_id: ctx.clickId,
        refkit_customer_id: ctx.customerId,
        refkit_program_id: ctx.programId,
      },
      paymentStatus: "paid",
      mode: "payment",
      created: createdUnix,
    });

    const event = buildStripeEvent({
      id: `evt_${sessionId.replace("cs_", "")}`,
      type: "checkout.session.completed",
      account: stripeAccountId,
      livemode: false,
      created: createdUnix,
      object: session,
    });

    const stored = await ingestStripeEvent({ stripeAccountId, event });
    await processStoredStripeEvent(stored!.id);
  }

  async function getEarnedRows() {
    const db = getDb();

    return db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.programId, ctx.programId),
          eq(commissionEntries.kind, "earned")
        )
      );
  }

  it("earns during the window and stops after it expires", async () => {
    const firstCreated = Math.floor(Date.now() / 1000);
    const firstSessionId = `cs_first_${ctx.suffix}`;

    await ingestCheckout(firstSessionId, firstCreated);

    let earnedRows = await getEarnedRows();
    expect(earnedRows).toHaveLength(1);
    expect(earnedRows[0].amount).toBe(1000);

    const tenDaysLater = firstCreated + 10 * 24 * 60 * 60;
    const midWindowSessionId = `cs_mid_${ctx.suffix}`;

    await ingestCheckout(midWindowSessionId, tenDaysLater);

    earnedRows = await getEarnedRows();
    expect(earnedRows).toHaveLength(2);
    expect(earnedRows.every((row) => row.amount === 1000)).toBe(true);

    const twoMonthsLater = new Date(firstCreated * 1000);
    twoMonthsLater.setMonth(twoMonthsLater.getMonth() + 2);
    const expiredCreated = Math.floor(twoMonthsLater.getTime() / 1000);
    const expiredSessionId = `cs_expired_${ctx.suffix}`;

    await ingestCheckout(expiredSessionId, expiredCreated);

    const db = getDb();
    const txnRows = await db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.programId, ctx.programId),
          eq(transactions.action, "payment")
        )
      );

    earnedRows = await getEarnedRows();
    expect(txnRows).toHaveLength(3);
    expect(earnedRows).toHaveLength(2);
  });
});
