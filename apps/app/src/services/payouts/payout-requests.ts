import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  programAffiliates,
  apps,
  payoutRequestItems,
  payoutRequests,
  programs,
  users,
  type PayoutRequest,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { ListParams, listWithCursor } from "@/lib/pagination";
import { writeAuditLog } from "@/services/audit";
import { getOrganizationOwnerEmails } from "@/services/organizations";
import {
  sendPayoutRequestDeclinedEmailDirect,
  sendPayoutRequestReceivedEmailDirect,
} from "@/services/emails/send-payout-emails";
import { computePayableBalance, listPayableCommissionEntries } from "@/services/payouts/balance";
import { affiliateHasPayoutDetailsForProgram } from "@/services/payouts/payout-details";
import { requireProgramAccess, getProgramIdsForApp } from "@/services/scoping";

async function getAffiliateMembership(userId: string, programId: string) {
  const db = getDb();

  const [membership] = await db
    .select()
    .from(programAffiliates)
    .where(
      and(eq(programAffiliates.userId, userId), eq(programAffiliates.programId, programId))
    )
    .limit(1);

  if (!membership) {
    throw new AppError(
      "not_found",
      "affiliate_not_found",
      "Affiliate membership not found.",
      404
    );
  }

  return membership;
}

async function getProgramForRequest(programId: string) {
  const db = getDb();

  const [program] = await db
    .select()
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

  return program;
}

export async function createPayoutRequest(
  userId: string,
  programId: string
) {
  const membership = await getAffiliateMembership(userId, programId);
  const program = await getProgramForRequest(programId);

  const hasDetails = await affiliateHasPayoutDetailsForProgram(
    membership.id,
    program.supportedPayoutMethods,
    program.currency
  );

  if (!hasDetails) {
    throw new AppError(
      "invalid_request",
      "payout_details_required",
      "Add payout details for a supported payout method before requesting a payout.",
      400
    );
  }

  const balance = await computePayableBalance(membership.id, programId);

  if (balance.amount <= 0) {
    throw new AppError(
      "invalid_request",
      "no_payable_balance",
      "No payable balance is available for a payout request.",
      400
    );
  }

  if (balance.amount < program.minimumPayoutAmount) {
    throw new AppError(
      "invalid_request",
      "minimum_payout_not_met",
      "Payable balance has not reached the program minimum payout amount.",
      400
    );
  }

  const db = getDb();

  const [existingOpen] = await db
    .select()
    .from(payoutRequests)
    .where(
      and(
        eq(payoutRequests.programAffiliateId, membership.id),
        eq(payoutRequests.programId, programId),
        eq(payoutRequests.status, "open")
      )
    )
    .limit(1);

  if (existingOpen) {
    throw new AppError(
      "conflict",
      "payout_request_already_open",
      "An open payout request already exists for this program.",
      409
    );
  }

  const requestId = generateId(ID_PREFIXES.payoutRequest);
  const payableEntries = await listPayableCommissionEntries(
    programId,
    membership.id
  );

  await db.transaction(async (tx) => {
    await tx.insert(payoutRequests).values({
      id: requestId,
      programId,
      programAffiliateId: membership.id,
      status: "open",
      amount: balance.amount,
      currency: balance.currency,
    });

    for (const entry of payableEntries) {
      const itemId = generateId(ID_PREFIXES.payoutRequestItem);

      await tx.insert(payoutRequestItems).values({
        id: itemId,
        payoutRequestId: requestId,
        commissionEntryId: entry.id,
      });
    }
  });

  const [app] = await db
    .select()
    .from(apps)
    .where(eq(apps.id, program.appId))
    .limit(1);

  if (app) {
    const ownerEmails = await getOrganizationOwnerEmails(app.organizationId);

    for (const to of ownerEmails) {
      await sendPayoutRequestReceivedEmailDirect({
        to,
        programName: program.name,
        programAffiliateId: membership.id,
        amount: balance.amount,
        currency: balance.currency,
      });
    }
  }

  return getPayoutRequestById(requestId);
}

