import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  payoutBatches,
  payoutExecutions,
  payoutItems,
  type PayoutExecution,
} from "@/db/schema";
import { decryptPayoutDetails, sha256 } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { requireProgramAccess } from "@/services/scoping";
import {
  emitWebhookEvent,
  isWebhookSubscribed,
} from "@/services/webhooks";
import { markAffiliatePayoutPaid } from "./payout-batches";

type SucceededInput = {
  externalReference?: string;
  idempotencyKey: string;
};

type FailedInput = {
  failureReason: string;
  externalReference?: string;
  idempotencyKey: string;
};

async function getExecution(executionId: string) {
  const db = getDb();
  const [execution] = await db
    .select()
    .from(payoutExecutions)
    .where(eq(payoutExecutions.id, executionId))
    .limit(1);

  return execution ?? null;
}

async function requireExecutionForApp(executionId: string, appId: string) {
  const execution = await getExecution(executionId);

  if (!execution || execution.appId !== appId) {
    throw new AppError(
      "not_found",
      "payout_execution_not_found",
      "Payout execution not found.",
      404
    );
  }

  return execution;
}

function callbackHash(
  status: "succeeded" | "failed",
  input: { externalReference?: string; failureReason?: string }
) {
  return sha256(
    JSON.stringify({
      status,
      external_reference: input.externalReference ?? null,
      failure_reason: input.failureReason ?? null,
    })
  );
}

function assertIdempotencyKeyReuse(
  execution: PayoutExecution,
  idempotencyKey: string,
  payloadHash: string
) {
  if (
    execution.lastIdempotencyKey === idempotencyKey
    && execution.lastCallbackPayloadHash
    && execution.lastCallbackPayloadHash !== payloadHash
  ) {
    throw new AppError(
      "conflict",
      "idempotency_key_conflict",
      "This Idempotency-Key was already used with a different result.",
      409
    );
  }
}

