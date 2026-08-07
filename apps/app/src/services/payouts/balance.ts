import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  commissionEntries,
  payoutItems,
  programAffiliates,
  programs,
  type CommissionEntry,
} from "@/db/schema";
import { AppError } from "@/lib/errors";

export type PayoutableCommissionEntry = {
  entry: CommissionEntry;
  payoutAmount: number;
};

type RecoveryDebtState = {
  totalDebt: number;
  settledDebt: number;
  outstandingDebt: number;
  reservedDebt: number;
  availableDebtToReserve: number;
};

async function listApprovedCommissionEntries(
  programId: string,
  affiliateId: string | undefined,
  executor: DbExecutor
) {
  const conditions = [
    eq(commissionEntries.programId, programId),
    eq(commissionEntries.livemode, true),
    eq(commissionEntries.status, "approved"),
    sql`not exists (
      select 1
      from ${programAffiliates}
      where ${programAffiliates.id} = ${commissionEntries.programAffiliateId}
        and ${programAffiliates.isTest} = true
    )`,
    sql`not exists (
      select 1
      from ${payoutItems}
      where ${payoutItems.commissionEntryId} = ${commissionEntries.id}
        and ${payoutItems.batchStatus} != 'cancelled'
        and ${payoutItems.status} in ('pending', 'paid')
    )`,
  ];

  if (affiliateId) {
    conditions.push(eq(commissionEntries.programAffiliateId, affiliateId));
  }

  return executor
    .select()
    .from(commissionEntries)
    .where(and(...conditions))
    .orderBy(asc(commissionEntries.createdAt), asc(commissionEntries.id));
}

/**
 * Recovery debt is append-only. Its repayment is derived from the difference
 * between an earned commission entry and the amount actually paid in a
 * finalized payout item. Draft/prepared payout items reserve that same
 * difference so concurrent runs cannot apply the same debt twice.
 */
export async function getRecoveryDebtState(
  programId: string,
  affiliateId: string,
  executor: DbExecutor = getDb()
): Promise<RecoveryDebtState> {
  const [debtRow] = await executor
    .select({
      amount: sql<number>`coalesce(sum(${commissionEntries.amount}), 0)::int`,
    })
    .from(commissionEntries)
    .where(
      and(
        eq(commissionEntries.programAffiliateId, affiliateId),
        eq(commissionEntries.programId, programId),
        eq(commissionEntries.livemode, true),
        eq(commissionEntries.kind, "recovery_debt")
      )
    );

  const [settledRow] = await executor
    .select({
      amount: sql<number>`coalesce(sum(greatest(${commissionEntries.amount} - ${payoutItems.amount}, 0)), 0)::int`,
    })
    .from(payoutItems)
    .innerJoin(
      commissionEntries,
      eq(commissionEntries.id, payoutItems.commissionEntryId)
    )
    .where(
      and(
        eq(payoutItems.programAffiliateId, affiliateId),
        eq(commissionEntries.programId, programId),
        eq(commissionEntries.livemode, true),
        eq(payoutItems.batchStatus, "paid"),
        eq(payoutItems.status, "paid"),
        gtPositiveCommissionAmount()
      )
    );

  const [reservedRow] = await executor
    .select({
      amount: sql<number>`coalesce(sum(greatest(${commissionEntries.amount} - ${payoutItems.amount}, 0)), 0)::int`,
    })
    .from(payoutItems)
    .innerJoin(
      commissionEntries,
      eq(commissionEntries.id, payoutItems.commissionEntryId)
    )
    .where(
      and(
        eq(payoutItems.programAffiliateId, affiliateId),
        eq(commissionEntries.programId, programId),
        eq(commissionEntries.livemode, true),
        inArray(payoutItems.batchStatus, ["draft", "prepared"]),
        inArray(payoutItems.status, ["pending", "paid"]),
        gtPositiveCommissionAmount()
      )
    );

  const totalDebt = Math.max(0, Number(debtRow?.amount ?? 0));
  const settledDebt = Math.min(
    totalDebt,
    Math.max(0, Number(settledRow?.amount ?? 0))
  );
  const outstandingDebt = totalDebt - settledDebt;
  const reservedDebt = Math.min(
    outstandingDebt,
    Math.max(0, Number(reservedRow?.amount ?? 0))
  );

  return {
    totalDebt,
    settledDebt,
    outstandingDebt,
    reservedDebt,
    availableDebtToReserve: outstandingDebt - reservedDebt,
  };
}

