import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  commissionEntries,
  payoutItems,
  payoutRequestItems,
  payoutRequests,
  payoutBatches,
  programAffiliates,
  programs,
  transactions,
  users,
} from "@/db/schema";
import {
  decryptPayoutDetails,
  encryptPayoutDetails,
} from "@/lib/crypto";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";
import { createApiKey } from "@/services/api-keys";
import { updateAppRevenueSource } from "@/services/apps";
import { computePayableBalance } from "@/services/payouts/balance";
import {
  reportPayment,
  reportRefund,
} from "@/services/revenue/report-payment";
import { saveAffiliatePayoutDetails } from "@/services/payouts/payout-details";
import {
  createPayoutRequest,
  declinePayoutRequest,
} from "@/services/payouts/payout-requests";
import {
  cancelPayoutRun,
  createPayoutRun,
  generatePayoutRunCsv,
  getPayoutItemsForRun,
  listPayoutRunsForAffiliateUser,
  markPayoutRunPaid,
  resolvePayoutItem,
} from "@/services/payouts/payout-batches";
import {
  listReadyPayouts,
  markReadyPayoutPaid,
} from "@/services/payouts/ready-payouts";
import { createSandboxStripeConnection } from "@/services/stripe/connected-accounts";

async function configureProgramForPayouts(ctx: TestContext) {
  const db = getDb();

  await db
    .update(programs)
    .set({
      minimumPayoutAmount: 5000,
      supportedPayoutMethods: ["paypal"],
    })
    .where(eq(programs.id, ctx.programId));
}

async function seedApprovedCommission(
  ctx: TestContext,
  input: {
    amount: number;
    livemode?: boolean;
    suffix?: string;
  }
) {
  const db = getDb();
  const connection =
    ctx.stripeConnectionId ??
    (await createSandboxStripeConnection(ctx.appId)).id;
  ctx.stripeConnectionId = connection;

  const entrySuffix = input.suffix ?? ctx.suffix;
  const transactionId = generateId(ID_PREFIXES.transaction);
  const entryId = generateId(ID_PREFIXES.commissionEntry);

  await db.insert(transactions).values({
    id: transactionId,
    appId: ctx.appId,
    source: "stripe",
    externalId: `cs_${entrySuffix}`,
    stripeConnectionId: connection,
    programId: ctx.programId,
    customerId: ctx.customerId,
    programAffiliateId: ctx.programAffiliateId,
    stripeObjectId: `cs_${entrySuffix}`,
    stripeChargeId: `ch_${entrySuffix}`,
    action: "payment",
    amount: input.amount * 5,
    currency: "usd",
    livemode: input.livemode ?? true,
    transactionDate: new Date(),
  });

  await db.insert(commissionEntries).values({
    id: entryId,
    transactionId,
    programId: ctx.programId,
    programAffiliateId: ctx.programAffiliateId,
    customerId: ctx.customerId,
    ruleId: ctx.ruleId,
    kind: "earned",
    amount: input.amount,
    currency: "usd",
    exchangeRate: "1",
    originalAmount: input.amount * 5,
    originalCurrency: "usd",
    status: "approved",
    livemode: input.livemode ?? true,
  });

  return entryId;
}

describe("payout encryption", () => {
  it("encrypts and decrypts payout details", () => {
    const plaintext = JSON.stringify({ email: "affiliate@example.com" });
    const encrypted = encryptPayoutDetails(plaintext);

    expect(encrypted).not.toContain("affiliate@example.com");
    expect(decryptPayoutDetails(encrypted)).toBe(plaintext);
  });
});

