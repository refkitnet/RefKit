import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  affiliateLinks,
  programAffiliates,
  apps,
  commissionEntries,
  payoutItems,
  payoutExecutions,
  payoutRequestItems,
  payoutRequests,
  payoutBatches,
  programs,
  users,
  type PayoutItem,
  type PayoutBatch,
} from "@/db/schema";
import { DEFAULT_LINK_LABEL } from "@/lib/link-code";
import { decryptPayoutDetails, encryptPayoutDetails } from "@/lib/crypto";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { ListParams, listWithCursor } from "@/lib/pagination";
import { writeAuditLog } from "@/services/audit";
import { getOrganizationOwnerEmails } from "@/services/organizations";
import {
  sendPayoutPaidEmailDirect,
  sendPayoutReportReadyEmailDirect,
} from "@/services/emails/send-payout-emails";
import {
  listPayoutableCommissionEntries,
  settleRecoveryDebtEntries,
} from "@/services/payouts/balance";
import {
  getPreferredPayoutDetails,
} from "@/services/payouts/payout-details";
import { requireProgramAccess, getProgramIdsForApp } from "@/services/scoping";
import { emitWebhookEvent } from "@/services/webhooks";

type ResolvePayoutItemInput = {
  status: "paid" | "failed" | "pending";
  failureReason?: string;
  externalReference?: string;
};

type MarkAffiliatePayoutPaidInput = {
  externalReference?: string;
  completionSource?: "manual" | "external";
  executionId?: string;
  idempotencyKey?: string;
  callbackPayloadHash?: string;
};

type AffiliatePayoutAmount = {
  programAffiliateId: string;
  amount: number;
};

function getAffiliatePayoutTotals(items: AffiliatePayoutAmount[]) {
  const totals = new Map<string, number>();

  for (const item of items) {
    totals.set(
      item.programAffiliateId,
      (totals.get(item.programAffiliateId) ?? 0) + item.amount
    );
  }

  return totals;
}

function assertPositiveAffiliatePayoutTotals(items: AffiliatePayoutAmount[]) {
  const totals = getAffiliatePayoutTotals(items);

  if (totals.size === 0 || [...totals.values()].some((amount) => amount <= 0)) {
    throw new AppError(
      "invalid_request",
      "no_payable_entries",
      "Every Affiliate payout total must be greater than zero.",
      400
    );
  }
}

async function getRunWithAccess(userId: string, runId: string) {
  const db = getDb();

  const [run] = await db
    .select()
    .from(payoutBatches)
    .where(eq(payoutBatches.id, runId))
    .limit(1);

  if (!run) {
    throw new AppError(
      "not_found",
      "payout_run_not_found",
      "Payout batch not found.",
      404
    );
  }

  await requireProgramAccess(userId, run.programId);

  return run;
}

async function getRunById(runId: string) {
  const db = getDb();

  const [run] = await db
    .select()
    .from(payoutBatches)
    .where(eq(payoutBatches.id, runId))
    .limit(1);

  return run!;
}

export async function createPayoutRun(
  userId: string,
  programId: string,
  options: { programAffiliateId?: string } = {}
) {
  await requireProgramAccess(userId, programId);

  const db = getDb();
  const runId = generateId(ID_PREFIXES.payoutBatch);

  await db.transaction(async (tx) => {
    const lockedPrograms = await tx.execute(sql`
      SELECT id
      FROM ${programs}
      WHERE ${programs.id} = ${programId}
      FOR UPDATE
    `);

    if (lockedPrograms.length === 0) {
      throw new AppError(
        "not_found",
        "program_not_found",
        "Program not found.",
        404
      );
    }

    const candidates = await listPayoutableCommissionEntries(programId, {
      affiliateId: options.programAffiliateId,
      reserveRecoveryDebt: true,
      executor: tx,
    });
    const candidateTotals = getAffiliatePayoutTotals(
      candidates.map((candidate) => ({
        programAffiliateId: candidate.entry.programAffiliateId,
        amount: candidate.payoutAmount,
      }))
    );
    const positiveAffiliateIds = new Set(
      [...candidateTotals.entries()]
        .filter(([, amount]) => amount > 0)
        .map(([programAffiliateId]) => programAffiliateId)
    );
    const payoutableEntries = candidates.filter((candidate) =>
      positiveAffiliateIds.has(candidate.entry.programAffiliateId)
    );

    if (payoutableEntries.length === 0) {
      throw new AppError(
        "invalid_request",
        "no_payable_entries",
        "No payable commission entries are available for a payout batch.",
        400
      );
    }

    const openRequests = await tx
      .select()
      .from(payoutRequests)
      .where(
        and(
          eq(payoutRequests.programId, programId),
          eq(payoutRequests.status, "open")
        )
      );

    const requestByEntryId = new Map<string, string>();

    for (const request of openRequests) {
      const allocations = await tx
        .select()
        .from(payoutRequestItems)
        .where(eq(payoutRequestItems.payoutRequestId, request.id));

      for (const allocation of allocations) {
        requestByEntryId.set(allocation.commissionEntryId, request.id);
      }
    }

    await tx.insert(payoutBatches).values({
      id: runId,
      programId,
      status: "draft",
    });

    for (const payoutableEntry of payoutableEntries) {
      const entry = payoutableEntry.entry;
      const itemId = generateId(ID_PREFIXES.payoutItem);

      try {
        await tx.insert(payoutItems).values({
          id: itemId,
          payoutBatchId: runId,
          payoutRequestId: requestByEntryId.get(entry.id) ?? null,
          commissionEntryId: entry.id,
          programAffiliateId: entry.programAffiliateId,
          amount: payoutableEntry.payoutAmount,
          currency: entry.currency,
          status: "pending",
          batchStatus: "draft",
        });
      }
      catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(
            "conflict",
            "commission_entry_already_in_payout",
            "A commission entry is already part of an active payout batch.",
            409
          );
        }

        throw error;
      }
    }
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "payout_run.created",
    resourceType: "payout_run",
    resourceId: runId,
    metadata: { programId, programAffiliateId: options.programAffiliateId },
  });

  return getRunById(runId);
}

