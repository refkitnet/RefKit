import { and, asc, eq, gt, inArray, or, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  commissionEntries,
  commissionRules,
  programs,
  transactions,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import {
  calculateFixedCommission,
  calculatePercentCommission,
  convertAmount,
  roundHalfUp,
} from "@/lib/money";
import { isSelfReferral } from "@/services/stripe/attribution";
import { getExchangeRate } from "@/services/stripe/exchange-rates";

async function isWithinRecurringWindow(input: {
  customerId: string;
  programId: string;
  transactionDate: Date;
  recurringDurationMonths: number | null;
  livemode: boolean;
}, executor: DbExecutor = getDb()) {
  if (input.recurringDurationMonths === null) {
    return true;
  }

  const db = executor;

  const [firstPaid] = await db
    .select({ transactionDate: transactions.transactionDate })
    .from(transactions)
    .where(
      and(
        eq(transactions.customerId, input.customerId),
        eq(transactions.programId, input.programId),
        eq(transactions.livemode, input.livemode),
        gt(transactions.amount, 0)
      )
    )
    .orderBy(asc(transactions.transactionDate))
    .limit(1);

  if (!firstPaid) {
    return true;
  }

  const windowEnd = new Date(firstPaid.transactionDate);
  windowEnd.setMonth(windowEnd.getMonth() + input.recurringDurationMonths);

  return input.transactionDate < windowEnd;
}

export async function createEarnedCommissionEntry(
  input: {
    transactionId: string;
    programId: string;
    programAffiliateId: string;
    customerId: string;
    ruleId: string;
    basisAmountMinor: number;
    basisCurrency: string;
    transactionDate: Date;
    livemode: boolean;
    eventCreatedAt: Date;
  },
  executor: DbExecutor = getDb()
) {
  if (input.basisAmountMinor <= 0) {
    return null;
  }

  const db = executor;

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, input.programId))
    .limit(1);

  const [rule] = await db
    .select()
    .from(commissionRules)
    .where(eq(commissionRules.id, input.ruleId))
    .limit(1);

  if (!program || !rule) {
    throw new Error("Program or commission rule not found.");
  }

  const withinWindow = await isWithinRecurringWindow({
    customerId: input.customerId,
    programId: input.programId,
    transactionDate: input.transactionDate,
    recurringDurationMonths: rule.recurringDurationMonths,
    livemode: input.livemode,
  }, db);

  if (!withinWindow) {
    return null;
  }

  const exchangeRate = await getExchangeRate(
    input.basisCurrency,
    program.currency,
    input.eventCreatedAt
  );

  const rateNumber = Number(exchangeRate);
  const convertedBasis = convertAmount(input.basisAmountMinor, rateNumber);

  let commissionAmount = 0;

  if (rule.rewardType === "percent") {
    commissionAmount = calculatePercentCommission(
      convertedBasis,
      Number(rule.percentValue)
    );
  }
  else {
    commissionAmount = calculateFixedCommission(rule.fixedAmount ?? 0);
  }

  if (commissionAmount <= 0) {
    return null;
  }

  let status = "approved";
  const selfReferral = await isSelfReferral(
    input.programAffiliateId,
    input.customerId,
    db
  );

  if (selfReferral && !program.allowSelfReferral) {
    status = "flagged_self_referral";
  }

  const entryId = generateId(ID_PREFIXES.commissionEntry);

  try {
    await db.insert(commissionEntries).values({
      id: entryId,
      transactionId: input.transactionId,
      programId: input.programId,
      programAffiliateId: input.programAffiliateId,
      customerId: input.customerId,
      ruleId: input.ruleId,
      kind: "earned",
      amount: commissionAmount,
      currency: program.currency,
      exchangeRate: exchangeRate,
      originalAmount: input.basisAmountMinor,
      originalCurrency: input.basisCurrency,
      status,
      livemode: input.livemode,
      approvedAt: status === "approved" ? new Date() : null,
    });
  }
  catch (error) {
    if (isUniqueViolation(error)) {
      const [existing] = await db
        .select()
        .from(commissionEntries)
        .where(
          and(
            eq(commissionEntries.transactionId, input.transactionId),
            eq(commissionEntries.programAffiliateId, input.programAffiliateId),
            eq(commissionEntries.ruleId, input.ruleId)
          )
        )
        .limit(1);

      return existing ?? null;
    }

    throw error;
  }

  const [created] = await db
    .select()
    .from(commissionEntries)
    .where(eq(commissionEntries.id, entryId))
    .limit(1);

  return created ?? null;
}