export async function dispatchPayoutBatch(userId: string, payoutBatchId: string) {
  const db = getDb();
  const [batch] = await db
    .select()
    .from(payoutBatches)
    .where(eq(payoutBatches.id, payoutBatchId))
    .limit(1);

  if (!batch) {
    throw new AppError(
      "not_found",
      "payout_run_not_found",
      "Payout batch not found.",
      404
    );
  }

  const program = await requireProgramAccess(userId, batch.programId);

  if (batch.status !== "prepared") {
    throw new AppError(
      "invalid_request",
      "payout_batch_not_prepared",
      "Only prepared payout batches can be sent to a payout system.",
      400
    );
  }

  if (!(await isWebhookSubscribed(program.appId, "payout.ready"))) {
    throw new AppError(
      "invalid_request",
      "payout_ready_webhook_required",
      "Enable a webhook subscribed to payout.ready before dispatching payouts.",
      400
    );
  }

  const createdExecutions = await db.transaction(async (tx) => {
    const locked = await tx.execute(sql`
      SELECT id
      FROM ${payoutBatches}
      WHERE ${payoutBatches.id} = ${payoutBatchId}
      FOR UPDATE
    `);

    if (locked.length === 0) {
      throw new AppError(
        "not_found",
        "payout_run_not_found",
        "Payout batch not found.",
        404
      );
    }

    const [currentBatch] = await tx
      .select()
      .from(payoutBatches)
      .where(eq(payoutBatches.id, payoutBatchId))
      .limit(1);

    if (!currentBatch || currentBatch.status !== "prepared") {
      throw new AppError(
        "invalid_request",
        "payout_batch_not_prepared",
        "Only prepared payout batches can be sent to a payout system.",
        400
      );
    }

    const existing = await tx
      .select({ id: payoutExecutions.id })
      .from(payoutExecutions)
      .where(eq(payoutExecutions.payoutBatchId, payoutBatchId))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(
        "conflict",
        "payout_batch_already_dispatched",
        "This payout batch was already sent to a payout system.",
        409
      );
    }

    const items = await tx
      .select()
      .from(payoutItems)
      .where(eq(payoutItems.payoutBatchId, payoutBatchId));

    if (items.length === 0) {
      throw new AppError(
        "invalid_request",
        "payout_run_empty",
        "Payout batch has no items.",
        400
      );
    }

    if (
      items.some(
        (item) =>
          item.status !== "pending"
          || !item.payoutMethod
          || !item.payoutDetailsSnapshotEncrypted
      )
    ) {
      throw new AppError(
        "invalid_request",
        "payout_batch_not_dispatchable",
        "Every payout item must be pending with a prepared instruction snapshot.",
        400
      );
    }

    const affiliateIds = [
      ...new Set(items.map((item) => item.programAffiliateId)),
    ];
    const executions: PayoutExecution[] = [];

    for (const programAffiliateId of affiliateIds) {
      const affiliateItems = items.filter(
        (item) => item.programAffiliateId === programAffiliateId
      );
      const first = affiliateItems[0]!;

      if (
        affiliateItems.some(
          (item) =>
            item.currency !== first.currency
            || item.payoutMethod !== first.payoutMethod
        )
      ) {
        throw new AppError(
          "invalid_request",
          "payout_instruction_mismatch",
          "Affiliate payout items do not share one currency and payout method.",
          400
        );
      }

      const amount = affiliateItems.reduce(
        (total, item) => total + item.amount,
        0
      );

      if (amount <= 0) {
        throw new AppError(
          "invalid_request",
          "payout_amount_not_positive",
          "Affiliate payout amount must be greater than zero.",
          400
        );
      }

      const [execution] = await tx
        .insert(payoutExecutions)
        .values({
          id: generateId(ID_PREFIXES.payoutExecution),
          appId: program.appId,
          payoutBatchId,
          programAffiliateId,
          amount,
          currency: first.currency,
          method: first.payoutMethod!,
          instructionSnapshotEncrypted:
            first.payoutDetailsSnapshotEncrypted!,
          status: "ready",
        })
        .returning();

      executions.push(execution!);
    }

    return executions;
  });

  await Promise.all(
    createdExecutions.map((execution) =>
      emitWebhookEvent({
        appId: execution.appId,
        eventType: "payout.ready",
        livemode: true,
        data: serializePayoutExecution(execution),
      })
    )
  );

  return createdExecutions;
}

export async function getPayoutExecutionForApp(
  appId: string,
  executionId: string
) {
  return requireExecutionForApp(executionId, appId);
}

export async function getPayoutExecutionsForBatches(
  payoutBatchIds: string[]
) {
  if (payoutBatchIds.length === 0) {
    return [];
  }

  return getDb()
    .select()
    .from(payoutExecutions)
    .where(inArray(payoutExecutions.payoutBatchId, payoutBatchIds));
}

export function readPayoutExecutionInstructions(execution: PayoutExecution) {
  try {
    const instructions = JSON.parse(
      decryptPayoutDetails(execution.instructionSnapshotEncrypted)
    );

    if (!instructions || typeof instructions !== "object" || Array.isArray(instructions)) {
      throw new Error("Invalid instruction snapshot.");
    }

    return instructions as Record<string, unknown>;
  }
  catch {
    throw new AppError(
      "internal",
      "payout_instruction_snapshot_invalid",
      "Payout instruction snapshot could not be read.",
      500
    );
  }
}

