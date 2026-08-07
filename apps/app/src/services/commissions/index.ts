import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  programAffiliates,
  commissionEntries,
  type CommissionEntry,
} from "@/db/schema";
import type { AppEnvironment } from "@/lib/app-environment";
import { AppError } from "@/lib/errors";
import { ListParams, listWithCursor } from "@/lib/pagination";
import { writeAuditLog } from "@/services/audit";
import { getProgramIdsForApp, requireProgramAccess } from "@/services/scoping";

function commissionEnvironmentFilter(environment?: AppEnvironment) {
  if (!environment) {
    return undefined;
  }

  if (environment === "test") {
    return eq(commissionEntries.livemode, false);
  }

  return and(
    eq(commissionEntries.livemode, true),
    sql`not exists (
      select 1
      from ${programAffiliates}
      where ${programAffiliates.id} = ${commissionEntries.programAffiliateId}
        and ${programAffiliates.isTest} = true
    )`,
  );
}

export async function listCommissionsForProgram(
  userId: string,
  programId: string,
  params: ListParams,
  options: { environment?: AppEnvironment } = {},
) {
  await requireProgramAccess(userId, programId);

  const limit = params.limit ?? 25;

  return listWithCursor<CommissionEntry>({
    table: commissionEntries,
    columns: {
      id: commissionEntries.id,
      createdAt: commissionEntries.createdAt,
    },
    where: and(
      eq(commissionEntries.programId, programId),
      commissionEnvironmentFilter(options.environment),
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listCommissionsForApp(
  userId: string,
  appId: string,
  params: ListParams,
  options: { environment?: AppEnvironment } = {},
) {
  const programIds = await getProgramIdsForApp(userId, appId);

  if (programIds.length === 0) {
    return { data: [], hasMore: false };
  }

  const limit = params.limit ?? 25;

  return listWithCursor<CommissionEntry>({
    table: commissionEntries,
    columns: {
      id: commissionEntries.id,
      createdAt: commissionEntries.createdAt,
    },
    where: and(
      inArray(commissionEntries.programId, programIds),
      commissionEnvironmentFilter(options.environment),
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listCommissionsForAffiliateUser(
  userId: string,
  params: ListParams
) {
  const db = getDb();

  const memberships = await db
    .select({ id: programAffiliates.id })
    .from(programAffiliates)
    .where(eq(programAffiliates.userId, userId));

  if (memberships.length === 0) {
    return { data: [], hasMore: false };
  }

  const limit = params.limit ?? 25;

  return listWithCursor<CommissionEntry>({
    table: commissionEntries,
    columns: {
      id: commissionEntries.id,
      createdAt: commissionEntries.createdAt,
    },
    where: inArray(
      commissionEntries.programAffiliateId,
      memberships.map((membership) => membership.id)
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

async function getEntryWithProgramAccess(userId: string, entryId: string) {
  const db = getDb();

  const [entry] = await db
    .select()
    .from(commissionEntries)
    .where(eq(commissionEntries.id, entryId))
    .limit(1);

  if (!entry) {
    throw new AppError(
      "not_found",
      "commission_not_found",
      "Commission entry not found.",
      404
    );
  }

  await requireProgramAccess(userId, entry.programId);

  return entry;
}

export async function releaseFlaggedCommission(
  userId: string,
  entryId: string
) {
  const entry = await getEntryWithProgramAccess(userId, entryId);

  if (!entry.livemode) {
    throw new AppError(
      "invalid_request",
      "test_commission_action_forbidden",
      "Test commissions cannot be released for payout.",
      400,
    );
  }

  if (entry.status !== "flagged_self_referral") {
    throw new AppError(
      "invalid_request",
      "invalid_commission_transition",
      "Only flagged commission entries can be released.",
      400
    );
  }

  const db = getDb();

  // Release goes straight to approved - the review is the approval.
  const [updated] = await db
    .update(commissionEntries)
    .set({
      status: "approved",
      approvedAt: new Date(),
      approvedByUserId: userId,
      approvalReason: "self_referral_released",
    })
    .where(
      and(
        eq(commissionEntries.id, entryId),
        eq(commissionEntries.status, "flagged_self_referral")
      )
    )
    .returning();

  if (!updated) {
    throw new AppError(
      "invalid_request",
      "invalid_commission_transition",
      "Only flagged commission entries can be released.",
      400
    );
  }

  await writeAuditLog({
    actorUserId: userId,
    action: "commission.self_referral_released",
    resourceType: "commission_entry",
    resourceId: entryId,
  });

  return updated;
}

export async function rejectFlaggedCommission(
  userId: string,
  entryId: string,
  reason?: string
) {
  const entry = await getEntryWithProgramAccess(userId, entryId);

  if (!entry.livemode) {
    throw new AppError(
      "invalid_request",
      "test_commission_action_forbidden",
      "Test commissions cannot be changed by payout review actions.",
      400,
    );
  }

  if (entry.status !== "flagged_self_referral") {
    throw new AppError(
      "invalid_request",
      "invalid_commission_transition",
      "Only flagged commission entries can be rejected.",
      400
    );
  }

  const db = getDb();

  const [updated] = await db
    .update(commissionEntries)
    .set({ status: "rejected" })
    .where(
      and(
        eq(commissionEntries.id, entryId),
        eq(commissionEntries.status, "flagged_self_referral")
      )
    )
    .returning();

  if (!updated) {
    throw new AppError(
      "invalid_request",
      "invalid_commission_transition",
      "Only flagged commission entries can be rejected.",
      400
    );
  }

  await writeAuditLog({
    actorUserId: userId,
    action: "commission.self_referral_rejected",
    resourceType: "commission_entry",
    resourceId: entryId,
    metadata: reason ? { reason } : undefined,
  });

  return updated;
}

export function serializeCommissionEntry(entry: CommissionEntry) {
  return {
    id: entry.id,
    transaction_id: entry.transactionId,
    program_id: entry.programId,
    program_affiliate_id: entry.programAffiliateId,
    customer_id: entry.customerId,
    rule_id: entry.ruleId,
    kind: entry.kind,
    amount: { amount: entry.amount, currency: entry.currency },
    original_amount:
      entry.originalAmount !== null && entry.originalCurrency
        ? { amount: entry.originalAmount, currency: entry.originalCurrency }
        : null,
    exchange_rate: entry.exchangeRate,
    status: entry.status,
    stripe_refund_id: entry.stripeRefundId,
    dispute_id: entry.disputeId,
    stripe_dispute_id: entry.stripeDisputeId,
    livemode: entry.livemode,
    approved_at: entry.approvedAt ? entry.approvedAt.toISOString() : null,
    approval_reason: entry.approvalReason,
    created_at: entry.createdAt.toISOString(),
    updated_at: entry.updatedAt.toISOString(),
  };
}