export async function getEarnedEntryForTransaction(
  transactionId: string,
  executor: DbExecutor = getDb()
) {
  const db = executor;

  const [entry] = await db
    .select()
    .from(commissionEntries)
    .where(
      and(
        eq(commissionEntries.transactionId, transactionId),
        eq(commissionEntries.kind, "earned")
      )
    )
    .limit(1);

  return entry ?? null;
}

type DisputeLedgerIdentity = {
  sourceEventId: string;
  disputeId: string;
  stripeDisputeId?: string;
};

export async function markEntriesDisputed(
  entryIds: string[],
  identity: DisputeLedgerIdentity,
  executor: DbExecutor = getDb()
) {
  if (entryIds.length === 0) {
    return;
  }

  await executor
    .update(commissionEntries)
    .set({
      status: "disputed",
      statusBeforeDispute: sql`${commissionEntries.status}`,
      sourceEventId: identity.sourceEventId,
      disputeId: identity.disputeId,
      stripeDisputeId: identity.stripeDisputeId ?? null,
    })
    .where(
      and(
        inArray(commissionEntries.id, entryIds),
        eq(commissionEntries.status, "approved")
      )
    );
}

export async function restoreDisputedEntries(
  identity: DisputeLedgerIdentity,
  executor: DbExecutor = getDb()
) {
  await executor
    .update(commissionEntries)
    .set({
      status: sql`coalesce(${commissionEntries.statusBeforeDispute}, 'approved')`,
      statusBeforeDispute: null,
    })
    .where(
      and(
        or(
          eq(commissionEntries.sourceEventId, identity.sourceEventId),
          identity.stripeDisputeId
            ? eq(commissionEntries.stripeDisputeId, identity.stripeDisputeId)
            : undefined
        ),
        eq(commissionEntries.status, "disputed"),
        eq(commissionEntries.kind, "earned")
      )
    );
}

export async function restoreDisputedEarnedEntry(
  entryId: string,
  executor: DbExecutor = getDb()
) {
  await executor
    .update(commissionEntries)
    .set({
      status: sql`coalesce(${commissionEntries.statusBeforeDispute}, 'approved')`,
      statusBeforeDispute: null,
    })
    .where(
      and(
        eq(commissionEntries.id, entryId),
        eq(commissionEntries.status, "disputed"),
        eq(commissionEntries.kind, "earned")
      )
    );
}