describe("payout detail tenant isolation", () => {
  it("does not reuse one membership's payout details in another Program", async () => {
    const first = await seedAttributionGraph();
    const second = await seedAttributionGraph();

    try {
      await Promise.all([
        configureProgramForPayouts(first),
        configureProgramForPayouts(second),
      ]);
      await getDb()
        .update(programAffiliates)
        .set({ userId: first.affiliateUserId })
        .where(eq(programAffiliates.id, second.programAffiliateId));
      await getDb()
        .update(users)
        .set({ email: `+formula-${first.suffix}@example.com` })
        .where(eq(users.id, first.affiliateUserId));

      await saveAffiliatePayoutDetails(first.programAffiliateId, "paypal", {
        email: `private-${first.suffix}@example.com`,
      });
      await seedApprovedCommission(first, {
        amount: 6000,
        suffix: `tenant-a-${first.suffix}`,
      });
      await seedApprovedCommission(second, {
        amount: 6000,
        suffix: `tenant-b-${second.suffix}`,
      });

      const secondRun = await createPayoutRun(
        second.ownerUserId,
        second.programId
      );

      await expect(
        generatePayoutRunCsv(second.ownerUserId, secondRun.id)
      ).rejects.toMatchObject({ code: "payout_details_missing" });

      await saveAffiliatePayoutDetails(second.programAffiliateId, "paypal", {
        "=2+2": "blocked",
        email: `private-${second.suffix}@example.com`,
      });

      const secondCsv = await generatePayoutRunCsv(
        second.ownerUserId,
        secondRun.id
      );
      expect(secondCsv).toContain(`private-${second.suffix}@example.com`);
      expect(secondCsv).not.toContain(`private-${first.suffix}@example.com`);
      expect(secondCsv).toContain("'=2+2=blocked");
      expect(secondCsv).toContain(`'+formula-${first.suffix}@example.com`);

      const firstRun = await createPayoutRun(first.ownerUserId, first.programId);
      const firstCsv = await generatePayoutRunCsv(
        first.ownerUserId,
        firstRun.id
      );
      expect(firstCsv).toContain(`private-${first.suffix}@example.com`);
      expect(firstCsv).not.toContain(`private-${second.suffix}@example.com`);
    }
    finally {
      await getDb()
        .update(programAffiliates)
        .set({ userId: second.affiliateUserId })
        .where(eq(programAffiliates.id, second.programAffiliateId));
      await cleanupTestContext(second);
      await cleanupTestContext(first);
    }
  });
});

describe("payable balance", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    await configureProgramForPayouts(ctx);
    await seedApprovedCommission(ctx, { amount: 10000, suffix: "live-earned" });
    await seedApprovedCommission(ctx, {
      amount: -3000,
      suffix: "live-reversal",
    });
    await seedApprovedCommission(ctx, {
      amount: 9000,
      livemode: false,
      suffix: "test-earned",
    });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("nets negative carry-forward and excludes test-mode entries", async () => {
    const balance = await computePayableBalance(
      ctx.programAffiliateId,
      ctx.programId
    );

    expect(balance.amount).toBe(7000);
    expect(balance.currency).toBe("usd");
  });
});

describe("payout positive-total guards", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    await getDb()
      .update(programs)
      .set({
        minimumPayoutAmount: 0,
        supportedPayoutMethods: ["paypal"],
      })
      .where(eq(programs.id, ctx.programId));
    await saveAffiliatePayoutDetails(ctx.programAffiliateId, "paypal", {
      email: `affiliate-${ctx.suffix}@refkit-vitest.test`,
    });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("rejects zero requests and non-positive batches but allows positive net", async () => {
    await expect(
      createPayoutRequest(ctx.affiliateUserId, ctx.programId)
    ).rejects.toMatchObject({ code: "no_payable_balance" });

    async function insertAdjustment(amount: number, label: string) {
      await getDb().insert(commissionEntries).values({
        id: generateId(ID_PREFIXES.commissionEntry),
        programId: ctx.programId,
        programAffiliateId: ctx.programAffiliateId,
        kind: "adjustment",
        amount,
        currency: "usd",
        status: "approved",
        sourceEventId: `payout-total-${label}-${ctx.suffix}`,
        livemode: true,
      });
    }

    await insertAdjustment(-100, "negative");
    await expect(
      createPayoutRun(ctx.ownerUserId, ctx.programId)
    ).rejects.toMatchObject({ code: "no_payable_entries" });

    await insertAdjustment(100, "zero-net");
    await expect(
      createPayoutRun(ctx.ownerUserId, ctx.programId)
    ).rejects.toMatchObject({ code: "no_payable_entries" });

    await insertAdjustment(1, "positive-net");
    const run = await createPayoutRun(ctx.ownerUserId, ctx.programId);
    const items = await getPayoutItemsForRun(run.id);

    expect(run.status).toBe("draft");
    expect(items.reduce((total, item) => total + item.amount, 0)).toBe(1);
  });
});

