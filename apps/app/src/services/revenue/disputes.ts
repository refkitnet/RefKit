import { and, eq, ne, or } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  commissionEntries,
  revenueDisputes,
  type Transaction,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import type { RevenueSource } from "@/lib/revenue-source";
import {
  createDisputeEntry,
  getEarnedEntryForTransaction,
  markEntriesDisputed,
  restoreDisputedEarnedEntry,
} from "@/services/revenue/commission-ledger";
import {
  getActiveDisputedAmountForPayment,
  getRefundedAmountForPayment,
  lockTransactionForUpdate,
} from "@/services/revenue/transactions";
import { lockAppRevenueSource } from "@/services/revenue/guards";

export const REVENUE_DISPUTE_STATUSES = [
  "opened",
  "won",
  "withdrawn",
  "lost",
  "funds_reinstated",
] as const;

export type RevenueDisputeStatus =
  (typeof REVENUE_DISPUTE_STATUSES)[number];

type ApplyRevenueDisputeInput = {
  payment: Transaction;
  source: RevenueSource;
  disputeId: string;
  status: RevenueDisputeStatus;
  amount: number;
  eventDate: Date;
  stripeDisputeId?: string;
};

export type ApplyRevenueDisputeResult = {
  dispute_id: string;
  payment_transaction_id: string;
  status: RevenueDisputeStatus;
  commission_entry_id: string | null;
  livemode: boolean;
  created: boolean;
  updated: boolean;
};

function disputeSourceEventId(
  disputeRecordId: string,
  event: "opened" | "lost" | "funds_reinstated"
) {
  return `${disputeRecordId}:${event}`;
}

function assertDisputeDetailsMatch(
  existing: typeof revenueDisputes.$inferSelect,
  input: ApplyRevenueDisputeInput,
  payment: Transaction
) {
  if (
    existing.source !== input.source
    || existing.paymentTransactionId !== payment.id
    || existing.amount !== input.amount
    || existing.currency !== payment.currency
  ) {
    throw new AppError(
      "conflict",
      "dispute_id_conflict",
      "This dispute id was already used with different details.",
      409
    );
  }
}

function shouldApplyStatus(
  current: RevenueDisputeStatus,
  next: RevenueDisputeStatus
) {
  if (current === next || next === "opened") {
    return false;
  }

  if (current === "opened") {
    return true;
  }

  if (current === "lost") {
    if (next === "funds_reinstated") {
      return true;
    }

    throw new AppError(
      "conflict",
      "dispute_status_conflict",
      "This dispute already has a conflicting terminal status.",
      409
    );
  }

  if (current === "funds_reinstated") {
    return false;
  }

  if (next === "lost") {
    throw new AppError(
      "conflict",
      "dispute_status_conflict",
      "This dispute already has a conflicting terminal status.",
      409
    );
  }

  return false;
}

async function restoreWhenNoOtherDisputeIsOpen(
  input: {
    disputeRecordId: string;
    paymentTransactionId: string;
    earnedEntryId: string;
  },
  executor: DbExecutor
) {
  const [otherOpenDispute] = await executor
    .select({ id: revenueDisputes.id })
    .from(revenueDisputes)
    .where(
      and(
        eq(
          revenueDisputes.paymentTransactionId,
          input.paymentTransactionId
        ),
        eq(revenueDisputes.status, "opened"),
        ne(revenueDisputes.id, input.disputeRecordId)
      )
    )
    .limit(1);

  if (!otherOpenDispute) {
    await restoreDisputedEarnedEntry(input.earnedEntryId, executor);
  }
}

async function applyCommissionOutcome(input: {
  disputeRecordId: string;
  disputeId: string;
  paymentTransactionId: string;
  status: RevenueDisputeStatus;
  amount: number;
  livemode: boolean;
  stripeDisputeId?: string;
}, executor: DbExecutor) {
  const earnedEntry = await getEarnedEntryForTransaction(
    input.paymentTransactionId,
    executor
  );

  if (!earnedEntry || !earnedEntry.transactionId) {
    return null;
  }

  const openedIdentity = {
    sourceEventId: disputeSourceEventId(input.disputeRecordId, "opened"),
    disputeId: input.disputeId,
    stripeDisputeId: input.stripeDisputeId,
  };

  if (input.status === "opened") {
    await markEntriesDisputed([earnedEntry.id], openedIdentity, executor);
    return null;
  }

  if (input.status === "won" || input.status === "withdrawn") {
    await restoreWhenNoOtherDisputeIsOpen(
      {
        disputeRecordId: input.disputeRecordId,
        paymentTransactionId: input.paymentTransactionId,
        earnedEntryId: earnedEntry.id,
      },
      executor
    );
    return null;
  }

  if (input.status === "lost") {
    const reversal = await createDisputeEntry(
      {
        earnedEntryId: earnedEntry.id,
        disputedAmountMinor: input.amount,
        sourceEventId: disputeSourceEventId(input.disputeRecordId, "lost"),
        disputeId: input.disputeId,
        stripeDisputeId: input.stripeDisputeId,
        kind: "dispute_reversal",
        livemode: input.livemode,
      },
      executor
    );
    await restoreWhenNoOtherDisputeIsOpen(
      {
        disputeRecordId: input.disputeRecordId,
        paymentTransactionId: input.paymentTransactionId,
        earnedEntryId: earnedEntry.id,
      },
      executor
    );
    return reversal;
  }

  const [reversal] = await executor
    .select()
    .from(commissionEntries)
    .where(
      and(
        eq(commissionEntries.transactionId, earnedEntry.transactionId),
        eq(commissionEntries.kind, "dispute_reversal"),
        or(
          eq(
            commissionEntries.sourceEventId,
            disputeSourceEventId(input.disputeRecordId, "lost")
          ),
          input.stripeDisputeId
            ? eq(commissionEntries.stripeDisputeId, input.stripeDisputeId)
            : undefined
        )
      )
    )
    .limit(1);

  if (!reversal) {
    await restoreWhenNoOtherDisputeIsOpen(
      {
        disputeRecordId: input.disputeRecordId,
        paymentTransactionId: input.paymentTransactionId,
        earnedEntryId: earnedEntry.id,
      },
      executor
    );
    return null;
  }

  return createDisputeEntry(
    {
      earnedEntryId: earnedEntry.id,
      disputedAmountMinor: input.amount,
      sourceEventId: disputeSourceEventId(
        input.disputeRecordId,
        "funds_reinstated"
      ),
      disputeId: input.disputeId,
      stripeDisputeId: input.stripeDisputeId,
      kind: "dispute_reinstatement",
      livemode: input.livemode,
    },
    executor
  );
}

