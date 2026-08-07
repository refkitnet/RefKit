import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  commissionEntries,
  customers,
  programAffiliates,
  programs,
  transactions,
} from "@/db/schema";
import { AppKeyAuthContext } from "@/lib/auth-context";
import { AppError } from "@/lib/errors";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAppInOrganization } from "@/services/apps";
import { pinTermsOnReferral } from "@/services/programs/terms";
import { referrals } from "@/db/schema";
import { resolveAttributionFromCustomer } from "@/services/revenue/attribution";
import {
  createEarnedCommissionEntry,
  createRefundReversalEntry,
  getCommissionEntryBySourceEventId,
  getEarnedEntryForTransaction,
} from "@/services/revenue/commission-ledger";
import {
  assertAppRevenueSource,
  deriveLivemodeFromAppKey,
  lockAppRevenueSource,
} from "@/services/revenue/guards";
import {
  assertRefundWithinPaymentBalance,
  createTransactionRecord,
  findTransactionByExternalId,
  lockTransactionForUpdate,
} from "@/services/revenue/transactions";
import { emitWebhookEvent } from "@/services/webhooks";
import { flagCrossCurrencyCommissionIssue } from "@/services/revenue/currency-issues";
import {
  applyRevenueDisputeEvent,
  type ApplyRevenueDisputeResult,
  type RevenueDisputeStatus,
} from "@/services/revenue/disputes";

type ReportPaymentInput = {
  paymentId: string;
  customerId: string;
  programId: string;
  amount: number;
  currency: string;
  paidAt?: Date;
};

type ReportRefundInput = {
  refundId: string;
  paymentId: string;
  amount: number;
  refundedAt?: Date;
};

type ReportDisputeInput = {
  disputeId: string;
  paymentId: string;
  status: RevenueDisputeStatus;
  amount: number;
  occurredAt?: Date;
};

export type ReportPaymentResult = {
  transaction_id: string;
  commission_entry_id: string | null;
  attributed: boolean;
  livemode: boolean;
  created: boolean;
};

export type ReportRefundResult = {
  transaction_id: string;
  commission_entry_id: string | null;
  livemode: boolean;
  created: boolean;
};

export function apiRefundSourceEventId(
  appId: string,
  refundId: string,
  livemode: boolean
) {
  return `${appId}:api:${livemode ? "live" : "test"}:${refundId}`;
}

async function resolveAppScope(
  auth: AppKeyAuthContext,
  customerId: string,
  programId: string
) {
  const db = getDb();

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!customer) {
    throw new AppError(
      "not_found",
      "customer_not_found",
      "Customer not found.",
      404
    );
  }

  const [program] = await db
    .select()
    .from(programs)
    .where(
      and(eq(programs.id, programId), eq(programs.appId, customer.appId))
    )
    .limit(1);

  if (!program) {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }

  if (auth.appId) {
    if (customer.appId !== auth.appId) {
      throw new AppError(
        "not_found",
        "customer_not_found",
        "Customer not found.",
        404
      );
    }
  }
  else {
    if (!auth.userId) {
      throw new AppError(
        "unauthorized",
        "invalid_api_key",
        "Invalid API key.",
        401
      );
    }

    await requireAppInOrganization(
      auth.userId,
      auth.organizationId,
      customer.appId
    );
  }

  return {
    appId: customer.appId,
    customer,
    program,
  };
}

async function findApiPaymentForAuth(
  auth: AppKeyAuthContext,
  paymentId: string
) {
  if (!auth.appId) {
    throw new AppError(
      "invalid_request",
      "app_scope_required",
      "Refunds and disputes require an app-scoped API key.",
      400
    );
  }

  return findTransactionByExternalId({
    appId: auth.appId,
    source: "api",
    externalId: paymentId,
    action: "payment",
    livemode: deriveLivemodeFromAppKey(auth),
  });
}

function assertRefundReplayMatches(
  existing: { amount: number; parentTransactionId: string | null },
  requestedAmount: number,
  paymentTransactionId: string
) {
  if (
    Math.abs(existing.amount) !== requestedAmount
    || existing.parentTransactionId !== paymentTransactionId
  ) {
    throw new AppError(
      "conflict",
      "transaction_id_conflict",
      "This refund id was already used with different details.",
      409
    );
  }
}