describe("payout status transitions", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    await configureProgramForPayouts(ctx);
    await saveAffiliatePayoutDetails(ctx.programAffiliateId, "paypal", {
      email: `affiliate-${ctx.suffix}@refkit-vitest.test`,
    });
    await seedApprovedCommission(ctx, {
      amount: 6000,
      suffix: "status-earned",
    });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("allows legal transitions and rejects illegal ones", async () => {
    const request = await createPayoutRequest(
      ctx.affiliateUserId,
      ctx.programId
    );
    expect(request.status).toBe("open");

    await expect(
      declinePayoutRequest(ctx.ownerUserId, request.id, "Not this cycle")
    ).resolves.toMatchObject({ status: "declined" });

    await expect(
      declinePayoutRequest(ctx.ownerUserId, request.id, "Again")
    ).rejects.toMatchObject({ code: "invalid_payout_request_transition" });

    const retryRequest = await createPayoutRequest(
      ctx.affiliateUserId,
      ctx.programId
    );
    expect(retryRequest.status).toBe("open");
    expect(retryRequest.amount).toBe(6000);

    const retryAllocations = await getDb()
      .select()
      .from(payoutRequestItems)
      .where(eq(payoutRequestItems.payoutRequestId, retryRequest.id));
    expect(retryAllocations).toHaveLength(1);

    const run = await createPayoutRun(ctx.ownerUserId, ctx.programId);
    expect(run.status).toBe("draft");

    const items = await getPayoutItemsForRun(run.id);
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(6000);
    expect(items[0].currency).toBe("usd");

    await expect(
      markPayoutRunPaid(ctx.ownerUserId, run.id)
    ).rejects.toMatchObject({ code: "invalid_payout_run_transition" });

    for (const item of items) {
      await resolvePayoutItem(ctx.ownerUserId, run.id, item.id, {
        status: "paid",
      });
    }

    await generatePayoutRunCsv(ctx.ownerUserId, run.id);

    const [preparedRun] = await getDb()
      .select()
      .from(payoutBatches)
      .where(eq(payoutBatches.id, run.id))
      .limit(1);
    expect(preparedRun?.status).toBe("prepared");

    const paidRun = await markPayoutRunPaid(ctx.ownerUserId, run.id);
    expect(paidRun.status).toBe("paid");

    const [fulfilledRetryRequest] = await getDb()
      .select()
      .from(payoutRequests)
      .where(eq(payoutRequests.id, retryRequest.id))
      .limit(1);
    expect(fulfilledRetryRequest?.status).toBe("fulfilled");

    await expect(
      markPayoutRunPaid(ctx.ownerUserId, run.id)
    ).rejects.toMatchObject({ code: "invalid_payout_run_transition" });

    await expect(
      cancelPayoutRun(ctx.ownerUserId, run.id)
    ).rejects.toMatchObject({ code: "invalid_payout_run_transition" });
  });
});

describe("payout item uniqueness", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    await configureProgramForPayouts(ctx);
    await seedApprovedCommission(ctx, {
      amount: 4500,
      suffix: "unique-entry",
    });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("prevents duplicate active payout items for the same commission entry", async () => {
    const entryId = (
      await getDb()
        .select({ id: commissionEntries.id })
        .from(commissionEntries)
        .where(eq(commissionEntries.programId, ctx.programId))
        .limit(1)
    )[0]?.id;

    expect(entryId).toBeTruthy();

    const firstRun = await createPayoutRun(ctx.ownerUserId, ctx.programId);
    await cancelPayoutRun(ctx.ownerUserId, firstRun.id);

    const secondRun = await createPayoutRun(ctx.ownerUserId, ctx.programId);
    const db = getDb();

    await expect(
      db.insert(payoutItems).values({
        id: generateId(ID_PREFIXES.payoutItem),
        payoutBatchId: secondRun.id,
        commissionEntryId: entryId!,
        programAffiliateId: ctx.programAffiliateId,
        amount: 4500,
        currency: "usd",
        status: "pending",
        batchStatus: "draft",
      })
    ).rejects.toMatchObject({
      cause: {
        code: "23505",
      },
    });

    const activeItems = await db
      .select()
      .from(payoutItems)
      .where(eq(payoutItems.commissionEntryId, entryId!));
    expect(
      activeItems.filter((item) => item.batchStatus !== "cancelled")
    ).toHaveLength(1);

    await cancelPayoutRun(ctx.ownerUserId, secondRun.id);
  });
});

