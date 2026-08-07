import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  payoutRequests,
  programAffiliates,
  users,
} from "@/db/schema";
import {
  cancelPayoutRun,
  createPayoutRun,
  generatePayoutRunCsv,
  markAffiliatePayoutPaid,
} from "@/services/payouts/payout-batches";
import { listPayoutableCommissionEntries } from "@/services/payouts/balance";
import { requireProgramAccess } from "@/services/scoping";

export type ReadyPayout = {
  programId: string;
  programAffiliateId: string;
  amount: number;
  currency: string;
  requested: boolean;
  name: string | null;
  email: string;
  image: string | null;
};

export async function listReadyPayouts(userId: string, programId: string) {
  await requireProgramAccess(userId, programId);

  const payoutableEntries = await listPayoutableCommissionEntries(programId);
  const totals = new Map<
    string,
    { amount: number; currency: string }
  >();

  for (const payoutable of payoutableEntries) {
    const affiliateId = payoutable.entry.programAffiliateId;
    const existing = totals.get(affiliateId);

    if (existing) {
      existing.amount += payoutable.payoutAmount;
    }
    else {
      totals.set(affiliateId, {
        amount: payoutable.payoutAmount,
        currency: payoutable.entry.currency,
      });
    }
  }

  const affiliateIds = [...totals.entries()]
    .filter(([, total]) => total.amount > 0)
    .map(([affiliateId]) => affiliateId);

  if (affiliateIds.length === 0) {
    return [];
  }

  const db = getDb();
  const affiliateRows = await db
    .select({
      id: programAffiliates.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(programAffiliates)
    .innerJoin(users, eq(users.id, programAffiliates.userId))
    .where(inArray(programAffiliates.id, affiliateIds));
  const requestRows = await db
    .select({ programAffiliateId: payoutRequests.programAffiliateId })
    .from(payoutRequests)
    .where(
      and(
        eq(payoutRequests.programId, programId),
        eq(payoutRequests.status, "open"),
        inArray(payoutRequests.programAffiliateId, affiliateIds)
      )
    );
  const requestedAffiliateIds = new Set(
    requestRows.map((row) => row.programAffiliateId)
  );

  return affiliateRows.map((affiliate): ReadyPayout => {
    const total = totals.get(affiliate.id)!;

    return {
      programId,
      programAffiliateId: affiliate.id,
      amount: total.amount,
      currency: total.currency,
      requested: requestedAffiliateIds.has(affiliate.id),
      name: affiliate.name,
      email: affiliate.email,
      image: affiliate.image,
    };
  });
}

export async function markReadyPayoutPaid(
  userId: string,
  programId: string,
  programAffiliateId: string,
  input: { externalReference?: string } = {}
) {
  const run = await createPayoutRun(userId, programId, {
    programAffiliateId,
  });

  try {
    return await markAffiliatePayoutPaid(
      userId,
      run.id,
      programAffiliateId,
      input
    );
  }
  catch (error) {
    await cancelPayoutRun(userId, run.id).catch(() => undefined);
    throw error;
  }
}

export async function exportReadyPayoutsCsv(
  userId: string,
  programId: string
) {
  const run = await createPayoutRun(userId, programId);

  try {
    return {
      payoutBatchId: run.id,
      csv: await generatePayoutRunCsv(userId, run.id),
    };
  }
  catch (error) {
    await cancelPayoutRun(userId, run.id).catch(() => undefined);
    throw error;
  }
}

export function serializeReadyPayout(payout: ReadyPayout) {
  return {
    program_id: payout.programId,
    program_affiliate_id: payout.programAffiliateId,
    amount: { amount: payout.amount, currency: payout.currency },
    requested: payout.requested,
    name: payout.name,
    email: payout.email,
    image: payout.image,
  };
}
