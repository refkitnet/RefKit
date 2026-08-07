import { and, count, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  adminAuditLogs,
  commissionEntries,
  programAffiliates,
  transactions,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";
import {
  disableAffiliate,
  enableAffiliate,
} from "@/services/affiliates";
import { approvePendingAffiliate } from "@/services/affiliates/approve";
import {
  rejectFlaggedCommission,
  releaseFlaggedCommission,
} from "@/services/commissions";
import {
  pauseProgram,
  resumeProgram,
} from "@/services/programs";
import { createSandboxStripeConnection } from "@/services/stripe/connected-accounts";

describe("status transitions", () => {
  let ctx: TestContext;
  let flaggedEntryId: string;
  let flaggedTransactionId: string;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    const connection = await createSandboxStripeConnection(ctx.appId);
    ctx.stripeConnectionId = connection.id;

    const db = getDb();
    flaggedTransactionId = generateId(ID_PREFIXES.transaction);
    flaggedEntryId = generateId(ID_PREFIXES.commissionEntry);

    await db.insert(transactions).values({
        id: flaggedTransactionId,
        appId: ctx.appId,
        source: "stripe",
        externalId: `cs_flagged_${ctx.suffix}`,
        stripeConnectionId: connection.id,
        programId: ctx.programId,
        customerId: ctx.customerId,
        programAffiliateId: ctx.programAffiliateId,
        stripeObjectId: `cs_flagged_${ctx.suffix}`,
        stripeChargeId: `ch_flagged_${ctx.suffix}`,
        action: "payment",
        amount: 2500,
        currency: "usd",
        livemode: true,
        transactionDate: new Date(),
    });

    await db.insert(commissionEntries).values({
      id: flaggedEntryId,
      transactionId: flaggedTransactionId,
      programId: ctx.programId,
      programAffiliateId: ctx.programAffiliateId,
      customerId: ctx.customerId,
      ruleId: ctx.ruleId,
      kind: "earned",
      amount: 500,
      currency: "usd",
      exchangeRate: "1",
      originalAmount: 2500,
      originalCurrency: "usd",
      status: "flagged_self_referral",
      livemode: true,
    });
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  async function findAudit(action: string) {
    const db = getDb();

    const [row] = await db
      .select()
      .from(adminAuditLogs)
      .where(
        and(
          eq(adminAuditLogs.adminUserId, ctx.ownerUserId),
          eq(adminAuditLogs.action, action)
        )
      )
      .limit(1);

    return row ?? null;
  }

  async function countAudits(action: string, resourceId: string) {
    const db = getDb();
    const [row] = await db
      .select({ value: count() })
      .from(adminAuditLogs)
      .where(
        and(
          eq(adminAuditLogs.adminUserId, ctx.ownerUserId),
          eq(adminAuditLogs.action, action),
          eq(adminAuditLogs.resourceId, resourceId)
        )
      );

    return Number(row?.value ?? 0);
  }

  function expectSingleWinner(results: PromiseSettledResult<unknown>[]) {
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  }

  async function createFlaggedEntry(label: string) {
    const db = getDb();
    const transactionId = generateId(ID_PREFIXES.transaction);
    const entryId = generateId(ID_PREFIXES.commissionEntry);

    await db.insert(transactions).values({
      id: transactionId,
      appId: ctx.appId,
      source: "stripe",
      externalId: `cs_${label}_${ctx.suffix}`,
      stripeConnectionId: ctx.stripeConnectionId!,
      programId: ctx.programId,
      customerId: ctx.customerId,
      programAffiliateId: ctx.programAffiliateId,
      stripeObjectId: `cs_${label}_${ctx.suffix}`,
      stripeChargeId: `ch_${label}_${ctx.suffix}`,
      action: "payment",
      amount: 1000,
      currency: "usd",
      livemode: true,
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
      amount: 200,
      currency: "usd",
      exchangeRate: "1",
      originalAmount: 1000,
      originalCurrency: "usd",
      status: "flagged_self_referral",
      livemode: true,
    });

    return entryId;
  }

  it("pauses and resumes a program with audit rows", async () => {
    const paused = await pauseProgram(ctx.ownerUserId, ctx.programId);
    expect(paused.status).toBe("paused");
    expect(await findAudit("program.paused")).not.toBeNull();

    const resumed = await resumeProgram(ctx.ownerUserId, ctx.programId);
    expect(resumed.status).toBe("active");
    expect(await findAudit("program.resumed")).not.toBeNull();
  });

  it("rejects illegal program transitions", async () => {
    await pauseProgram(ctx.ownerUserId, ctx.programId);

    await expect(
      pauseProgram(ctx.ownerUserId, ctx.programId)
    ).rejects.toBeInstanceOf(AppError);

    await resumeProgram(ctx.ownerUserId, ctx.programId);
  });

  it("disables and enables an affiliate with audit rows", async () => {
    const disabled = await disableAffiliate(
      ctx.ownerUserId,
      ctx.programAffiliateId
    );
    expect(disabled.status).toBe("disabled");
    expect(await findAudit("affiliate.disabled")).not.toBeNull();

    const enabled = await enableAffiliate(ctx.ownerUserId, ctx.programAffiliateId);
    expect(enabled.status).toBe("active");
    expect(await findAudit("affiliate.enabled")).not.toBeNull();
  });

  it("rejects illegal affiliate transitions", async () => {
    await disableAffiliate(ctx.ownerUserId, ctx.programAffiliateId);

    await expect(
      disableAffiliate(ctx.ownerUserId, ctx.programAffiliateId)
    ).rejects.toBeInstanceOf(AppError);

    await enableAffiliate(ctx.ownerUserId, ctx.programAffiliateId);
  });

  it("releases and rejects flagged commissions only from flagged status", async () => {
    const released = await releaseFlaggedCommission(
      ctx.ownerUserId,
      flaggedEntryId
    );
    expect(released.status).toBe("approved");
    expect(await findAudit("commission.self_referral_released")).not.toBeNull();

    await expect(
      releaseFlaggedCommission(ctx.ownerUserId, flaggedEntryId)
    ).rejects.toBeInstanceOf(AppError);

    const db = getDb();
    const rejectedEntryId = generateId(ID_PREFIXES.commissionEntry);
    const rejectedTransactionId = generateId(ID_PREFIXES.transaction);

    await db.insert(transactions).values({
      id: rejectedTransactionId,
      appId: ctx.appId,
      source: "stripe",
      externalId: `cs_reject_${ctx.suffix}`,
      stripeConnectionId: ctx.stripeConnectionId!,
      programId: ctx.programId,
      customerId: ctx.customerId,
      programAffiliateId: ctx.programAffiliateId,
      stripeObjectId: `cs_reject_${ctx.suffix}`,
      stripeChargeId: `ch_reject_${ctx.suffix}`,
      action: "payment",
      amount: 1000,
      currency: "usd",
      livemode: true,
      transactionDate: new Date(),
    });

    await db.insert(commissionEntries).values({
      id: rejectedEntryId,
      transactionId: rejectedTransactionId,
      programId: ctx.programId,
      programAffiliateId: ctx.programAffiliateId,
      customerId: ctx.customerId,
      ruleId: ctx.ruleId,
      kind: "earned",
      amount: 200,
      currency: "usd",
      exchangeRate: "1",
      originalAmount: 1000,
      originalCurrency: "usd",
      status: "flagged_self_referral",
      livemode: true,
    });

    const rejected = await rejectFlaggedCommission(
      ctx.ownerUserId,
      rejectedEntryId,
      "vitest reject"
    );
    expect(rejected.status).toBe("rejected");
    expect(await findAudit("commission.self_referral_rejected")).not.toBeNull();

    await expect(
      rejectFlaggedCommission(ctx.ownerUserId, flaggedEntryId)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("blocks payout review actions for test commissions", async () => {
    const db = getDb();
    const transactionId = generateId(ID_PREFIXES.transaction);
    const entryId = generateId(ID_PREFIXES.commissionEntry);

    await db.insert(transactions).values({
      id: transactionId,
      appId: ctx.appId,
      source: "stripe",
      externalId: `cs_test_review_${ctx.suffix}`,
      stripeConnectionId: ctx.stripeConnectionId!,
      programId: ctx.programId,
      customerId: ctx.customerId,
      programAffiliateId: ctx.programAffiliateId,
      stripeObjectId: `cs_test_review_${ctx.suffix}`,
      stripeChargeId: `ch_test_review_${ctx.suffix}`,
      action: "payment",
      amount: 1000,
      currency: "usd",
      livemode: false,
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
      amount: 200,
      currency: "usd",
      exchangeRate: "1",
      originalAmount: 1000,
      originalCurrency: "usd",
      status: "flagged_self_referral",
      livemode: false,
    });

    await expect(
      releaseFlaggedCommission(ctx.ownerUserId, entryId),
    ).rejects.toMatchObject({ code: "test_commission_action_forbidden" });
    await expect(
      rejectFlaggedCommission(ctx.ownerUserId, entryId),
    ).rejects.toMatchObject({ code: "test_commission_action_forbidden" });
  });

  it("allows exactly one concurrent lifecycle transition and audit", async () => {
    let before = await countAudits("program.paused", ctx.programId);
    const pauseResults = await Promise.allSettled([
      pauseProgram(ctx.ownerUserId, ctx.programId),
      pauseProgram(ctx.ownerUserId, ctx.programId),
    ]);
    expectSingleWinner(pauseResults);
    expect(await countAudits("program.paused", ctx.programId)).toBe(before + 1);

    before = await countAudits("program.resumed", ctx.programId);
    const resumeResults = await Promise.allSettled([
      resumeProgram(ctx.ownerUserId, ctx.programId),
      resumeProgram(ctx.ownerUserId, ctx.programId),
    ]);
    expectSingleWinner(resumeResults);
    expect(await countAudits("program.resumed", ctx.programId)).toBe(before + 1);

    before = await countAudits("affiliate.disabled", ctx.programAffiliateId);
    const disableResults = await Promise.allSettled([
      disableAffiliate(ctx.ownerUserId, ctx.programAffiliateId),
      disableAffiliate(ctx.ownerUserId, ctx.programAffiliateId),
    ]);
    expectSingleWinner(disableResults);
    expect(await countAudits("affiliate.disabled", ctx.programAffiliateId)).toBe(
      before + 1
    );

    before = await countAudits("affiliate.enabled", ctx.programAffiliateId);
    const enableResults = await Promise.allSettled([
      enableAffiliate(ctx.ownerUserId, ctx.programAffiliateId),
      enableAffiliate(ctx.ownerUserId, ctx.programAffiliateId),
    ]);
    expectSingleWinner(enableResults);
    expect(await countAudits("affiliate.enabled", ctx.programAffiliateId)).toBe(
      before + 1
    );

    const db = getDb();
    await db
      .update(programAffiliates)
      .set({ status: "pending" })
      .where(eq(programAffiliates.id, ctx.programAffiliateId));

    before = await countAudits("affiliate.approved", ctx.programAffiliateId);
    const approveResults = await Promise.allSettled([
      approvePendingAffiliate(ctx.ownerUserId, ctx.programAffiliateId),
      approvePendingAffiliate(ctx.ownerUserId, ctx.programAffiliateId),
    ]);
    expectSingleWinner(approveResults);
    expect(await countAudits("affiliate.approved", ctx.programAffiliateId)).toBe(
      before + 1
    );

    const releaseEntryId = await createFlaggedEntry("concurrent_release");
    before = await countAudits(
      "commission.self_referral_released",
      releaseEntryId
    );
    const releaseResults = await Promise.allSettled([
      releaseFlaggedCommission(ctx.ownerUserId, releaseEntryId),
      releaseFlaggedCommission(ctx.ownerUserId, releaseEntryId),
    ]);
    expectSingleWinner(releaseResults);
    expect(
      await countAudits("commission.self_referral_released", releaseEntryId)
    ).toBe(before + 1);

    const rejectEntryId = await createFlaggedEntry("concurrent_reject");
    before = await countAudits(
      "commission.self_referral_rejected",
      rejectEntryId
    );
    const rejectResults = await Promise.allSettled([
      rejectFlaggedCommission(ctx.ownerUserId, rejectEntryId, "concurrent"),
      rejectFlaggedCommission(ctx.ownerUserId, rejectEntryId, "concurrent"),
    ]);
    expectSingleWinner(rejectResults);
    expect(
      await countAudits("commission.self_referral_rejected", rejectEntryId)
    ).toBe(before + 1);
  });
});