describe("full payout loop", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    await configureProgramForPayouts(ctx);
    await saveAffiliatePayoutDetails(ctx.programAffiliateId, "paypal", {
      email: `affiliate-${ctx.suffix}@refkit-vitest.test`,
    });
    await seedApprovedCommission(ctx, {
      amount: 8000,
      suffix: "loop-earned",
    });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("lists and pays one affiliate without a preparation step", async () => {
    const payoutRequest = await createPayoutRequest(
      ctx.affiliateUserId,
      ctx.programId
    );
    expect(payoutRequest.status).toBe("open");

    const ready = await listReadyPayouts(ctx.ownerUserId, ctx.programId);
    expect(ready).toEqual([
      expect.objectContaining({
        programAffiliateId: ctx.programAffiliateId,
        amount: 8000,
        requested: true,
      }),
    ]);

    const payout = await markReadyPayoutPaid(
      ctx.ownerUserId,
      ctx.programId,
      ctx.programAffiliateId,
      { externalReference: "manual-transfer-001" }
    );
    expect(payout.status).toBe("paid");
    expect(payout.amount).toBe(8000);
    expect(payout.payoutBatch.status).toBe("paid");

    const db = getDb();
    const [snapshottedItem] = await db
      .select()
      .from(payoutItems)
      .where(eq(payoutItems.payoutBatchId, payout.payoutBatch.id))
      .limit(1);
    expect(snapshottedItem?.payoutDetailsSnapshotEncrypted).toBeTruthy();

    const [fulfilledRequest] = await db
      .select()
      .from(payoutRequests)
      .where(eq(payoutRequests.id, payoutRequest.id))
      .limit(1);

    expect(fulfilledRequest?.status).toBe("fulfilled");
    expect(fulfilledRequest?.payoutBatchId).toBe(payout.payoutBatch.id);

    const [paidEntry] = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.programId, ctx.programId))
      .limit(1);
    expect(paidEntry?.status).toBe("paid");
    await expect(
      listReadyPayouts(ctx.ownerUserId, ctx.programId)
    ).resolves.toEqual([]);
  });
});

describe("failed payout item release", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    await configureProgramForPayouts(ctx);
    await saveAffiliatePayoutDetails(ctx.programAffiliateId, "paypal", {
      email: `affiliate-${ctx.suffix}@refkit-vitest.test`,
    });
    await seedApprovedCommission(ctx, {
      amount: 5500,
      suffix: "failed-release",
    });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("releases commission entries when a payout item fails", async () => {
    const run = await createPayoutRun(ctx.ownerUserId, ctx.programId);
    const [item] = await getPayoutItemsForRun(run.id);

    await generatePayoutRunCsv(ctx.ownerUserId, run.id);
    await resolvePayoutItem(ctx.ownerUserId, run.id, item.id, {
      status: "failed",
      failureReason: "Invalid payout details",
    });

    const balance = await computePayableBalance(
      ctx.programAffiliateId,
      ctx.programId
    );

    expect(balance.amount).toBe(5500);

    const db = getDb();
    const [entry] = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.programId, ctx.programId))
      .limit(1);

    expect(entry?.status).toBe("approved");

    await cancelPayoutRun(ctx.ownerUserId, run.id);
  });
});

describe("payout export snapshots", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    await configureProgramForPayouts(ctx);
    await seedApprovedCommission(ctx, {
      amount: 6000,
      suffix: "snapshot-validation",
    });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("keeps a run draft when payout details cannot be snapshotted", async () => {
    const run = await createPayoutRun(ctx.ownerUserId, ctx.programId);

    await expect(
      generatePayoutRunCsv(ctx.ownerUserId, run.id)
    ).rejects.toMatchObject({ code: "payout_details_missing" });

    const db = getDb();
    const [draftRun] = await db
      .select()
      .from(payoutBatches)
      .where(eq(payoutBatches.id, run.id))
      .limit(1);
    const [draftItem] = await db
      .select()
      .from(payoutItems)
      .where(eq(payoutItems.payoutBatchId, run.id))
      .limit(1);

    expect(draftRun?.status).toBe("draft");
    expect(draftItem?.batchStatus).toBe("draft");
    expect(draftItem?.payoutDetailsSnapshotEncrypted).toBeNull();

    await expect(
      saveAffiliatePayoutDetails(ctx.programAffiliateId, "paypal", {
        email: `affiliate-${ctx.suffix}@refkit-vitest.test`,
      })
    ).resolves.toMatchObject({ method: "paypal" });

    await expect(
      generatePayoutRunCsv(ctx.ownerUserId, run.id)
    ).resolves.toContain(`affiliate-${ctx.suffix}@refkit-vitest.test`);

    await cancelPayoutRun(ctx.ownerUserId, run.id);
  });
});

