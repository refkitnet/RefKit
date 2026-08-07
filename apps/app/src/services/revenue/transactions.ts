import { and, eq, inArray, sum } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  revenueDisputes,
  transactions,
  type Transaction,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import type { RevenueSource } from "@/lib/revenue-source";

type CreateTransactionInput = {
  appId: string;
  source: RevenueSource;
  externalId: string;
  parentTransactionId?: string | null;
  stripeConnectionId?: string | null;
  programId: string | null;
  customerId: string | null;
  programAffiliateId: string | null;
  stripeObjectId?: string | null;
  stripeChargeId?: string | null;
  action: string;
  amount: number;
  currency: string;
  livemode: boolean;
  stripeEventId?: string | null;
  transactionDate: Date;
};

function transactionsConflict(
  existing: Transaction,
  input: CreateTransactionInput
) {
  return (
    existing.source !== input.source ||
    existing.amount !== input.amount ||
    existing.currency !== input.currency ||
    existing.livemode !== input.livemode ||
    existing.customerId !== input.customerId ||
    existing.programId !== input.programId ||
    existing.parentTransactionId !== (input.parentTransactionId ?? null)
  );
}

export async function createTransactionRecord(
  input: CreateTransactionInput,
  executor: DbExecutor = getDb()
) {
  const db = executor;
  const existing = await findTransactionIdentityByExternalId(
    {
      appId: input.appId,
      externalId: input.externalId,
      action: input.action,
      livemode: input.livemode,
    },
    db
  );

  if (existing) {
    if (transactionsConflict(existing, input)) {
      throw new AppError(
        "conflict",
        "transaction_id_conflict",
        "This payment id was already used with different details.",
        409
      );
    }

    return { transaction: existing, created: false };
  }

  const transactionId = generateId(ID_PREFIXES.transaction);

  try {
    await db.insert(transactions).values({
      id: transactionId,
      appId: input.appId,
      source: input.source,
      externalId: input.externalId,
      parentTransactionId: input.parentTransactionId ?? null,
      stripeConnectionId: input.stripeConnectionId ?? null,
      programId: input.programId,
      customerId: input.customerId,
      programAffiliateId: input.programAffiliateId,
      stripeObjectId: input.stripeObjectId ?? input.externalId,
      stripeChargeId: input.stripeChargeId ?? null,
      action: input.action,
      amount: input.amount,
      currency: input.currency,
      livemode: input.livemode,
      stripeEventId: input.stripeEventId ?? null,
      transactionDate: input.transactionDate,
    });
  }
  catch (error) {
    if (isUniqueViolation(error)) {
      const existing = await findTransactionIdentityByExternalId(
        {
          appId: input.appId,
          externalId: input.externalId,
          action: input.action,
          livemode: input.livemode,
        },
        db
      );

      if (!existing) {
        throw error;
      }

      if (transactionsConflict(existing, input)) {
        throw new AppError(
          "conflict",
          "transaction_id_conflict",
          "This payment id was already used with different details.",
          409
        );
      }

      return { transaction: existing, created: false };
    }

    throw error;
  }

  const [created] = await db
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .limit(1);

  return { transaction: created ?? null, created: true };
}

export async function findTransactionByExternalId(
  input: {
    appId: string;
    source: RevenueSource;
    externalId: string;
    action: string;
    livemode: boolean;
  },
  executor: DbExecutor = getDb()
) {
  const db = executor;

  const [transaction] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.appId, input.appId),
        eq(transactions.source, input.source),
        eq(transactions.externalId, input.externalId),
        eq(transactions.action, input.action),
        eq(transactions.livemode, input.livemode)
      )
    )
    .limit(1);

  return transaction ?? null;
}

async function findTransactionIdentityByExternalId(
  input: {
    appId: string;
    externalId: string;
    action: string;
    livemode: boolean;
  },
  executor: DbExecutor = getDb()
) {
  const [transaction] = await executor
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.appId, input.appId),
        eq(transactions.externalId, input.externalId),
        eq(transactions.action, input.action),
        eq(transactions.livemode, input.livemode)
      )
    )
    .limit(1);

  return transaction ?? null;
}

export async function findTransactionByChargeId(
  stripeConnectionId: string,
  chargeId: string
) {
  const db = getDb();

  const [transaction] = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.stripeConnectionId, stripeConnectionId),
        eq(transactions.stripeChargeId, chargeId),
        eq(transactions.action, "payment")
      )
    )
    .limit(1);

  return transaction ?? null;
}

export async function lockTransactionForUpdate(
  transactionId: string,
  executor: DbExecutor = getDb()
) {
  const [transaction] = await executor
    .select()
    .from(transactions)
    .where(eq(transactions.id, transactionId))
    .for("update")
    .limit(1);

  return transaction ?? null;
}

export async function getRefundedAmountForPayment(
  paymentTransactionId: string,
  executor: DbExecutor = getDb()
) {
  const db = executor;

  const [row] = await db
    .select({
      total: sum(transactions.amount),
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.parentTransactionId, paymentTransactionId),
        eq(transactions.action, "refund")
      )
    );

  return Math.abs(Number(row?.total ?? 0));
}

export async function getActiveDisputedAmountForPayment(
  paymentTransactionId: string,
  executor: DbExecutor = getDb()
) {
  const [row] = await executor
    .select({ total: sum(revenueDisputes.amount) })
    .from(revenueDisputes)
    .where(
      and(
        eq(revenueDisputes.paymentTransactionId, paymentTransactionId),
        inArray(revenueDisputes.status, ["opened", "lost"])
      )
    );

  return Number(row?.total ?? 0);
}

export async function assertRefundWithinPaymentBalance(
  payment: Transaction,
  refundAmount: number,
  executor: DbExecutor = getDb()
) {
  const [alreadyRefunded, activelyDisputed] = await Promise.all([
    getRefundedAmountForPayment(payment.id, executor),
    getActiveDisputedAmountForPayment(payment.id, executor),
  ]);

  if (alreadyRefunded + activelyDisputed + refundAmount > payment.amount) {
    throw new AppError(
      "invalid_request",
      "refund_exceeds_payment",
      "Refund amount exceeds the remaining payment balance after active disputes.",
      400
    );
  }
}