export async function createDisputeEntry(input: {
  earnedEntryId: string;
  disputedAmountMinor: number;
  sourceEventId: string;
  disputeId: string;
  stripeDisputeId?: string;
  kind: "dispute_reversal" | "dispute_reinstatement";
  livemode: boolean;
}, executor: DbExecutor = getDb()) {
  const db = executor;

  const [earnedEntry] = await db
    .select()
    .from(commissionEntries)
    .where(eq(commissionEntries.id, input.earnedEntryId))
    .for("update")
    .limit(1);

  if (
    !earnedEntry
    || !earnedEntry.originalAmount
    || !earnedEntry.transactionId
  ) {
    return null;
  }

  const existingBySource = await getCommissionEntryBySourceEventId(
    input.sourceEventId,
    db
  );

  if (existingBySource) {
    return existingBySource;
  }

  if (input.stripeDisputeId) {
    const [existingLegacyEntry] = await db
      .select()
      .from(commissionEntries)
      .where(
        and(
          eq(commissionEntries.transactionId, earnedEntry.transactionId),
          eq(commissionEntries.stripeDisputeId, input.stripeDisputeId),
          eq(commissionEntries.kind, input.kind)
        )
      )
      .limit(1);

    if (existingLegacyEntry) {
      if (!existingLegacyEntry.sourceEventId) {
        await db
          .update(commissionEntries)
          .set({
            sourceEventId: input.sourceEventId,
            disputeId: input.disputeId,
          })
          .where(eq(commissionEntries.id, existingLegacyEntry.id));
      }

      return {
        ...existingLegacyEntry,
        sourceEventId: existingLegacyEntry.sourceEventId ?? input.sourceEventId,
        disputeId: existingLegacyEntry.disputeId ?? input.disputeId,
      };
    }
  }

  const proportionalAmount = roundHalfUp(
    (input.disputedAmountMinor / earnedEntry.originalAmount) *
      earnedEntry.amount
  );

  if (proportionalAmount <= 0) {
    return null;
  }

  const signedAmount =
    input.kind === "dispute_reversal" ? -proportionalAmount : proportionalAmount;
  const signedOriginal =
    input.kind === "dispute_reversal"
      ? -input.disputedAmountMinor
      : input.disputedAmountMinor;

  const entryId = generateId(ID_PREFIXES.commissionEntry);

  try {
    await db.insert(commissionEntries).values({
      id: entryId,
      transactionId: earnedEntry.transactionId,
      programId: earnedEntry.programId,
      programAffiliateId: earnedEntry.programAffiliateId,
      customerId: earnedEntry.customerId,
      ruleId: earnedEntry.ruleId,
      kind: input.kind,
      amount: signedAmount,
      currency: earnedEntry.currency,
      exchangeRate: earnedEntry.exchangeRate,
      originalAmount: signedOriginal,
      originalCurrency: earnedEntry.originalCurrency,
      status: "approved",
      sourceEventId: input.sourceEventId,
      disputeId: input.disputeId,
      stripeDisputeId: input.stripeDisputeId ?? null,
      livemode: input.livemode,
    });
  }
  catch (error) {
    if (isUniqueViolation(error)) {
      return getCommissionEntryBySourceEventId(input.sourceEventId, db);
    }

    throw error;
  }

  const [created] = await db
    .select()
    .from(commissionEntries)
    .where(eq(commissionEntries.id, entryId))
    .limit(1);

  return created ?? null;
}

export async function getCommissionEntryBySourceEventId(
  sourceEventId: string,
  executor: DbExecutor = getDb()
) {
  const db = executor;

  const [entry] = await db
    .select()
    .from(commissionEntries)
    .where(eq(commissionEntries.sourceEventId, sourceEventId))
    .limit(1);

  return entry ?? null;
}