export async function markPayoutExecutionSucceeded(
  userId: string,
  appId: string,
  executionId: string,
  input: SucceededInput
) {
  const execution = await requireExecutionForApp(executionId, appId);
  const payloadHash = callbackHash("succeeded", input);
  assertIdempotencyKeyReuse(execution, input.idempotencyKey, payloadHash);

  if (execution.status === "succeeded") {
    if (
      execution.externalReference === (input.externalReference ?? null)
      && execution.lastCallbackPayloadHash === payloadHash
    ) {
      return execution;
    }

    throw new AppError(
      "conflict",
      "payout_execution_already_succeeded",
      "This payout execution already succeeded with a different result.",
      409
    );
  }

  try {
    await markAffiliatePayoutPaid(
      userId,
      execution.payoutBatchId,
      execution.programAffiliateId,
      {
        externalReference: input.externalReference,
        completionSource: "external",
        executionId,
        idempotencyKey: input.idempotencyKey,
        callbackPayloadHash: payloadHash,
      }
    );
  }
  catch (error) {
    const current = await getExecution(executionId);

    if (
      current?.status === "succeeded"
      && current.externalReference === (input.externalReference ?? null)
      && current.lastCallbackPayloadHash === payloadHash
    ) {
      return current;
    }

    throw error;
  }

  return (await getExecution(executionId))!;
}

export async function markPayoutExecutionFailed(
  appId: string,
  executionId: string,
  input: FailedInput
) {
  const execution = await requireExecutionForApp(executionId, appId);
  const payloadHash = callbackHash("failed", input);
  assertIdempotencyKeyReuse(execution, input.idempotencyKey, payloadHash);

  if (execution.status === "succeeded") {
    throw new AppError(
      "conflict",
      "payout_execution_already_succeeded",
      "A succeeded payout execution cannot be changed.",
      409
    );
  }

  if (execution.status === "failed") {
    if (
      execution.failureReason === input.failureReason
      && execution.externalReference === (input.externalReference ?? null)
      && execution.lastCallbackPayloadHash === payloadHash
    ) {
      return execution;
    }

    throw new AppError(
      "conflict",
      "payout_execution_result_conflict",
      "This payout execution already failed with a different result.",
      409
    );
  }

  const now = new Date();
  const db = getDb();
  const [updated] = await db
    .update(payoutExecutions)
    .set({
      status: "failed",
      externalReference: input.externalReference ?? null,
      failureReason: input.failureReason,
      completionSource: "external",
      lastIdempotencyKey: input.idempotencyKey,
      lastCallbackPayloadHash: payloadHash,
      failedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(payoutExecutions.id, executionId),
        eq(payoutExecutions.status, "ready")
      )
    )
    .returning();

  if (!updated) {
    const current = await getExecution(executionId);

    if (
      current?.status === "failed"
      && current.failureReason === input.failureReason
      && current.externalReference === (input.externalReference ?? null)
      && current.lastCallbackPayloadHash === payloadHash
    ) {
      return current;
    }

    throw new AppError(
      "conflict",
      "payout_execution_result_conflict",
      "Payout execution was updated by another request.",
      409
    );
  }

  await emitWebhookEvent({
    appId,
    eventType: "payout.failed",
    livemode: true,
    data: serializePayoutExecution(updated),
  });

  return updated;
}

export function serializePayoutExecution(execution: PayoutExecution) {
  return {
    id: execution.id,
    app_id: execution.appId,
    payout_batch_id: execution.payoutBatchId,
    program_affiliate_id: execution.programAffiliateId,
    amount: { amount: execution.amount, currency: execution.currency },
    method: execution.method,
    status: execution.status,
    external_reference: execution.externalReference,
    failure_reason: execution.failureReason,
    completion_source: execution.completionSource,
    dispatched_at: execution.dispatchedAt.toISOString(),
    failed_at: execution.failedAt?.toISOString() ?? null,
    succeeded_at: execution.succeededAt?.toISOString() ?? null,
    created_at: execution.createdAt.toISOString(),
    updated_at: execution.updatedAt.toISOString(),
  };
}

export function serializePayoutExecutionWithInstructions(
  execution: PayoutExecution
) {
  return {
    ...serializePayoutExecution(execution),
    instructions: readPayoutExecutionInstructions(execution),
  };
}