async function assertAttributionMatchesAppKeyMode(
  auth: AppKeyAuthContext,
  programAffiliateId: string
) {
  const [affiliate] = await getDb()
    .select({ isTest: programAffiliates.isTest })
    .from(programAffiliates)
    .where(eq(programAffiliates.id, programAffiliateId))
    .limit(1);

  if (!affiliate || affiliate.isTest !== auth.testMode) {
    throw new AppError(
      "invalid_request",
      "affiliate_mode_mismatch",
      "Payment mode does not match the attributed Affiliate.",
      400
    );
  }
}

function assertPaymentMatchesAppKeyMode(
  auth: AppKeyAuthContext,
  payment: { livemode: boolean }
) {
  if (payment.livemode !== deriveLivemodeFromAppKey(auth)) {
    // Treat a record in the other mode as absent. This keeps test keys fully
    // isolated from live money (and vice versa) without exposing that it exists.
    throw new AppError(
      "not_found",
      "payment_not_found",
      "Payment not found.",
      404
    );
  }
}

export async function reportPayment(
  auth: AppKeyAuthContext,
  input: ReportPaymentInput
): Promise<ReportPaymentResult> {
  await checkRateLimit(`report-payment:${auth.keyId}`, 120);

  const { appId, program } = await resolveAppScope(
    auth,
    input.customerId,
    input.programId
  );

  await assertAppRevenueSource(appId, "api");

  const livemode = deriveLivemodeFromAppKey(auth);
  const transactionDate = input.paidAt ?? new Date();
  const currency = input.currency.trim().toLowerCase();

  if (input.amount < 0) {
    throw new AppError(
      "invalid_request",
      "invalid_amount",
      "Amount cannot be negative.",
      400
    );
  }

  if (currency !== program.currency.toLowerCase()) {
    await flagCrossCurrencyCommissionIssue({
      appId,
      basisCurrency: currency,
      programCurrency: program.currency,
      programId: program.id,
    });
    throw new AppError(
      "invalid_request",
      "cross_currency_unsupported",
      "Revenue currency must match the Program currency.",
      400
    );
  }

  const attribution = await resolveAttributionFromCustomer({
    appId,
    customerId: input.customerId,
    programId: input.programId,
  });

  if (attribution) {
    await assertAttributionMatchesAppKeyMode(auth, attribution.affiliateId);
  }

  let rule = null;

  if (attribution && input.amount > 0) {
    const db = getDb();
    const [referral] = await db
      .select()
      .from(referrals)
      .where(
        and(
          eq(referrals.customerId, attribution.customerId),
          eq(referrals.programId, attribution.programId)
        )
      )
      .limit(1);

    if (!referral) {
      throw new AppError(
        "internal",
        "referral_not_found",
        "Referral attribution is missing.",
        500
      );
    }

    // Use the exact rule pinned to the referral, not a default read before
    // terms pinning. This keeps a payment on the version in force at
    // attribution even if terms are published concurrently.
    const pinned = await pinTermsOnReferral({
      referralId: referral.id,
      programId: attribution.programId,
    });
    rule = pinned.rule;
  }

  const db = getDb();

  // A payment and its earned commission are one accounting operation. A
  // commission failure must roll the payment back instead of leaving an orphan
  // that subsequent idempotent reports cannot safely distinguish from success.
  let result: ReportPaymentResult;

  try {
    result = await db.transaction(async (tx) => {
      await lockAppRevenueSource(appId, "api", tx);

      const { transaction, created } = await createTransactionRecord(
        {
          appId,
          source: "api",
          externalId: input.paymentId,
          programId: attribution?.programId ?? input.programId,
          customerId: input.customerId,
          programAffiliateId: attribution?.affiliateId ?? null,
          action: "payment",
          amount: input.amount,
          currency,
          livemode,
          transactionDate,
        },
        tx
      );

      if (!transaction) {
        throw new AppError(
          "internal",
          "transaction_create_failed",
          "Failed to create transaction.",
          500
        );
      }

      let commissionEntryId: string | null = null;

      if (!created) {
        const earnedEntry = await getEarnedEntryForTransaction(
          transaction.id,
          tx
        );
        commissionEntryId = earnedEntry?.id ?? null;
      }
      else if (attribution && rule) {
        const commissionEntry = await createEarnedCommissionEntry(
          {
            transactionId: transaction.id,
            programId: attribution.programId,
            programAffiliateId: attribution.affiliateId,
            customerId: attribution.customerId,
            ruleId: rule.id,
            basisAmountMinor: input.amount,
            basisCurrency: currency,
            transactionDate,
            livemode: transaction.livemode,
            eventCreatedAt: transactionDate,
          },
          tx
        );

        commissionEntryId = commissionEntry?.id ?? null;
      }

      return {
        transaction_id: transaction.id,
        commission_entry_id: commissionEntryId,
        attributed: Boolean(transaction.programAffiliateId),
        livemode: transaction.livemode,
        created,
      };
    });
  }
  catch (error) {
    if (
      error instanceof AppError
      && error.code === "cross_currency_unsupported"
    ) {
      await flagCrossCurrencyCommissionIssue({
        appId,
        basisCurrency: currency,
        programCurrency: program.currency,
        programId: program.id,
      });
    }

    throw error;
  }

  if (result.created) {
    const [transaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, result.transaction_id))
      .limit(1);
    const [commissionEntry] = result.commission_entry_id
      ? await db
          .select()
          .from(commissionEntries)
          .where(eq(commissionEntries.id, result.commission_entry_id))
          .limit(1)
      : [];

    await Promise.all([
      ...(transaction
        ? [
            emitWebhookEvent({
              appId,
              eventType: "transaction.created",
              livemode: transaction.livemode,
              data: {
                id: transaction.id,
                program_id: transaction.programId,
                customer_id: transaction.customerId,
                program_affiliate_id: transaction.programAffiliateId,
                action: transaction.action,
                amount: {
                  amount: transaction.amount,
                  currency: transaction.currency,
                },
                created_at: transaction.createdAt.toISOString(),
              },
            }),
          ]
        : []),
      ...(commissionEntry
        ? [
            emitWebhookEvent({
              appId,
              eventType: "commission.created",
              livemode: commissionEntry.livemode,
              data: {
                id: commissionEntry.id,
                program_id: commissionEntry.programId,
                program_affiliate_id: commissionEntry.programAffiliateId,
                transaction_id: commissionEntry.transactionId,
                kind: commissionEntry.kind,
                amount: {
                  amount: commissionEntry.amount,
                  currency: commissionEntry.currency,
                },
                status: commissionEntry.status,
                created_at: commissionEntry.createdAt.toISOString(),
              },
            }),
          ]
        : []),
    ]);
  }

  return result;
}