export async function listPayoutRunsForProgram(
  userId: string,
  programId: string,
  params: ListParams
) {
  await requireProgramAccess(userId, programId);

  const limit = params.limit ?? 25;

  return listWithCursor<PayoutBatch>({
    table: payoutBatches,
    columns: {
      id: payoutBatches.id,
      createdAt: payoutBatches.createdAt,
    },
    where: eq(payoutBatches.programId, programId),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listPayoutRunsForApp(
  userId: string,
  appId: string,
  params: ListParams
) {
  const programIds = await getProgramIdsForApp(userId, appId);

  if (programIds.length === 0) {
    return { data: [], hasMore: false };
  }

  const limit = params.limit ?? 25;

  return listWithCursor<PayoutBatch>({
    table: payoutBatches,
    columns: {
      id: payoutBatches.id,
      createdAt: payoutBatches.createdAt,
    },
    where: inArray(payoutBatches.programId, programIds),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listPayoutRunsForAffiliateUser(
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

  const affiliateIds = memberships.map((membership) => membership.id);

  const runRows = await db
    .selectDistinct({
      id: payoutBatches.id,
      programId: payoutBatches.programId,
      status: payoutBatches.status,
      createdAt: payoutBatches.createdAt,
      updatedAt: payoutBatches.updatedAt,
    })
    .from(payoutBatches)
    .innerJoin(payoutItems, eq(payoutItems.payoutBatchId, payoutBatches.id))
    .where(inArray(payoutItems.programAffiliateId, affiliateIds))
    .orderBy(sql`${payoutBatches.createdAt} desc`, sql`${payoutBatches.id} desc`)
    .limit((params.limit ?? 25) + 1);

  const limit = params.limit ?? 25;
  const hasMore = runRows.length > limit;
  const data = hasMore ? runRows.slice(0, limit) : runRows;

  const enriched = await Promise.all(
    data.map(async (run) => {
      const [totals] = await db
        .select({
          amount: sql<number>`coalesce(sum(${payoutItems.amount}), 0)::int`,
          currency: sql<string>`min(${payoutItems.currency})`,
        })
        .from(payoutItems)
        .where(
          and(
            eq(payoutItems.payoutBatchId, run.id),
            inArray(payoutItems.programAffiliateId, affiliateIds)
          )
        );

      return {
        ...run,
        affiliateAmount: Number(totals?.amount ?? 0),
        affiliateCurrency: totals?.currency ?? "usd",
      };
    })
  );

  return {
    data: enriched,
    hasMore,
  };
}

function escapeCsvValue(value: string) {
  const safeValue = /^[\t\r\n ]*[=+\-@]/u.test(value)
    ? `'${value}`
    : value;

  if (
    safeValue.includes(",")
    || safeValue.includes('"')
    || safeValue.includes("\n")
  ) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }

  return safeValue;
}

function flattenPayoutDetails(
  method: string,
  details: Record<string, unknown>
) {
  return Object.entries(details)
    .map(([key, value]) => `${key}=${String(value ?? "")}`)
    .join("; ");
}

function readPayoutDetailsSnapshot(item: PayoutItem) {
  if (!item.payoutMethod || !item.payoutDetailsSnapshotEncrypted) {
    throw new AppError(
      "internal",
      "payout_details_snapshot_missing",
      "Payout details snapshot is missing for this payout item.",
      500
    );
  }

  try {
    const details = JSON.parse(
      decryptPayoutDetails(item.payoutDetailsSnapshotEncrypted)
    );

    if (!details || typeof details !== "object" || Array.isArray(details)) {
      throw new Error("Invalid payout details snapshot.");
    }

    return {
      method: item.payoutMethod,
      details: details as Record<string, unknown>,
    };
  }
  catch {
    throw new AppError(
      "internal",
      "payout_details_snapshot_invalid",
      "Payout details snapshot could not be read.",
      500
    );
  }
}

async function exportPayoutRunSnapshots(runId: string) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const lockedRuns = await tx.execute(sql`
      SELECT id
      FROM ${payoutBatches}
      WHERE ${payoutBatches.id} = ${runId}
      FOR UPDATE
    `);

    if (lockedRuns.length === 0) {
      throw new AppError(
        "not_found",
        "payout_run_not_found",
        "Payout batch not found.",
        404
      );
    }

    const [run] = await tx
      .select()
      .from(payoutBatches)
      .where(eq(payoutBatches.id, runId))
      .limit(1);

    if (!run) {
      throw new AppError(
        "not_found",
        "payout_run_not_found",
        "Payout batch not found.",
        404
      );
    }

    if (run.status === "paid" || run.status === "cancelled") {
      throw new AppError(
        "invalid_request",
        "invalid_payout_run_transition",
        "CSV cannot be downloaded for a paid or cancelled payout batch.",
        400
      );
    }

    const payoutAmountItems = await tx
      .select({
        programAffiliateId: payoutItems.programAffiliateId,
        amount: payoutItems.amount,
      })
      .from(payoutItems)
      .where(eq(payoutItems.payoutBatchId, runId));

    assertPositiveAffiliatePayoutTotals(payoutAmountItems);

    if (run.status === "prepared") {
      return { run, preparedNow: false };
    }

    const [program] = await tx
      .select()
      .from(programs)
      .where(eq(programs.id, run.programId))
      .limit(1);

    if (!program) {
      throw new AppError(
        "not_found",
        "program_not_found",
        "Program not found.",
        404
      );
    }

    const exportItems = await tx
      .select({
        item: payoutItems,
      })
      .from(payoutItems)
      .innerJoin(programAffiliates, eq(programAffiliates.id, payoutItems.programAffiliateId))
      .where(eq(payoutItems.payoutBatchId, runId));

    const payoutDetailsByAffiliateId = new Map<
      string,
      { method: string; details: Record<string, unknown> }
    >();

    for (const row of exportItems) {
      let payoutDetails = payoutDetailsByAffiliateId.get(
        row.item.programAffiliateId
      );

      if (!payoutDetails) {
        const selectedPayoutDetails = await getPreferredPayoutDetails(
          row.item.programAffiliateId,
          program.supportedPayoutMethods,
          program.currency,
          tx
        );

        if (!selectedPayoutDetails) {
          throw new AppError(
            "invalid_request",
            "payout_details_missing",
            "Affiliate payout details are missing for the program currency.",
            400
          );
        }

        payoutDetails = {
          method: selectedPayoutDetails.method,
          details: selectedPayoutDetails.details as Record<string, unknown>,
        };
        payoutDetailsByAffiliateId.set(
          row.item.programAffiliateId,
          payoutDetails
        );
      }

      await tx
        .update(payoutItems)
        .set({
          payoutMethod: payoutDetails.method,
          payoutDetailsSnapshotEncrypted: encryptPayoutDetails(
            JSON.stringify(payoutDetails.details)
          ),
          updatedAt: new Date(),
        })
        .where(eq(payoutItems.id, row.item.id));
    }

    await tx
      .update(payoutBatches)
      .set({
        status: "prepared",
        updatedAt: new Date(),
      })
      .where(and(eq(payoutBatches.id, runId), eq(payoutBatches.status, "draft")));

    await tx
      .update(payoutItems)
      .set({
        batchStatus: "prepared",
        updatedAt: new Date(),
      })
      .where(eq(payoutItems.payoutBatchId, runId));

    return {
      run: {
        ...run,
        status: "prepared",
      },
      preparedNow: true,
    };
  });
}

export async function generatePayoutRunCsv(
  userId: string,
  runId: string,
  options?: { skipAccessCheck?: boolean }
) {
  const db = getDb();

  if (options?.skipAccessCheck) {
    const [run] = await db
      .select({ id: payoutBatches.id })
      .from(payoutBatches)
      .where(eq(payoutBatches.id, runId))
      .limit(1);

    if (!run) {
      throw new AppError(
        "not_found",
        "payout_run_not_found",
        "Payout batch not found.",
        404
      );
    }
  }
  else {
    await getRunWithAccess(userId, runId);
  }

  const { run, preparedNow } = await exportPayoutRunSnapshots(runId);

  if (preparedNow) {
    const [program] = await db
      .select()
      .from(programs)
      .where(eq(programs.id, run.programId))
      .limit(1);

    const [app] = program
      ? await db
          .select()
          .from(apps)
          .where(eq(apps.id, program.appId))
          .limit(1)
      : [null];

    if (program && app) {
      const ownerEmails = await getOrganizationOwnerEmails(app.organizationId);

      for (const to of ownerEmails) {
        await sendPayoutReportReadyEmailDirect({
          to,
          programName: program.name,
          payoutBatchId: runId,
        });
      }
    }
  }

  const items = await db
    .select({
      item: payoutItems,
      defaultLinkCode: affiliateLinks.linkCode,
      email: users.email,
    })
    .from(payoutItems)
    .innerJoin(programAffiliates, eq(programAffiliates.id, payoutItems.programAffiliateId))
    .innerJoin(users, eq(users.id, programAffiliates.userId))
    .leftJoin(
      affiliateLinks,
      and(
        eq(affiliateLinks.programAffiliateId, programAffiliates.id),
        eq(affiliateLinks.label, DEFAULT_LINK_LABEL)
      )
    )
    .where(eq(payoutItems.payoutBatchId, runId));

  const affiliateTotals = new Map<
    string,
    {
      programAffiliateId: string;
      defaultLinkCode: string | null;
      email: string;
      amount: number;
      currency: string;
      method: string;
      details: Record<string, unknown>;
    }
  >();

  for (const row of items) {
    const snapshot = readPayoutDetailsSnapshot(row.item);
    const existing = affiliateTotals.get(row.item.programAffiliateId);

    if (existing) {
      existing.amount += row.item.amount;
    }
    else {
      affiliateTotals.set(row.item.programAffiliateId, {
        programAffiliateId: row.item.programAffiliateId,
        defaultLinkCode: row.defaultLinkCode,
        email: row.email,
        amount: row.item.amount,
        currency: row.item.currency,
        method: snapshot.method,
        details: snapshot.details,
      });
    }
  }

  assertPositiveAffiliatePayoutTotals(
    [...affiliateTotals.values()].map((affiliate) => ({
      programAffiliateId: affiliate.programAffiliateId,
      amount: affiliate.amount,
    }))
  );

  const headers = [
    "program_affiliate_id",
    "default_link_code",
    "affiliate_email",
    "amount",
    "currency",
    "payout_method",
    "payout_details",
  ];

  const lines = [headers.join(",")];

  for (const affiliate of affiliateTotals.values()) {
    lines.push(
      [
        affiliate.programAffiliateId,
        affiliate.defaultLinkCode ?? "",
        affiliate.email,
        String(affiliate.amount),
        affiliate.currency,
        affiliate.method,
        flattenPayoutDetails(affiliate.method, affiliate.details),
      ].map(escapeCsvValue).join(",")
    );
  }

  return lines.join("\n");
}

export async function resolvePayoutItem(
  userId: string,
  runId: string,
  itemId: string,
  input: ResolvePayoutItemInput
) {
  const run = await getRunWithAccess(userId, runId);

  if (run.status === "paid" || run.status === "cancelled") {
    throw new AppError(
      "invalid_request",
      "invalid_payout_run_transition",
      "Payout items cannot be changed after the run is paid or cancelled.",
      400
    );
  }

  const db = getDb();

  const [item] = await db
    .select()
    .from(payoutItems)
    .where(
      and(eq(payoutItems.id, itemId), eq(payoutItems.payoutBatchId, runId))
    )
    .limit(1);

  if (!item) {
    throw new AppError(
      "not_found",
      "payout_item_not_found",
      "Payout item not found.",
      404
    );
  }

  if (input.status === "failed" && !input.failureReason?.trim()) {
    throw new AppError(
      "invalid_request",
      "failure_reason_required",
      "A failure reason is required when marking a payout item as failed.",
      400
    );
  }

  const legalTransitions: Record<string, string[]> = {
    pending: ["paid", "failed"],
    paid: ["failed", "pending"],
    failed: ["paid", "pending"],
  };

  if (!legalTransitions[item.status]?.includes(input.status)) {
    throw new AppError(
      "invalid_request",
      "invalid_payout_item_transition",
      `Cannot transition payout item from ${item.status} to ${input.status}.`,
      400
    );
  }

  await db
    .update(payoutItems)
    .set({
      status: input.status,
      failureReason:
        input.status === "failed" ? input.failureReason ?? null : null,
      externalReference: input.externalReference ?? item.externalReference,
      updatedAt: new Date(),
    })
    .where(eq(payoutItems.id, itemId));

  await writeAuditLog({
    actorUserId: userId,
    action: "payout_item.resolved",
    resourceType: "payout_item",
    resourceId: itemId,
    metadata: {
      runId,
      status: input.status,
      failureReason: input.failureReason,
      externalReference: input.externalReference,
    },
  });

  const [updated] = await db
    .select()
    .from(payoutItems)
    .where(eq(payoutItems.id, itemId))
    .limit(1);

  return updated!;
}

export async function markPayoutRunPaid(userId: string, runId: string) {
  const run = await getRunWithAccess(userId, runId);

  if (run.status !== "prepared") {
    throw new AppError(
      "invalid_request",
      "invalid_payout_run_transition",
      "Only prepared payout batches can be marked paid.",
      400
    );
  }

  const db = getDb();

  const items = await db
    .select()
    .from(payoutItems)
    .where(eq(payoutItems.payoutBatchId, runId));

  if (items.length === 0) {
    throw new AppError(
      "invalid_request",
      "payout_run_empty",
      "Payout batch has no items.",
      400
    );
  }

  const unresolved = items.filter((item) => item.status === "pending");

  if (unresolved.length > 0) {
    throw new AppError(
      "invalid_request",
      "payout_items_unresolved",
      "Every payout item must be resolved as paid or failed before marking the run paid.",
      400
    );
  }

  const paidEntryIds = items
    .filter((item) => item.status === "paid")
    .map((item) => item.commissionEntryId);

  const affiliateIds = [...new Set(items.map((item) => item.programAffiliateId))];
  const paidAffiliateIds = [
    ...new Set(
      items
        .filter((item) => item.status === "paid")
        .map((item) => item.programAffiliateId)
    ),
  ];

  await db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT id
      FROM ${programs}
      WHERE ${programs.id} = ${run.programId}
      FOR UPDATE
    `);

    const [updatedRun] = await tx
      .update(payoutBatches)
      .set({
        status: "paid",
        updatedAt: new Date(),
      })
      .where(
        and(eq(payoutBatches.id, runId), eq(payoutBatches.status, "prepared"))
      )
      .returning({ id: payoutBatches.id });

    if (!updatedRun) {
      throw new AppError(
        "invalid_request",
        "invalid_payout_run_transition",
        "Only prepared payout batches can be marked paid.",
        400
      );
    }

    await tx
      .update(payoutItems)
      .set({
        batchStatus: "paid",
        updatedAt: new Date(),
      })
      .where(eq(payoutItems.payoutBatchId, runId));

    if (paidEntryIds.length > 0) {
      await tx
        .update(commissionEntries)
        .set({
          status: "paid",
          updatedAt: new Date(),
        })
        .where(inArray(commissionEntries.id, paidEntryIds));
    }

    if (paidAffiliateIds.length > 0) {
      const now = new Date();
      await tx
        .update(payoutExecutions)
        .set({
          status: "succeeded",
          completionSource: "manual",
          failureReason: null,
          succeededAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(payoutExecutions.payoutBatchId, runId),
            inArray(
              payoutExecutions.programAffiliateId,
              paidAffiliateIds
            )
          )
        );
    }

    for (const affiliateId of affiliateIds) {
      await settleRecoveryDebtEntries(run.programId, affiliateId, tx);
    }

    const openRequests = await tx
      .select()
      .from(payoutRequests)
      .where(
        and(
          eq(payoutRequests.programId, run.programId),
          eq(payoutRequests.status, "open"),
          inArray(payoutRequests.programAffiliateId, affiliateIds)
        )
      );

    for (const request of openRequests) {
      const allocations = await tx
        .select()
        .from(payoutRequestItems)
        .where(eq(payoutRequestItems.payoutRequestId, request.id));

      if (allocations.length === 0) {
        continue;
      }

      const allocatedEntryIds = allocations.map(
        (allocation) => allocation.commissionEntryId
      );
      const paidItemsForRequest = items.filter(
        (item) =>
          item.status === "paid" &&
          item.payoutRequestId === request.id &&
          allocatedEntryIds.includes(item.commissionEntryId)
      );

      if (paidItemsForRequest.length !== allocations.length) {
        continue;
      }

      const paidAmount = paidItemsForRequest.reduce(
        (sum, item) => sum + item.amount,
        0
      );

      if (paidAmount !== request.amount) {
        continue;
      }

      await tx
        .update(payoutRequests)
        .set({
          status: "fulfilled",
          payoutBatchId: runId,
          updatedAt: new Date(),
        })
        .where(eq(payoutRequests.id, request.id));
    }
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "payout_run.marked_paid",
    resourceType: "payout_run",
    resourceId: runId,
  });

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, run.programId))
    .limit(1);

  for (const affiliateId of affiliateIds) {
    const paidAmount = items
      .filter(
        (item) => item.programAffiliateId === affiliateId && item.status === "paid"
      )
      .reduce((sum, item) => sum + item.amount, 0);

    if (paidAmount <= 0) {
      continue;
    }

    const [affiliate] = await db
      .select()
      .from(programAffiliates)
      .where(eq(programAffiliates.id, affiliateId))
      .limit(1);

    if (!affiliate) {
      continue;
    }

    const [affiliateUser] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, affiliate.userId))
      .limit(1);

    if (affiliateUser?.email && program) {
      await sendPayoutPaidEmailDirect({
        to: affiliateUser.email,
        programName: program.name,
        amount: paidAmount,
        currency: items[0]?.currency ?? program.currency,
      });
    }
  }

  const [programForEvents, paidEntries, completedExecutions] = await Promise.all([
    db
      .select({ appId: programs.appId })
      .from(programs)
      .where(eq(programs.id, run.programId))
      .limit(1)
      .then((rows) => rows[0]),
    paidEntryIds.length > 0
      ? db
          .select()
          .from(commissionEntries)
          .where(inArray(commissionEntries.id, paidEntryIds))
      : Promise.resolve([]),
    db
      .select()
      .from(payoutExecutions)
      .where(
        and(
          eq(payoutExecutions.payoutBatchId, runId),
          eq(payoutExecutions.status, "succeeded"),
          eq(payoutExecutions.completionSource, "manual")
        )
      ),
  ]);

  if (programForEvents) {
    await Promise.all([
      ...paidEntries.map((entry) =>
        emitWebhookEvent({
          appId: programForEvents.appId,
          eventType: "commission.paid",
          livemode: entry.livemode,
          data: {
            id: entry.id,
            program_id: entry.programId,
            program_affiliate_id: entry.programAffiliateId,
            transaction_id: entry.transactionId,
            amount: { amount: entry.amount, currency: entry.currency },
            status: entry.status,
          },
        })
      ),
      ...completedExecutions.map((execution) =>
        emitWebhookEvent({
          appId: execution.appId,
          eventType: "payout.succeeded",
          livemode: true,
          data: {
            id: execution.id,
            payout_batch_id: execution.payoutBatchId,
            program_affiliate_id: execution.programAffiliateId,
            amount: {
              amount: execution.amount,
              currency: execution.currency,
            },
            method: execution.method,
            status: execution.status,
            completion_source: execution.completionSource,
          },
        })
      ),
    ]);
  }

  return getRunById(runId);
}

export async function markAffiliatePayoutPaid(
  userId: string,
  runId: string,
  programAffiliateId: string,
  input: MarkAffiliatePayoutPaidInput = {}
) {
  let run = await getRunWithAccess(userId, runId);

  // Snapshot the exact payment instructions before recording money as paid.
  // The CSV remains optional for the owner; preparing the same immutable
  // snapshot here preserves the audit record without sending an export email.
  if (run.status === "draft") {
    const prepared = await exportPayoutRunSnapshots(runId);
    run = prepared.run;
  }

  if (run.status !== "prepared") {
    throw new AppError(
      "invalid_request",
      "invalid_payout_run_transition",
      "Only prepared payouts can be marked paid.",
      400
    );
  }

  const db = getDb();
  let paidAmount = 0;
  let currency = "usd";
  let paidCommissionEntryIds: string[] = [];

  await db.transaction(async (tx) => {
    const lockedRuns = await tx.execute(sql`
      SELECT id
      FROM ${payoutBatches}
      WHERE ${payoutBatches.id} = ${runId}
      FOR UPDATE
    `);

    if (lockedRuns.length === 0) {
      throw new AppError(
        "not_found",
        "payout_run_not_found",
        "Payout batch not found.",
        404
      );
    }

    const [currentRun] = await tx
      .select()
      .from(payoutBatches)
      .where(eq(payoutBatches.id, runId))
      .limit(1);

    if (!currentRun || currentRun.status !== "prepared") {
      throw new AppError(
        "invalid_request",
        "invalid_payout_run_transition",
        "Only prepared payouts can be marked paid.",
        400
      );
    }

    const affiliateItems = await tx
      .select()
      .from(payoutItems)
      .where(
        and(
          eq(payoutItems.payoutBatchId, runId),
          eq(payoutItems.programAffiliateId, programAffiliateId)
        )
      );

    if (affiliateItems.length === 0) {
      throw new AppError(
        "not_found",
        "affiliate_payout_not_found",
        "Affiliate payout not found.",
        404
      );
    }

    if (affiliateItems.every((item) => item.status === "paid")) {
      throw new AppError(
        "conflict",
        "affiliate_payout_already_paid",
        "Affiliate payout is already marked paid.",
        409
      );
    }

    if (affiliateItems.some((item) => item.status === "failed")) {
      throw new AppError(
        "invalid_request",
        "affiliate_payout_has_failed_items",
        "This affiliate payout has failed items that must be resolved first.",
        400
      );
    }

    const pendingItems = affiliateItems.filter(
      (item) => item.status === "pending"
    );
    const pendingItemIds = pendingItems.map((item) => item.id);
    const paidEntryIds = pendingItems.map((item) => item.commissionEntryId);
    paidCommissionEntryIds = paidEntryIds;

    paidAmount = pendingItems.reduce((sum, item) => sum + item.amount, 0);
    currency = pendingItems[0]?.currency ?? affiliateItems[0]!.currency;

    await tx
      .update(payoutItems)
      .set({
        status: "paid",
        failureReason: null,
        externalReference: input.externalReference ?? null,
        updatedAt: new Date(),
      })
      .where(inArray(payoutItems.id, pendingItemIds));

    if (paidEntryIds.length > 0) {
      await tx
        .update(commissionEntries)
        .set({
          status: "paid",
          updatedAt: new Date(),
        })
        .where(inArray(commissionEntries.id, paidEntryIds));
    }

    const executionWhere = input.executionId
      ? eq(payoutExecutions.id, input.executionId)
      : and(
          eq(payoutExecutions.payoutBatchId, runId),
          eq(payoutExecutions.programAffiliateId, programAffiliateId)
        );
    const completionTime = new Date();

    await tx
      .update(payoutExecutions)
      .set({
        status: "succeeded",
        externalReference: input.externalReference ?? null,
        failureReason: null,
        completionSource: input.completionSource ?? "manual",
        lastIdempotencyKey: input.idempotencyKey ?? null,
        lastCallbackPayloadHash: input.callbackPayloadHash ?? null,
        succeededAt: completionTime,
        updatedAt: completionTime,
      })
      .where(executionWhere);

    await settleRecoveryDebtEntries(
      currentRun.programId,
      programAffiliateId,
      tx
    );

    const openRequests = await tx
      .select()
      .from(payoutRequests)
      .where(
        and(
          eq(payoutRequests.programId, currentRun.programId),
          eq(payoutRequests.programAffiliateId, programAffiliateId),
          eq(payoutRequests.status, "open")
        )
      );

    for (const request of openRequests) {
      const allocations = await tx
        .select()
        .from(payoutRequestItems)
        .where(eq(payoutRequestItems.payoutRequestId, request.id));

      if (allocations.length === 0) {
        continue;
      }

      const allocatedEntryIds = allocations.map(
        (allocation) => allocation.commissionEntryId
      );
      const coveredItems = affiliateItems.filter(
        (item) =>
          item.payoutRequestId === request.id &&
          item.status !== "failed" &&
          allocatedEntryIds.includes(item.commissionEntryId)
      );

      if (coveredItems.length !== allocations.length) {
        continue;
      }

      const coveredAmount = coveredItems.reduce(
        (sum, item) => sum + item.amount,
        0
      );

      if (coveredAmount !== request.amount) {
        continue;
      }

      await tx
        .update(payoutRequests)
        .set({
          status: "fulfilled",
          payoutBatchId: runId,
          updatedAt: new Date(),
        })
        .where(eq(payoutRequests.id, request.id));
    }

    const [remaining] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(payoutItems)
      .where(
        and(
          eq(payoutItems.payoutBatchId, runId),
          eq(payoutItems.status, "pending")
        )
      );

    if (Number(remaining?.count ?? 0) === 0) {
      await tx
        .update(payoutBatches)
        .set({ status: "paid", updatedAt: new Date() })
        .where(eq(payoutBatches.id, runId));

      await tx
        .update(payoutItems)
        .set({ batchStatus: "paid", updatedAt: new Date() })
        .where(eq(payoutItems.payoutBatchId, runId));
    }
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "affiliate_payout.marked_paid",
    resourceType: "program_affiliate",
    resourceId: programAffiliateId,
    metadata: { runId, amount: paidAmount, currency },
  });

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, run.programId))
    .limit(1);
  const [affiliate] = await db
    .select({ email: users.email })
    .from(programAffiliates)
    .innerJoin(users, eq(users.id, programAffiliates.userId))
    .where(eq(programAffiliates.id, programAffiliateId))
    .limit(1);

  if (affiliate?.email && program && paidAmount > 0) {
    await sendPayoutPaidEmailDirect({
      to: affiliate.email,
      programName: program.name,
      amount: paidAmount,
      currency,
    });
  }

  const [completedExecution] = await db
    .select()
    .from(payoutExecutions)
    .where(
      input.executionId
        ? eq(payoutExecutions.id, input.executionId)
        : and(
            eq(payoutExecutions.payoutBatchId, runId),
            eq(payoutExecutions.programAffiliateId, programAffiliateId)
          )
    )
    .limit(1);

  if (program) {
    const paidEntries = paidCommissionEntryIds.length > 0
      ? await db
          .select()
          .from(commissionEntries)
          .where(inArray(commissionEntries.id, paidCommissionEntryIds))
      : [];

    await Promise.all([
      ...paidEntries.map((entry) =>
        emitWebhookEvent({
          appId: program.appId,
          eventType: "commission.paid",
          livemode: entry.livemode,
          data: {
            id: entry.id,
            program_id: entry.programId,
            program_affiliate_id: entry.programAffiliateId,
            transaction_id: entry.transactionId,
            amount: { amount: entry.amount, currency: entry.currency },
            status: entry.status,
          },
        })
      ),
      ...(completedExecution
        ? [
            emitWebhookEvent({
              appId: completedExecution.appId,
              eventType: "payout.succeeded",
              livemode: true,
              data: {
                id: completedExecution.id,
                payout_batch_id: completedExecution.payoutBatchId,
                program_affiliate_id:
                  completedExecution.programAffiliateId,
                amount: {
                  amount: completedExecution.amount,
                  currency: completedExecution.currency,
                },
                method: completedExecution.method,
                status: completedExecution.status,
                completion_source: completedExecution.completionSource,
              },
            }),
          ]
        : []),
    ]);
  }

  return {
    payoutBatch: await getRunById(runId),
    programAffiliateId,
    amount: paidAmount,
    currency,
    status: "paid" as const,
  };
}

export async function cancelPayoutRun(userId: string, runId: string) {
  const run = await getRunWithAccess(userId, runId);

  if (run.status !== "draft" && run.status !== "prepared") {
    throw new AppError(
      "invalid_request",
      "invalid_payout_run_transition",
      "Only draft or prepared payout batches can be cancelled.",
      400
    );
  }

  const db = getDb();

  await db.transaction(async (tx) => {
    await tx
      .update(payoutBatches)
      .set({
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(payoutBatches.id, runId),
          inArray(payoutBatches.status, ["draft", "prepared"])
        )
      );

    await tx
      .update(payoutItems)
      .set({
        batchStatus: "cancelled",
        updatedAt: new Date(),
      })
      .where(eq(payoutItems.payoutBatchId, runId));
  });

  await writeAuditLog({
    actorUserId: userId,
    action: "payout_run.cancelled",
    resourceType: "payout_run",
    resourceId: runId,
  });

  return getRunById(runId);
}

export async function getPayoutItemsForRun(runId: string) {
  const db = getDb();

  return db
    .select()
    .from(payoutItems)
    .where(eq(payoutItems.payoutBatchId, runId));
}

export async function listPayoutItemsForRunOwner(
  userId: string,
  runId: string
) {
  await getRunWithAccess(userId, runId);
  return getPayoutItemsForRun(runId);
}

export function serializePayoutRun(
  run: PayoutBatch,
  executions: Array<{
    id: string;
    programAffiliateId: string;
    status: string;
    failureReason: string | null;
  }> = []
) {
  return {
    id: run.id,
    program_id: run.programId,
    status: run.status,
    created_at: run.createdAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
    executions: executions.map((execution) => ({
      id: execution.id,
      program_affiliate_id: execution.programAffiliateId,
      status: execution.status,
      failure_reason: execution.failureReason,
    })),
  };
}

export function serializePayoutRunForAffiliate(
  run: PayoutBatch & { affiliateAmount: number; affiliateCurrency: string }
) {
  return {
    id: run.id,
    program_id: run.programId,
    status: run.status,
    amount: {
      amount: run.affiliateAmount,
      currency: run.affiliateCurrency,
    },
    date: run.createdAt.toISOString(),
    created_at: run.createdAt.toISOString(),
    updated_at: run.updatedAt.toISOString(),
  };
}

export function serializePayoutItem(item: PayoutItem) {
  return {
    id: item.id,
    payout_batch_id: item.payoutBatchId,
    commission_entry_id: item.commissionEntryId,
    program_affiliate_id: item.programAffiliateId,
    amount: { amount: item.amount, currency: item.currency },
    status: item.status,
    failure_reason: item.failureReason,
    external_reference: item.externalReference,
    created_at: item.createdAt.toISOString(),
    updated_at: item.updatedAt.toISOString(),
  };
}