describe("recovery debt payout offsets", () => {
  let ctx: TestContext;
  let recoveryDebtId: string;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    await configureProgramForPayouts(ctx);
    await saveAffiliatePayoutDetails(ctx.programAffiliateId, "paypal", {
      email: `affiliate-${ctx.suffix}@refkit-vitest.test`,
    });
    await seedApprovedCommission(ctx, {
      amount: 6000,
      suffix: "debt-first-earned",
    });
    await seedApprovedCommission(ctx, {
      amount: 6000,
      suffix: "debt-second-earned",
    });

    recoveryDebtId = generateId(ID_PREFIXES.commissionEntry);
    await getDb().insert(commissionEntries).values({
      id: recoveryDebtId,
      programId: ctx.programId,
      programAffiliateId: ctx.programAffiliateId,
      kind: "recovery_debt",
      amount: 10000,
      currency: "usd",
      status: "outstanding",
      livemode: true,
    });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("withholds and settles recovery debt in a global payout run", async () => {
    const run = await createPayoutRun(ctx.ownerUserId, ctx.programId);
    const items = await getPayoutItemsForRun(run.id);

    expect(items.reduce((sum, item) => sum + item.amount, 0)).toBe(2000);
    expect(items.some((item) => item.amount === 0)).toBe(true);

    await generatePayoutRunCsv(ctx.ownerUserId, run.id);

    for (const item of items) {
      await resolvePayoutItem(ctx.ownerUserId, run.id, item.id, {
        status: "paid",
      });
    }

    await markPayoutRunPaid(ctx.ownerUserId, run.id);

    const db = getDb();
    const [recoveryDebt] = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, recoveryDebtId))
      .limit(1);
    expect(recoveryDebt?.status).toBe("settled");

    await expect(
      computePayableBalance(ctx.programAffiliateId, ctx.programId)
    ).resolves.toMatchObject({ amount: 0, outstandingDebt: 0 });

    await seedApprovedCommission(ctx, {
      amount: 3000,
      suffix: "debt-after-settlement",
    });

    const nextRun = await createPayoutRun(ctx.ownerUserId, ctx.programId);
    const nextItems = await getPayoutItemsForRun(nextRun.id);
    expect(nextItems.reduce((sum, item) => sum + item.amount, 0)).toBe(3000);

    await cancelPayoutRun(ctx.ownerUserId, nextRun.id);
  });
});

describe("recovery debt creation on refund after payout", () => {
  let ctx: TestContext;
  let liveKeyId: string;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    await configureProgramForPayouts(ctx);
    await saveAffiliatePayoutDetails(ctx.programAffiliateId, "paypal", {
      email: `affiliate-${ctx.suffix}@refkit-vitest.test`,
    });
    await updateAppRevenueSource(ctx.ownerUserId, ctx.appId, "api");

    const liveKey = await createApiKey({
      userId: ctx.ownerUserId,
      kind: "app",
      organizationId: ctx.organizationId,
      appId: ctx.appId,
      name: `Live debt trigger key ${ctx.suffix}`,
      testMode: false,
    });
    liveKeyId = liveKey.id;
    ctx.affiliateApiKeyIds = [...(ctx.affiliateApiKeyIds ?? []), liveKey.id];
    ctx.rateLimitScopes.push(`report-payment:${liveKeyId}`);
    ctx.rateLimitScopes.push(`report-refund:${liveKeyId}`);
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("creates outstanding recovery debt when a refund arrives after payout", async () => {
    const auth = {
      type: "app_key" as const,
      userId: ctx.ownerUserId,
      keyId: liveKeyId,
      organizationId: ctx.organizationId,
      appId: ctx.appId,
      testMode: false,
    };
    const paymentId = `pay_debt_trigger_${ctx.suffix}`;

    const payment = await reportPayment(auth, {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 30000,
      currency: "usd",
    });

    expect(payment.livemode).toBe(true);
    expect(payment.commission_entry_id).toBeTruthy();

    const payout = await markReadyPayoutPaid(
      ctx.ownerUserId,
      ctx.programId,
      ctx.programAffiliateId,
      { externalReference: "manual-transfer-debt-trigger" }
    );
    expect(payout.status).toBe("paid");
    expect(payout.amount).toBe(6000);

    const db = getDb();
    const [paidEntry] = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, payment.commission_entry_id!))
      .limit(1);
    expect(paidEntry?.status).toBe("paid");

    const refund = await reportRefund(auth, {
      refundId: `refund_debt_trigger_${ctx.suffix}`,
      paymentId,
      amount: 10000,
    });

    expect(refund.created).toBe(true);
    expect(refund.commission_entry_id).toBeTruthy();

    const [debtEntry] = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, refund.commission_entry_id!))
      .limit(1);

    expect(debtEntry?.kind).toBe("recovery_debt");
    expect(debtEntry?.amount).toBe(2000);
    expect(debtEntry?.status).toBe("outstanding");
    expect(debtEntry?.livemode).toBe(true);

    const reversalRows = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.programId, ctx.programId));
    expect(
      reversalRows.filter((row) => row.kind === "refund_reversal")
    ).toHaveLength(0);

    await expect(
      computePayableBalance(ctx.programAffiliateId, ctx.programId)
    ).resolves.toMatchObject({ outstandingDebt: 2000 });
  });
});