export async function applyRevenueDisputeEvent(
  input: ApplyRevenueDisputeInput
): Promise<ApplyRevenueDisputeResult> {
  if (input.amount <= 0 || input.amount > input.payment.amount) {
    throw new AppError(
      "invalid_request",
      "invalid_dispute_amount",
      "Dispute amount must be positive and cannot exceed the payment amount.",
      400
    );
  }

  const db = getDb();

  return db.transaction(async (tx) => {
    await lockAppRevenueSource(input.payment.appId, input.source, tx);

    const payment = await lockTransactionForUpdate(input.payment.id, tx);

    if (
      !payment
      || payment.action !== "payment"
      || payment.source !== input.source
      || payment.livemode !== input.payment.livemode
    ) {
      throw new AppError(
        "not_found",
        "payment_not_found",
        "Payment not found.",
        404
      );
    }

    const [existing] = await tx
      .select()
      .from(revenueDisputes)
      .where(
        and(
          eq(revenueDisputes.appId, payment.appId),
          eq(revenueDisputes.externalId, input.disputeId),
          eq(revenueDisputes.livemode, payment.livemode)
        )
      )
      .limit(1);

    if (existing) {
      assertDisputeDetailsMatch(existing, input, payment);
      const currentStatus = existing.status as RevenueDisputeStatus;
      const applyStatus = shouldApplyStatus(currentStatus, input.status);

      if (!applyStatus) {
        return {
          dispute_id: existing.externalId,
          payment_transaction_id: existing.paymentTransactionId,
          status: currentStatus,
          commission_entry_id: null,
          livemode: existing.livemode,
          created: false,
          updated: false,
        };
      }

      const commissionEntry = await applyCommissionOutcome(
        {
          disputeRecordId: existing.id,
          disputeId: existing.externalId,
          paymentTransactionId: payment.id,
          status: input.status,
          amount: input.amount,
          livemode: payment.livemode,
          stripeDisputeId: input.stripeDisputeId,
        },
        tx
      );

      await tx
        .update(revenueDisputes)
        .set({
          status: input.status,
          eventDate: input.eventDate,
          updatedAt: new Date(),
        })
        .where(eq(revenueDisputes.id, existing.id));

      return {
        dispute_id: existing.externalId,
        payment_transaction_id: existing.paymentTransactionId,
        status: input.status,
        commission_entry_id: commissionEntry?.id ?? null,
        livemode: existing.livemode,
        created: false,
        updated: true,
      };
    }

    if (input.status === "opened" || input.status === "lost") {
      const [refundedAmount, activeDisputedAmount] = await Promise.all([
        getRefundedAmountForPayment(payment.id, tx),
        getActiveDisputedAmountForPayment(payment.id, tx),
      ]);

      if (
        refundedAmount + activeDisputedAmount + input.amount
        > payment.amount
      ) {
        throw new AppError(
          "invalid_request",
          "invalid_dispute_amount",
          "Dispute amount exceeds the remaining payment balance after refunds and active disputes.",
          400
        );
      }
    }

    const disputeRecordId = generateId(ID_PREFIXES.revenueDispute);
    const [created] = await tx
      .insert(revenueDisputes)
      .values({
        id: disputeRecordId,
        appId: payment.appId,
        paymentTransactionId: payment.id,
        source: input.source,
        externalId: input.disputeId,
        status: input.status,
        amount: input.amount,
        currency: payment.currency,
        livemode: payment.livemode,
        eventDate: input.eventDate,
      })
      .returning();

    const commissionEntry = await applyCommissionOutcome(
      {
        disputeRecordId,
        disputeId: input.disputeId,
        paymentTransactionId: payment.id,
        status: input.status,
        amount: input.amount,
        livemode: payment.livemode,
        stripeDisputeId: input.stripeDisputeId,
      },
      tx
    );

    return {
      dispute_id: created.externalId,
      payment_transaction_id: created.paymentTransactionId,
      status: created.status as RevenueDisputeStatus,
      commission_entry_id: commissionEntry?.id ?? null,
      livemode: created.livemode,
      created: true,
      updated: false,
    };
  });
}
