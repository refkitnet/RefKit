import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { programAffiliates, apps, commissionEntries, programs, stripeEvents } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { writeAuditLog } from "@/services/audit";
import { disableAffiliate } from "@/services/affiliates";
import { disableProgram } from "@/services/programs/disable";
import { generatePayoutRunCsv } from "@/services/payouts/payout-batches";
import {
  isStripeEventStuck,
  processStoredStripeEvent,
} from "@/services/stripe/event-processor";

export type CreateCommissionAdjustmentInput = {
  programAffiliateId: string;
  amount: number;
  currency: string;
  reason: string;
};

export async function reprocessStripeEvent(
  adminUserId: string,
  eventId: string
) {
  const db = getDb();

  const [event] = await db
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.id, eventId))
    .limit(1);

  if (!event) {
    throw new AppError(
      "not_found",
      "stripe_event_not_found",
      "Stripe event not found.",
      404
    );
  }

  if (event.processingStatus === "processing" && !isStripeEventStuck(event)) {
    throw new AppError(
      "conflict",
      "stripe_event_processing",
      "Stripe event is already being processed.",
      409
    );
  }

  try {
    const updated = await processStoredStripeEvent(eventId, { force: true });

    if (!updated || updated.processingStatus !== "processed") {
      throw new AppError(
        "conflict",
        "stripe_event_not_reprocessed",
        "Stripe event could not be claimed for reprocessing.",
        409
      );
    }

    await writeAuditLog({
      actorUserId: adminUserId,
      action: "stripe_event.reprocessed",
      resourceType: "stripe_event",
      resourceId: eventId,
      metadata: {
        previous_processing_status: event.processingStatus,
        outcome: "processed",
      },
    });

    return updated;
  }
  catch (error) {
    await writeAuditLog({
      actorUserId: adminUserId,
      action: "stripe_event.reprocessed",
      resourceType: "stripe_event",
      resourceId: eventId,
      metadata: {
        previous_processing_status: event.processingStatus,
        outcome: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
    });

    throw error;
  }
}

export async function createCommissionAdjustment(
  adminUserId: string,
  input: CreateCommissionAdjustmentInput
) {
  if (!Number.isInteger(input.amount) || input.amount === 0) {
    throw new AppError(
      "invalid_request",
      "invalid_adjustment_amount",
      "Adjustment amount must be a non-zero integer in minor units.",
      400
    );
  }

  const db = getDb();

  const [affiliate] = await db
    .select()
    .from(programAffiliates)
    .where(eq(programAffiliates.id, input.programAffiliateId))
    .limit(1);

  if (!affiliate) {
    throw new AppError(
      "not_found",
      "affiliate_not_found",
      "Affiliate not found.",
      404
    );
  }

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, affiliate.programId))
    .limit(1);

  if (!program) {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }

  if (input.currency !== program.currency) {
    throw new AppError(
      "invalid_request",
      "invalid_adjustment_currency",
      "Adjustment currency must match the program currency.",
      400
    );
  }

  const entryId = generateId(ID_PREFIXES.commissionEntry);
  const now = new Date();

  await db.insert(commissionEntries).values({
    id: entryId,
    programId: affiliate.programId,
    programAffiliateId: affiliate.id,
    kind: "admin_adjustment",
    amount: input.amount,
    currency: input.currency,
    status: "approved",
    livemode: true,
    approvedAt: now,
    approvedByUserId: adminUserId,
    approvalReason: input.reason,
  });

  await writeAuditLog({
    actorUserId: adminUserId,
    action: "commission.adjustment_created",
    resourceType: "commission_entry",
    resourceId: entryId,
    metadata: {
      program_affiliate_id: affiliate.id,
      program_id: affiliate.programId,
      amount: input.amount,
      currency: input.currency,
      reason: input.reason,
    },
  });

  const [entry] = await db
    .select()
    .from(commissionEntries)
    .where(eq(commissionEntries.id, entryId))
    .limit(1);

  return entry!;
}

export async function adminDisableProgram(adminUserId: string, programId: string) {
  const program = await disableProgram(adminUserId, programId, {
    skipAccessCheck: true,
    skipAcknowledgmentCheck: true,
    auditAction: "admin.program_disabled",
  });

  return program;
}

export async function adminDisableAffiliate(
  adminUserId: string,
  affiliateId: string
) {
  const affiliate = await disableAffiliate(adminUserId, affiliateId, {
    skipAccessCheck: true,
    auditAction: "admin.affiliate_disabled",
  });

  return affiliate;
}

export async function markIntegrationIssue(
  adminUserId: string,
  appId: string,
  note: string | null
) {
  const db = getDb();

  const [app] = await db
    .select()
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  if (!app) {
    throw new AppError("not_found", "app_not_found", "App not found.", 404);
  }

  const trimmedNote = note?.trim() ?? "";
  const nextNote = trimmedNote.length > 0 ? trimmedNote : null;
  const nextTimestamp = nextNote ? new Date() : null;

  await db
    .update(apps)
    .set({
      integrationIssue: nextNote,
      integrationIssueAt: nextTimestamp,
      updatedAt: new Date(),
    })
    .where(eq(apps.id, appId));

  await writeAuditLog({
    actorUserId: adminUserId,
    action: nextNote
      ? "admin.integration_issue_marked"
      : "admin.integration_issue_cleared",
    resourceType: "app",
    resourceId: appId,
    metadata: {
      note: nextNote,
    },
  });

  const [updated] = await db
    .select()
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  return updated!;
}

export async function adminExportPayoutRunCsv(
  adminUserId: string,
  runId: string
) {
  const csv = await generatePayoutRunCsv(adminUserId, runId, {
    skipAccessCheck: true,
  });

  await writeAuditLog({
    actorUserId: adminUserId,
    action: "admin.payout_csv_exported",
    resourceType: "payout_run",
    resourceId: runId,
  });

  return csv;
}