describe("cumulative recovery-debt rounding", () => {
  let ctx: TestContext;
  let liveKeyId: string;

  beforeAll(async () => {
    ctx = await seedAttributionGraph({ commissionPercent: 50 });
    await getDb()
      .update(programs)
      .set({
        minimumPayoutAmount: 0,
        supportedPayoutMethods: ["paypal"],
      })
      .where(eq(programs.id, ctx.programId));
    await saveAffiliatePayoutDetails(ctx.programAffiliateId, "paypal", {
      email: `affiliate-${ctx.suffix}@refkit-vitest.test`,
    });
    await updateAppRevenueSource(ctx.ownerUserId, ctx.appId, "api");

    const liveKey = await createApiKey({
      userId: ctx.ownerUserId,
      kind: "app",
      organizationId: ctx.organizationId,
      appId: ctx.appId,
      name: `Live cumulative debt key ${ctx.suffix}`,
      testMode: false,
    });
    liveKeyId = liveKey.id;
    ctx.affiliateApiKeyIds = [...(ctx.affiliateApiKeyIds ?? []), liveKey.id];
    ctx.rateLimitScopes.push(`report-payment:${liveKeyId}`);
    ctx.rateLimitScopes.push(`report-refund:${liveKeyId}`);
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("recovers the rounded commission target across tiny partial refunds", async () => {
    const auth = {
      type: "app_key" as const,
      userId: ctx.ownerUserId,
      keyId: liveKeyId,
      organizationId: ctx.organizationId,
      appId: ctx.appId,
      testMode: false,
    };
    const paymentId = `pay_tiny_debt_${ctx.suffix}`;
    const payment = await reportPayment(auth, {
      paymentId,
      customerId: ctx.customerId,
      programId: ctx.programId,
      amount: 3,
      currency: "usd",
    });

    expect(payment.commission_entry_id).toBeTruthy();
    const payout = await markReadyPayoutPaid(
      ctx.ownerUserId,
      ctx.programId,
      ctx.programAffiliateId,
      { externalReference: "manual-transfer-tiny-rounding" }
    );
    expect(payout.amount).toBe(2);

    for (let index = 1; index <= 3; index += 1) {
      await reportRefund(auth, {
        refundId: `refund_tiny_debt_${index}_${ctx.suffix}`,
        paymentId,
        amount: 1,
      });
    }

    const entries = await getDb()
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.programId, ctx.programId));
    const recoveryDebt = entries
      .filter((entry) => entry.kind === "recovery_debt")
      .reduce((total, entry) => total + entry.amount, 0);

    expect(recoveryDebt).toBe(2);
  });
});

describe("affiliate payout run listing", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    await configureProgramForPayouts(ctx);
    await seedApprovedCommission(ctx, {
      amount: 7000,
      suffix: "affiliate-list",
    });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("lists payout runs for an affiliate user", async () => {
    const run = await createPayoutRun(ctx.ownerUserId, ctx.programId);

    const affiliateKey = await createApiKey({
      userId: ctx.affiliateUserId,
      kind: "affiliate",
      name: `Affiliate key ${ctx.suffix}`,
    });
    ctx.affiliateApiKeyIds = [affiliateKey.id];

    const result = await listPayoutRunsForAffiliateUser(ctx.affiliateUserId, {
      limit: 25,
    });

    expect(result.data.some((row) => row.id === run.id)).toBe(true);

    await cancelPayoutRun(ctx.ownerUserId, run.id);
  });
});