export async function listPayoutRequestsForProgram(
  userId: string,
  programId: string,
  params: ListParams
) {
  await requireProgramAccess(userId, programId);

  const limit = params.limit ?? 25;

  return listWithCursor<PayoutRequest>({
    table: payoutRequests,
    columns: {
      id: payoutRequests.id,
      createdAt: payoutRequests.createdAt,
    },
    where: and(
      eq(payoutRequests.programId, programId),
      eq(payoutRequests.status, "open")
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listPayoutRequestsForApp(
  userId: string,
  appId: string,
  params: ListParams
) {
  const programIds = await getProgramIdsForApp(userId, appId);

  if (programIds.length === 0) {
    return { data: [], hasMore: false };
  }

  const limit = params.limit ?? 25;

  return listWithCursor<PayoutRequest>({
    table: payoutRequests,
    columns: {
      id: payoutRequests.id,
      createdAt: payoutRequests.createdAt,
    },
    where: and(
      inArray(payoutRequests.programId, programIds),
      eq(payoutRequests.status, "open")
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listPayoutRequestsForAffiliateUser(
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

  return listWithCursor<PayoutRequest>({
    table: payoutRequests,
    columns: {
      id: payoutRequests.id,
      createdAt: payoutRequests.createdAt,
    },
    where: inArray(
      payoutRequests.programAffiliateId,
      memberships.map((membership) => membership.id)
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

async function getPayoutRequestById(requestId: string) {
  const db = getDb();

  const [request] = await db
    .select()
    .from(payoutRequests)
    .where(eq(payoutRequests.id, requestId))
    .limit(1);

  return request!;
}

async function getPayoutRequestWithAccess(
  userId: string,
  requestId: string
) {
  const db = getDb();

  const [request] = await db
    .select()
    .from(payoutRequests)
    .where(eq(payoutRequests.id, requestId))
    .limit(1);

  if (!request) {
    throw new AppError(
      "not_found",
      "payout_request_not_found",
      "Payout request not found.",
      404
    );
  }

  await requireProgramAccess(userId, request.programId);

  return request;
}

export async function declinePayoutRequest(
  userId: string,
  requestId: string,
  reason: string
) {
  const request = await getPayoutRequestWithAccess(userId, requestId);

  if (request.status !== "open") {
    throw new AppError(
      "invalid_request",
      "invalid_payout_request_transition",
      "Only open payout requests can be declined.",
      400
    );
  }

  const db = getDb();

  await db.transaction(async (tx) => {
    const [declined] = await tx
      .update(payoutRequests)
      .set({
        status: "declined",
        declineReason: reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payoutRequests.id, requestId),
          eq(payoutRequests.status, "open")
        )
      )
      .returning({ id: payoutRequests.id });

    if (!declined) {
      throw new AppError(
        "invalid_request",
        "invalid_payout_request_transition",
        "Only open payout requests can be declined.",
        400
      );
    }

    await tx
      .delete(payoutRequestItems)
      .where(eq(payoutRequestItems.payoutRequestId, requestId));
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "payout_request.declined",
    resourceType: "payout_request",
    resourceId: requestId,
    metadata: { reason },
  });

  const [affiliate] = await db
    .select()
    .from(programAffiliates)
    .where(eq(programAffiliates.id, request.programAffiliateId))
    .limit(1);

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, request.programId))
    .limit(1);

  if (affiliate && program) {
    const [affiliateUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, affiliate.userId))
      .limit(1);

    if (affiliateUser?.email) {
      await sendPayoutRequestDeclinedEmailDirect({
        to: affiliateUser.email,
        programName: program.name,
        reason,
      });
    }
  }

  return getPayoutRequestById(requestId);
}

export function serializePayoutRequest(request: PayoutRequest) {
  return {
    id: request.id,
    program_id: request.programId,
    program_affiliate_id: request.programAffiliateId,
    status: request.status,
    amount: { amount: request.amount, currency: request.currency },
    decline_reason: request.declineReason,
    payout_batch_id: request.payoutBatchId,
    created_at: request.createdAt.toISOString(),
    updated_at: request.updatedAt.toISOString(),
  };
}