export async function reportRefund(
  auth: AppKeyAuthContext,
  input: ReportRefundInput
): Promise<ReportRefundResult> {
  await checkRateLimit(`report-refund:${auth.keyId}`, 120);

  const payment = await findApiPaymentForAuth(auth, input.paymentId);

  if (!payment) {
    throw new AppError(
      "not_found",
      "payment_not_found",
      "Payment not found.",
      404
    );
  }

  assertPaymentMatchesAppKeyMode(auth, payment);

  await assertAppRevenueSource(payment.appId, "api");

  if (input.amount <= 0) {
    throw new AppError(
      "invalid_request",
      "invalid_amount",
      "Refund amount must be greater than zero.",
      400
    );
  }

  const transactionDate = input.refundedAt ?? new Date();
  const scopedSourceEventId = apiRefundSourceEventId(
    payment.appId,
    input.refundId,
    payment.livemode
  );
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    await lockAppRevenueSource(payment.appId, "api", tx);

    const lockedPayment = await lockTransactionForUpdate(payment.id, tx);

    if (!lockedPayment) {
      throw new AppError(
        "not_found",
        "payment_not_found",
        "Payment not found.",
        404
      );
    }

    assertPaymentMatchesAppKeyMode(auth, lockedPayment);

    const existingRefund = await findTransactionByExternalId(
      {
        appId: lockedPayment.appId,
        source: "api",
        externalId: input.refundId,
        action: "refund",
        livemode: lockedPayment.livemode,
      },
      tx
    );

    if (existingRefund) {
      assertRefundReplayMatches(
        existingRefund,
        input.amount,
        lockedPayment.id
      );

      const existingEntry = await getCommissionEntryBySourceEventId(
        scopedSourceEventId,
        tx
      );

      return {
        transaction_id: existingRefund.id,
        commission_entry_id: existingEntry?.id ?? null,
        livemode: existingRefund.livemode,
        created: false,
      };
    }

    await assertRefundWithinPaymentBalance(lockedPayment, input.amount, tx);

    const earnedEntry = await getEarnedEntryForTransaction(
      lockedPayment.id,
      tx
    );

    const { transaction, created } = await createTransactionRecord(
      {
        appId: lockedPayment.appId,
        source: "api",
        externalId: input.refundId,
        parentTransactionId: lockedPayment.id,
        programId: lockedPayment.programId,
        customerId: lockedPayment.customerId,
        programAffiliateId: lockedPayment.programAffiliateId,
        action: "refund",
        amount: -input.amount,
        currency: lockedPayment.currency,
        livemode: lockedPayment.livemode,
        transactionDate,
      },
      tx
    );

    if (!transaction) {
      throw new AppError(
        "internal",
        "transaction_create_failed",
        "Failed to create refund transaction.",
        500
      );
    }

    let commissionEntryId: string | null = null;

    if (created && earnedEntry) {
      const commissionEntry = await createRefundReversalEntry(
        {
          earnedEntryId: earnedEntry.id,
          refundAmountMinor: input.amount,
          sourceEventId: scopedSourceEventId,
          livemode: lockedPayment.livemode,
        },
        tx
      );

      commissionEntryId = commissionEntry?.id ?? null;
    }

    return {
      transaction_id: transaction.id,
      commission_entry_id: commissionEntryId,
      livemode: transaction.livemode,
      created,
    };
  });

  if (result.created) {
    const [refundTransaction] = await db
      .select()
      .from(transactions)
      .where(eq(transactions.id, result.transaction_id))
      .limit(1);
    const [commissionEntry] = result.commission_entry_id
      ? await db
          .select()
          .from(commissionEntries)
          .where(eq(commissionEntries.id, result.commission_entry_id))
          .limit(1)
      : [];

    await Promise.all([
      ...(refundTransaction
        ? [
            emitWebhookEvent({
              appId: payment.appId,
              eventType: "transaction.refunded",
              livemode: refundTransaction.livemode,
              data: {
                id: refundTransaction.id,
                parent_transaction_id: refundTransaction.parentTransactionId,
                program_id: refundTransaction.programId,
                customer_id: refundTransaction.customerId,
                program_affiliate_id: refundTransaction.programAffiliateId,
                action: refundTransaction.action,
                amount: {
                  amount: refundTransaction.amount,
                  currency: refundTransaction.currency,
                },
                created_at: refundTransaction.createdAt.toISOString(),
              },
            }),
          ]
        : []),
      ...(commissionEntry
        ? [
            emitWebhookEvent({
              appId: payment.appId,
              eventType: "commission.reversed",
              livemode: commissionEntry.livemode,
              data: {
                id: commissionEntry.id,
                program_id: commissionEntry.programId,
                program_affiliate_id: commissionEntry.programAffiliateId,
                transaction_id: commissionEntry.transactionId,
                kind: commissionEntry.kind,
                amount: {
                  amount: commissionEntry.amount,
                  currency: commissionEntry.currency,
                },
                status: commissionEntry.status,
                created_at: commissionEntry.createdAt.toISOString(),
              },
            }),
          ]
        : []),
    ]);
  }

  return result;
}

export async function reportDispute(
  auth: AppKeyAuthContext,
  input: ReportDisputeInput
): Promise<ApplyRevenueDisputeResult> {
  await checkRateLimit(`report-dispute:${auth.keyId}`, 120);

  const payment = await findApiPaymentForAuth(auth, input.paymentId);

  if (!payment) {
    throw new AppError(
      "not_found",
      "payment_not_found",
      "Payment not found.",
      404
    );
  }

  assertPaymentMatchesAppKeyMode(auth, payment);
  await assertAppRevenueSource(payment.appId, "api");

  return applyRevenueDisputeEvent({
    payment,
    source: "api",
    disputeId: input.disputeId,
    status: input.status,
    amount: input.amount,
    eventDate: input.occurredAt ?? new Date(),
  });
}

export function serializeReportPaymentResult(result: ReportPaymentResult) {
  return result;
}

export function serializeReportRefundResult(result: ReportRefundResult) {
  return result;
}

export function serializeReportDisputeResult(
  result: ApplyRevenueDisputeResult
) {
  return result;
}
