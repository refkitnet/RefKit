import { and, eq } from "drizzle-orm";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getDb } from "@/db/client";
import { commissionEntries, stripeEvents, transactions } from "@/db/schema";
import { listAdminStripeEvents } from "@/services/admin/list";
import { createSandboxStripeConnection } from "@/services/stripe/connected-accounts";
import {
  ingestStripeEvent,
  isStripeEventStuck,
  processStoredStripeEvent,
  receiveVerifiedStripeWebhook,
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
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

describe("synchronous Stripe event processing", () => {
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

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function createCheckoutEvent(suffix: string) {
    const sessionId = `cs_sync_${suffix}_${ctx.suffix}`;
    const chargeId = `ch_sync_${suffix}_${ctx.suffix}`;
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

    return buildStripeEvent({
      id: `evt_sync_${suffix}_${ctx.suffix}`,
      type: "checkout.session.completed",
      account: stripeAccountId,
      livemode: false,
      object: session,
    });
  }

  it("rejects missing accounts when the direct fallback is unset", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STRIPE_DIRECT_ACCOUNT_ID", undefined);
    const event: Record<string, unknown> = {
      ...createCheckoutEvent("missing-account"),
    };
    delete event.account;

    await expect(receiveVerifiedStripeWebhook(event)).rejects.toThrow(
      "Stripe webhook event missing connected account field."
    );
  });

  it("uses the direct account fallback in nonproduction", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("STRIPE_DIRECT_ACCOUNT_ID", stripeAccountId);
    const event: Record<string, unknown> = {
      ...createCheckoutEvent("direct-account"),
    };
    delete event.account;

    const result = await receiveVerifiedStripeWebhook(event);

    expect(result?.stripeConnectionId).toBe(ctx.stripeConnectionId);
    expect(result?.processingStatus).toBe("processed");
  });

  it("ignores the direct account fallback in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("STRIPE_DIRECT_ACCOUNT_ID", stripeAccountId);
    const event: Record<string, unknown> = {
      ...createCheckoutEvent("production-direct-account"),
    };
    delete event.account;

    await expect(receiveVerifiedStripeWebhook(event)).rejects.toThrow(
      "Stripe webhook event missing connected account field."
    );
  });

  it("finishes money processing before the verified webhook returns", async () => {
    const result = await receiveVerifiedStripeWebhook(createCheckoutEvent("ok"));

    expect(result?.processingStatus).toBe("processed");
    expect(result?.processingAttempts).toBe(1);

    const db = getDb();
    const txnRows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.stripeEventId, result!.id));
    const entryRows = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.transactionId, txnRows[0].id));

    expect(txnRows).toHaveLength(1);
    expect(txnRows[0].amount).toBe(5000);
    expect(entryRows).toHaveLength(1);
    expect(entryRows[0].amount).toBe(1000);
    expect(entryRows[0].status).toBe("approved");
    expect(entryRows[0].approvedAt).not.toBeNull();
  });

  it("records a failure and processes the same event on Stripe redelivery", async () => {
    const event = createCheckoutEvent("retry");
    const fixtureFetcher = createFixtureFetcher();
    setStripeFetcherForTests({
      ...fixtureFetcher,
      retrieveCheckoutSession: async () => {
        throw new Error("forced synchronous processing failure");
      },
    });

    await expect(receiveVerifiedStripeWebhook(event)).rejects.toThrow(
      "forced synchronous processing failure"
    );

    const db = getDb();
    const [failed] = await db
      .select()
      .from(stripeEvents)
      .where(
        and(
          eq(stripeEvents.stripeConnectionId, ctx.stripeConnectionId!),
          eq(stripeEvents.stripeEventId, String(event.id))
        )
      );

    expect(failed.processingStatus).toBe("failed");
    expect(failed.processingAttempts).toBe(1);
    expect(failed.lastProcessingError).toContain("forced synchronous");

    const attention = await listAdminStripeEvents(
      { limit: 25 },
      { attentionOnly: true }
    );
    expect(attention.data.map((row) => row.id)).toContain(failed.id);

    setStripeFetcherForTests(fixtureFetcher);
    const processed = await receiveVerifiedStripeWebhook(event);

    expect(processed?.processingStatus).toBe("processed");
    expect(processed?.processingAttempts).toBe(2);
    expect(processed?.lastProcessingError).toBeNull();
  });

  it("does not process concurrent duplicate deliveries twice", async () => {
    const event = createCheckoutEvent("concurrent");
    const fixtureFetcher = createFixtureFetcher();
    let releaseFetch!: () => void;
    let signalFetchStarted!: () => void;
    const fetchStarted = new Promise<void>((resolve) => {
      signalFetchStarted = resolve;
    });
    const fetchGate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });

    setStripeFetcherForTests({
      ...fixtureFetcher,
      retrieveCheckoutSession: async (sessionId, accountId) => {
        signalFetchStarted();
        await fetchGate;
        return fixtureFetcher.retrieveCheckoutSession(sessionId, accountId);
      },
    });

    const firstDelivery = receiveVerifiedStripeWebhook(event);
    await fetchStarted;

    await expect(receiveVerifiedStripeWebhook(event)).rejects.toThrow(
      "already being processed"
    );

    releaseFetch();
    const processed = await firstDelivery;
    setStripeFetcherForTests(fixtureFetcher);

    const txnRows = await getDb()
      .select()
      .from(transactions)
      .where(eq(transactions.stripeEventId, processed!.id));
    const entryRows = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.transactionId, txnRows[0].id));

    expect(processed?.processingStatus).toBe("processed");
    expect(processed?.processingAttempts).toBe(1);
    expect(txnRows).toHaveLength(1);
    expect(entryRows).toHaveLength(1);
  });

  it("surfaces and reclaims an event stuck for five minutes", async () => {
    const stored = await ingestStripeEvent({
      stripeAccountId,
      event: buildStripeEvent({
        id: `evt_stuck_${ctx.suffix}`,
        type: "customer.created",
        account: stripeAccountId,
        livemode: false,
        object: { id: `cus_stuck_${ctx.suffix}` },
      }),
    });
    const staleAt = new Date(Date.now() - 6 * 60 * 1000);
    const [stuck] = await getDb()
      .update(stripeEvents)
      .set({
        processingStatus: "processing",
        processingStartedAt: staleAt,
        updatedAt: staleAt,
      })
      .where(eq(stripeEvents.id, stored!.id))
      .returning();

    expect(isStripeEventStuck(stuck)).toBe(true);

    const processed = await processStoredStripeEvent(stuck.id);
    expect(processed?.processingStatus).toBe("processed");
    expect(processed?.processingAttempts).toBe(1);
    expect(isStripeEventStuck(processed!)).toBe(false);
  });
});