function gtPositiveCommissionAmount() {
  return sql`${commissionEntries.amount} > 0 AND ${commissionEntries.kind} != 'recovery_debt'`;
}

/**
 * Returns approved entries with the amount that can actually be paid after
 * recovery debt. Global payout-run creation passes `reserveRecoveryDebt` so
 * an already-active run's debt allocation is not duplicated.
 */
export async function listPayoutableCommissionEntries(
  programId: string,
  options: {
    affiliateId?: string;
    reserveRecoveryDebt?: boolean;
    executor?: DbExecutor;
  } = {}
): Promise<PayoutableCommissionEntry[]> {
  const executor = options.executor ?? getDb();
  const entries = await listApprovedCommissionEntries(
    programId,
    options.affiliateId,
    executor
  );
  const entriesByAffiliate = new Map<string, CommissionEntry[]>();

  for (const entry of entries) {
    const affiliateEntries = entriesByAffiliate.get(entry.programAffiliateId) ?? [];
    affiliateEntries.push(entry);
    entriesByAffiliate.set(entry.programAffiliateId, affiliateEntries);
  }

  const payoutable: PayoutableCommissionEntry[] = [];

  for (const [affiliateId, affiliateEntries] of entriesByAffiliate) {
    const debt = await getRecoveryDebtState(programId, affiliateId, executor);
    let remainingDebt = options.reserveRecoveryDebt
      ? debt.availableDebtToReserve
      : debt.outstandingDebt;

    for (const entry of affiliateEntries) {
      const debtOffset =
        entry.amount > 0 ? Math.min(entry.amount, remainingDebt) : 0;

      payoutable.push({
        entry,
        payoutAmount: entry.amount - debtOffset,
      });

      remainingDebt -= debtOffset;
    }
  }

  return payoutable;
}

export async function settleRecoveryDebtEntries(
  programId: string,
  affiliateId: string,
  executor: DbExecutor = getDb()
) {
  const state = await getRecoveryDebtState(programId, affiliateId, executor);

  if (state.settledDebt <= 0) {
    return;
  }

  const debts = await executor
    .select()
    .from(commissionEntries)
    .where(
      and(
        eq(commissionEntries.programAffiliateId, affiliateId),
        eq(commissionEntries.programId, programId),
        eq(commissionEntries.livemode, true),
        eq(commissionEntries.kind, "recovery_debt")
      )
    )
    .orderBy(asc(commissionEntries.createdAt), asc(commissionEntries.id));

  let remainingSettlement = state.settledDebt;

  for (const debt of debts) {
    if (remainingSettlement < debt.amount) {
      break;
    }

    remainingSettlement -= debt.amount;

    if (debt.status !== "settled") {
      await executor
        .update(commissionEntries)
        .set({
          status: "settled",
          updatedAt: new Date(),
        })
        .where(eq(commissionEntries.id, debt.id));
    }
  }
}

export async function computePayableBalance(
  affiliateId: string,
  programId: string
) {
  const db = getDb();

  const [program] = await db
    .select({ currency: programs.currency })
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);

  if (!program) {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }

  const [approvedRow] = await db
    .select({
      amount: sql<number>`coalesce(sum(${commissionEntries.amount}), 0)::int`,
    })
    .from(commissionEntries)
    .where(
      and(
        eq(commissionEntries.programAffiliateId, affiliateId),
        eq(commissionEntries.programId, programId),
        eq(commissionEntries.livemode, true),
        eq(commissionEntries.status, "approved"),
        sql`not exists (
          select 1
          from ${programAffiliates}
          where ${programAffiliates.id} = ${commissionEntries.programAffiliateId}
            and ${programAffiliates.isTest} = true
        )`,
        sql`not exists (
          select 1
          from ${payoutItems}
          where ${payoutItems.commissionEntryId} = ${commissionEntries.id}
            and ${payoutItems.batchStatus} != 'cancelled'
            and ${payoutItems.status} in ('pending', 'paid')
        )`
      )
    );

  const approvedAmount = Number(approvedRow?.amount ?? 0);
  const debt = await getRecoveryDebtState(programId, affiliateId);

  return {
    amount: Math.max(0, approvedAmount - debt.outstandingDebt),
    currency: program.currency,
    grossApproved: approvedAmount,
    outstandingDebt: debt.outstandingDebt,
  };
}

export async function listPayableCommissionEntries(
  programId: string,
  affiliateId?: string
) {
  const entries = await listPayoutableCommissionEntries(programId, {
    affiliateId,
  });

  return entries
    .filter((entry) => entry.payoutAmount !== 0)
    .map((entry) => entry.entry);
}