export async function createRefundReversalEntry(
  input: {
    earnedEntryId: string;
    refundAmountMinor: number;
    livemode: boolean;
    stripeRefundId?: string;
    sourceEventId?: string;
  },
  executor: DbExecutor = getDb()
) {
  if (!input.stripeRefundId && !input.sourceEventId) {
    throw new Error("Refund reversal requires stripeRefundId or sourceEventId.");
  }

  const db = executor;

  const [earnedEntry] = await db
    .select()
    .from(commissionEntries)
    .where(eq(commissionEntries.id, input.earnedEntryId))
    .limit(1);

  if (
    !earnedEntry
    || !earnedEntry.originalAmount
    || !earnedEntry.transactionId
  ) {
    return null;
  }

  if (input.sourceEventId) {
    const existing = await getCommissionEntryBySourceEventId(
      input.sourceEventId,
      db
    );

    if (existing) {
      return existing;
    }
  }

  if (input.stripeRefundId) {
    const [existing] = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.stripeRefundId, input.stripeRefundId))
      .limit(1);

    if (existing) {
      return existing;
    }
  }

  const [priorReversal] = await db
    .select({
      originalAmount: sql<number>`coalesce(sum(abs(${commissionEntries.originalAmount})), 0)::int`,
      amount: sql<number>`coalesce(sum(abs(${commissionEntries.amount})), 0)::int`,
    })
    .from(commissionEntries)
    .where(
      and(
        eq(commissionEntries.transactionId, earnedEntry.transactionId),
        inArray(commissionEntries.kind, ["refund_reversal", "recovery_debt"])
      )
    );
  const [recordedRefund] = await db
    .select({
      amount: sql<number>`coalesce(sum(abs(${transactions.amount})), 0)::int`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.parentTransactionId, earnedEntry.transactionId),
        eq(transactions.action, "refund")
      )
    );
  const originalAmount = Math.abs(earnedEntry.originalAmount);
  const cumulativeRefundAmount = Math.min(
    originalAmount,
    Math.max(
      Number(recordedRefund?.amount ?? 0),
      Number(priorReversal?.originalAmount ?? 0) + input.refundAmountMinor
    )
  );
  const cumulativeTarget = cumulativeRefundAmount >= originalAmount
    ? Math.abs(earnedEntry.amount)
    : roundHalfUp(
        (cumulativeRefundAmount / originalAmount) * Math.abs(earnedEntry.amount)
      );
  const proportionalAmount = Math.max(
    0,
    cumulativeTarget - Number(priorReversal?.amount ?? 0)
  );

  if (proportionalAmount <= 0) {
    return null;
  }

  if (earnedEntry.status === "paid") {
    const entryId = generateId(ID_PREFIXES.commissionEntry);

    try {
      await db.insert(commissionEntries).values({
        id: entryId,
        transactionId: earnedEntry.transactionId,
        programId: earnedEntry.programId,
        programAffiliateId: earnedEntry.programAffiliateId,
        customerId: earnedEntry.customerId,
        ruleId: earnedEntry.ruleId,
        kind: "recovery_debt",
        amount: proportionalAmount,
        currency: earnedEntry.currency,
        exchangeRate: earnedEntry.exchangeRate,
        originalAmount: input.refundAmountMinor,
        originalCurrency: earnedEntry.originalCurrency,
        status: "outstanding",
        stripeRefundId: input.stripeRefundId ?? null,
        sourceEventId: input.sourceEventId ?? input.stripeRefundId ?? null,
        livemode: input.livemode,
      });
    }
    catch (error) {
      if (isUniqueViolation(error)) {
        if (input.sourceEventId) {
          const [existingBySource] = await db
            .select()
            .from(commissionEntries)
            .where(eq(commissionEntries.sourceEventId, input.sourceEventId))
            .limit(1);

          if (existingBySource) {
            return existingBySource;
          }
        }

        if (input.stripeRefundId) {
          const [existing] = await db
            .select()
            .from(commissionEntries)
            .where(eq(commissionEntries.stripeRefundId, input.stripeRefundId))
            .limit(1);

          return existing ?? null;
        }
      }

      throw error;
    }

    const [createdDebt] = await db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.id, entryId))
      .limit(1);

    return createdDebt ?? null;
  }

  const entryId = generateId(ID_PREFIXES.commissionEntry);

  try {
    await db.insert(commissionEntries).values({
      id: entryId,
      transactionId: earnedEntry.transactionId,
      programId: earnedEntry.programId,
      programAffiliateId: earnedEntry.programAffiliateId,
      customerId: earnedEntry.customerId,
      ruleId: earnedEntry.ruleId,
      kind: "refund_reversal",
      amount: -proportionalAmount,
      currency: earnedEntry.currency,
      exchangeRate: earnedEntry.exchangeRate,
      originalAmount: -input.refundAmountMinor,
      originalCurrency: earnedEntry.originalCurrency,
      status: "approved",
      stripeRefundId: input.stripeRefundId ?? null,
      sourceEventId: input.sourceEventId ?? input.stripeRefundId ?? null,
      livemode: input.livemode,
    });
  }
  catch (error) {
    if (isUniqueViolation(error)) {
      if (input.sourceEventId) {
        const [existingBySource] = await db
          .select()
          .from(commissionEntries)
          .where(eq(commissionEntries.sourceEventId, input.sourceEventId))
          .limit(1);

        if (existingBySource) {
          return existingBySource;
        }
      }

      if (input.stripeRefundId) {
        const [existing] = await db
          .select()
          .from(commissionEntries)
          .where(eq(commissionEntries.stripeRefundId, input.stripeRefundId))
          .limit(1);

        return existing ?? null;
      }
    }

    throw error;
  }

  const [created] = await db
    .select()
    .from(commissionEntries)
    .where(eq(commissionEntries.id, entryId))
    .limit(1);

  return created ?? null;
}
