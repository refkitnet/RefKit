import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  affiliateLinks,
  affiliatePayoutDetails,
  programAffiliates,
  apiKeys,
  commissionEntries,
  programs,
  users,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { writeAuditLog } from "@/services/audit";
import { revokeApiKey } from "@/services/api-keys";
import { computePayableBalance } from "@/services/payouts/balance";
import { serializeProgram } from "@/services/programs";
import { getDefaultCommissionRule } from "@/services/programs";
import { serializeAffiliateLink } from "@/services/affiliates/links";

function maskPayoutDetails(programAffiliateId: string, method: string) {
  return {
    program_affiliate_id: programAffiliateId,
    method,
    details: "on file (masked)",
  };
}

export async function exportAffiliateData(userId: string) {
  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("not_found", "user_not_found", "User not found.", 404);
  }

  const membershipRows = await db
    .select({
      affiliate: programAffiliates,
      program: programs,
    })
    .from(programAffiliates)
    .innerJoin(programs, eq(programs.id, programAffiliates.programId))
    .where(eq(programAffiliates.userId, userId));

  const memberships = await Promise.all(
    membershipRows.map(async (row) => {
      const rule = await getDefaultCommissionRule(row.program.id);
      const balance = await computePayableBalance(row.affiliate.id, row.program.id);

      return {
        program_affiliate: {
          id: row.affiliate.id,
          program_id: row.affiliate.programId,
          status: row.affiliate.status,
          created_at: row.affiliate.createdAt.toISOString(),
        },
        program: serializeProgram(row.program, rule),
        payable_balance: balance,
      };
    })
  );

  const programAffiliateIds = membershipRows.map((row) => row.affiliate.id);

  const links =
    programAffiliateIds.length === 0
      ? []
      : await db
          .select()
          .from(affiliateLinks)
          .where(inArray(affiliateLinks.programAffiliateId, programAffiliateIds));

  const serializedLinks = links.map((link) => {
    const membership = membershipRows.find(
      (row) => row.affiliate.id === link.programAffiliateId
    );

    if (!membership) {
      return {
        id: link.id,
        program_id: link.programId,
        program_affiliate_id: link.programAffiliateId,
        url: null,
        created_at: link.createdAt.toISOString(),
      };
    }

    const serialized = serializeAffiliateLink(
      link,
      membership.program.destinationUrl
    );

    return {
      id: link.id,
      program_id: link.programId,
      program_affiliate_id: link.programAffiliateId,
      url: serialized.tracking_url,
      created_at: link.createdAt.toISOString(),
    };
  });

  const commissions =
    programAffiliateIds.length === 0
      ? []
      : await db
          .select({
            id: commissionEntries.id,
            programId: commissionEntries.programId,
            programAffiliateId: commissionEntries.programAffiliateId,
            kind: commissionEntries.kind,
            amount: commissionEntries.amount,
            currency: commissionEntries.currency,
            status: commissionEntries.status,
            createdAt: commissionEntries.createdAt,
          })
          .from(commissionEntries)
          .where(inArray(commissionEntries.programAffiliateId, programAffiliateIds));

  const payoutDetailRows = programAffiliateIds.length === 0
    ? []
    : await db
        .select({
          programAffiliateId: affiliatePayoutDetails.programAffiliateId,
          method: affiliatePayoutDetails.method,
        })
        .from(affiliatePayoutDetails)
        .where(
          inArray(
            affiliatePayoutDetails.programAffiliateId,
            programAffiliateIds
          )
        );

  const payoutDetails = payoutDetailRows.map((row) =>
    maskPayoutDetails(row.programAffiliateId, row.method)
  );

  return {
    exported_at: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      created_at: user.createdAt.toISOString(),
    },
    program_affiliates: memberships,
    links: serializedLinks,
    commissions: commissions.map((entry) => ({
      id: entry.id,
      program_id: entry.programId,
      program_affiliate_id: entry.programAffiliateId,
      kind: entry.kind,
      amount: entry.amount,
      currency: entry.currency,
      status: entry.status,
      created_at: entry.createdAt.toISOString(),
    })),
    payout_details: payoutDetails,
  };
}

async function computeTotalPayableBalance(userId: string) {
  const db = getDb();

  const membershipRows = await db
    .select({
      programAffiliateId: programAffiliates.id,
      programId: programAffiliates.programId,
    })
    .from(programAffiliates)
    .where(eq(programAffiliates.userId, userId));

  let total = 0;
  const balances: Array<{ programId: string; amount: number; currency: string }> = [];

  for (const row of membershipRows) {
    const balance = await computePayableBalance(row.programAffiliateId, row.programId);
    total += balance.amount;
    balances.push({
      programId: row.programId,
      amount: balance.amount,
      currency: balance.currency,
    });
  }

  return { total, balances };
}

export async function deleteAffiliateAccount(
  userId: string,
  input: { waiveBalance: boolean }
) {
  const { total, balances } = await computeTotalPayableBalance(userId);

  if (total > 0 && !input.waiveBalance) {
    throw new AppError(
      "invalid_request",
      "payable_balance_blocks_deletion",
      "Account deletion is blocked while you have a payable balance. Set waive_balance to true to forfeit remaining balance.",
      400
    );
  }

  const db = getDb();

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new AppError("not_found", "user_not_found", "User not found.", 404);
  }

  if (user.email.endsWith("@anonymized.refkit.local")) {
    throw new AppError(
      "invalid_request",
      "account_already_deleted",
      "This account has already been deleted.",
      400
    );
  }

  const apiKeyRows = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)));

  for (const key of apiKeyRows) {
    await revokeApiKey(userId, key.id);
  }

  await db
    .update(programAffiliates)
    .set({ status: "disabled" })
    .where(eq(programAffiliates.userId, userId));

  const payoutDetailMembershipRows = await db
    .select({ id: programAffiliates.id })
    .from(programAffiliates)
    .where(eq(programAffiliates.userId, userId));

  if (payoutDetailMembershipRows.length > 0) {
    await db
      .delete(affiliatePayoutDetails)
      .where(
        inArray(
          affiliatePayoutDetails.programAffiliateId,
          payoutDetailMembershipRows.map((row) => row.id)
        )
      );
  }

  const anonymizedEmail = `deleted_${userId}@anonymized.refkit.local`;

  await db
    .update(users)
    .set({
      email: anonymizedEmail,
      name: null,
      image: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  await writeAuditLog({
    actorUserId: userId,
    action: "affiliate.account_deleted",
    resourceType: "user",
    resourceId: userId,
    metadata: {
      waived_balance: input.waiveBalance,
      payable_balance_cents: total,
      balances,
    },
  });

  return {
    deleted: true,
    waived_balance: input.waiveBalance,
    payable_balance_forfeited: total,
  };
}
