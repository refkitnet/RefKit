import { render } from "@react-email/components";
import { AdminAlertEmail } from "@/emails/admin-alert";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  commissionEntries,
  programAffiliates,
  programs,
  referrals,
  stripeConnections,
  stripeEvents,
  transactions,
} from "@/db/schema";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { AppError } from "@/lib/errors";
import { deliverEmail } from "@/services/emails/deliver";
import { resolveAttributionFromMetadata } from "@/services/stripe/attribution";
import {
  createEarnedCommissionEntry,
  createRefundReversalEntry,
  getAppForConnection,
  getEarnedEntryForTransaction,
  getStripeConnectionByAccountId,
  markStripeConnectionDisconnected,
  recordStripeAppAuthorization,
} from "@/services/stripe/connected-accounts";
import { getOrganizationOwnerEmails } from "@/services/organizations";
import { pinTermsOnReferral } from "@/services/programs/terms";
import { getStripeRuntimeMode } from "@/services/stripe/config";
import { hydrateFixturesFromStoredEvent } from "@/services/stripe/fixtures";
import { getStripeFetcher } from "@/services/stripe/fetcher";
import {
  getAppRevenueSource,
  lockAppRevenueSource,
} from "@/services/revenue/guards";
import {
  assertRefundWithinPaymentBalance,
  createTransactionRecord,
  findTransactionByChargeId,
  lockTransactionForUpdate,
} from "@/services/revenue/transactions";
import { emitWebhookEvent } from "@/services/webhooks";
import { flagCrossCurrencyCommissionIssue } from "@/services/revenue/currency-issues";
import { applyRevenueDisputeEvent } from "@/services/revenue/disputes";

type Connection = typeof stripeConnections.$inferSelect;

export const STRIPE_EVENT_STUCK_MS = 5 * 60 * 1000;
const MAX_PROCESSING_ERROR_LENGTH = 2_000;

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as Record<string, unknown>;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

// Stripe references can be plain ids or expanded objects.
function readObjectId(value: unknown): string | null {
  const direct = readString(value);

  if (direct) {
    return direct;
  }

  return readString(asRecord(value).id);
}

function readPromotionCodeId(container: Record<string, unknown>): string | null {
  const discounts = Array.isArray(container.discounts)
    ? container.discounts
    : [];

  for (const discount of discounts) {
    const promotionCode = readObjectId(asRecord(discount).promotion_code);

    if (promotionCode) {
      return promotionCode;
    }
  }

  return null;
}

async function resolveStripeAttribution(input: {
  appId: string;
  metadata: Record<string, unknown>;
  livemode: boolean;
  promotionCodeId?: string | null;
}) {
  const attribution = await resolveAttributionFromMetadata(input);

  if (!attribution) {
    return null;
  }

  const [affiliate] = await getDb()
    .select({ isTest: programAffiliates.isTest })
    .from(programAffiliates)
    .where(eq(programAffiliates.id, attribution.affiliateId))
    .limit(1);

  if (!affiliate || affiliate.isTest !== !input.livemode) {
    console.warn(
      `[refkit:stripe] Ignoring attribution with a mismatched Test/Live Affiliate.`
    );
    return null;
  }

  return attribution;
}

async function getStoredStripeEvent(stripeEventId: string) {
  const db = getDb();

  const [event] = await db
    .select()
    .from(stripeEvents)
    .where(eq(stripeEvents.id, stripeEventId))
    .limit(1);

  return event ?? null;
}

async function markStripeEventProcessed(
  stripeEventId: string,
  processingAttempt: number
) {
  const db = getDb();

  const [event] = await db
    .update(stripeEvents)
    .set({
      processingStatus: "processed",
      processingStartedAt: null,
      lastProcessingError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stripeEvents.id, stripeEventId),
        eq(stripeEvents.processingStatus, "processing"),
        eq(stripeEvents.processingAttempts, processingAttempt)
      )
    )
    .returning();

  return event ?? null;
}

async function markStripeEventFailed(
  stripeEventId: string,
  processingAttempt: number,
  error: unknown
) {
  const message = (error instanceof Error ? error.message : "Unknown Stripe event failure.")
    .slice(0, MAX_PROCESSING_ERROR_LENGTH);

  await getDb()
    .update(stripeEvents)
    .set({
      processingStatus: "failed",
      processingStartedAt: null,
      lastProcessingError: message,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stripeEvents.id, stripeEventId),
        eq(stripeEvents.processingStatus, "processing"),
        eq(stripeEvents.processingAttempts, processingAttempt)
      )
    );
}

export function isStripeEventStuck(
  event: Pick<
    typeof stripeEvents.$inferSelect,
    "processingStatus" | "processingStartedAt" | "updatedAt"
  >,
  now = new Date()
) {
  if (!["pending", "processing"].includes(event.processingStatus)) {
    return false;
  }

  const reference = event.processingStartedAt ?? event.updatedAt;
  return now.getTime() - reference.getTime() >= STRIPE_EVENT_STUCK_MS;
}

async function claimStripeEvent(stripeEventId: string, force: boolean) {
  const staleBefore = new Date(Date.now() - STRIPE_EVENT_STUCK_MS);

  const [event] = await getDb()
    .update(stripeEvents)
    .set({
      processingStatus: "processing",
      processingAttempts: sql`${stripeEvents.processingAttempts} + 1`,
      processingStartedAt: new Date(),
      lastProcessingError: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(stripeEvents.id, stripeEventId),
        sql`(
          ${stripeEvents.processingStatus} in ('pending', 'failed')
          or (
            ${stripeEvents.processingStatus} = 'processing'
            and coalesce(${stripeEvents.processingStartedAt}, ${stripeEvents.updatedAt}) <= ${staleBefore.toISOString()}::timestamptz
          )
          or (${force} and ${stripeEvents.processingStatus} = 'processed')
        )`
      )
    )
    .returning();

  return event ?? null;
}

async function createStripeTransactionRecord(
  input: {
    appId: string;
    stripeConnectionId: string;
    programId: string | null;
    customerId: string | null;
    programAffiliateId: string | null;
    stripeObjectId: string;
    stripeChargeId?: string | null;
    action: string;
    amount: number;
    currency: string;
    livemode: boolean;
    stripeEventId: string;
    transactionDate: Date;
    parentTransactionId?: string | null;
  },
  executor?: Parameters<typeof createTransactionRecord>[1]
) {
  return createTransactionRecord(
    {
      appId: input.appId,
      source: "stripe",
      externalId: input.stripeObjectId,
      parentTransactionId: input.parentTransactionId ?? null,
      stripeConnectionId: input.stripeConnectionId,
      programId: input.programId,
      customerId: input.customerId,
      programAffiliateId: input.programAffiliateId,
      stripeObjectId: input.stripeObjectId,
      stripeChargeId: input.stripeChargeId ?? null,
      action: input.action,
      amount: input.amount,
      currency: input.currency,
      livemode: input.livemode,
      stripeEventId: input.stripeEventId,
      transactionDate: input.transactionDate,
    },
    executor
  );
}

type StripePaymentAttribution = {
  programId: string;
  customerId: string;
  programAffiliateId: string;
  ruleId: string;
};

type StripePaymentInput = {
  appId: string;
  stripeConnectionId: string;
  stripeObjectId: string;
  stripeChargeId?: string | null;
  amount: number;
  currency: string;
  livemode: boolean;
  stripeEventId: string;
  transactionDate: Date;
  eventCreatedAt: Date;
  attribution?: StripePaymentAttribution | null;
};

async function recordStripePayment(input: StripePaymentInput) {
  const db = getDb();
  const attribution = input.attribution ?? null;

  try {
    return await db.transaction(async (tx) => {
      await lockAppRevenueSource(input.appId, "stripe", tx);

      const { transaction, created } = await createStripeTransactionRecord(
        {
          appId: input.appId,
          stripeConnectionId: input.stripeConnectionId,
          programId: attribution?.programId ?? null,
          customerId: attribution?.customerId ?? null,
          programAffiliateId: attribution?.programAffiliateId ?? null,
          stripeObjectId: input.stripeObjectId,
          stripeChargeId: input.stripeChargeId ?? null,
          action: "payment",
          amount: input.amount,
          currency: input.currency,
          livemode: input.livemode,
          stripeEventId: input.stripeEventId,
          transactionDate: input.transactionDate,
        },
        tx
      );

      if (!transaction || !attribution) {
        return;
      }

      if (created) {
        await createEarnedCommissionEntry(
          {
            transactionId: transaction.id,
            programId: attribution.programId,
            programAffiliateId: attribution.programAffiliateId,
            customerId: attribution.customerId,
            ruleId: attribution.ruleId,
            basisAmountMinor: input.amount,
            basisCurrency: input.currency,
            transactionDate: input.transactionDate,
            livemode: input.livemode,
            eventCreatedAt: input.eventCreatedAt,
          },
          tx
        );
      }
    });
  }
  catch (error) {
    if (
      error instanceof AppError
      && error.code === "revenue_source_conflict"
    ) {
      // The App source changed while the provider object was being fetched.
      // Treat the managed event as ignored instead of leaving it retrying.
      return;
    }

    if (
      attribution
      && error instanceof AppError
      && error.code === "cross_currency_unsupported"
    ) {
      const [program] = await db
        .select({ appId: programs.appId, currency: programs.currency })
        .from(programs)
        .where(eq(programs.id, attribution.programId))
        .limit(1);

      if (program?.appId === input.appId) {
        await flagCrossCurrencyCommissionIssue({
          appId: input.appId,
          basisCurrency: input.currency,
          programCurrency: program.currency,
          programId: attribution.programId,
        });
      }
    }

    throw error;
  }
}

// Resolve the charge behind a checkout session so refunds and disputes can be
// keyed back to this transaction.
async function resolveSessionChargeId(
  session: Record<string, unknown>,
  stripeAccountId: string,
  livemode: boolean
) {
  const directCharge = readObjectId(session.charge);

  if (directCharge) {
    return directCharge;
  }

  const paymentIntentId = readObjectId(session.payment_intent);

  if (!paymentIntentId) {
    return null;
  }

  try {
    const fetcher = getStripeFetcher(livemode);
    const paymentIntent = await fetcher.retrievePaymentIntent(
      paymentIntentId,
      stripeAccountId
    );

    return readObjectId(paymentIntent.latest_charge);
  }
  catch {
    return null;
  }
}

async function resolveInvoiceChargeId(
  invoice: Record<string, unknown>,
  invoiceId: string,
  stripeAccountId: string,
  livemode: boolean
) {
  const legacyChargeId = readObjectId(invoice.charge);

  if (legacyChargeId) {
    return legacyChargeId;
  }

  const fetcher = getStripeFetcher(livemode);
  let invoicePayments = await fetcher.listInvoicePayments(
    invoiceId,
    stripeAccountId
  );

  if (invoicePayments.length === 0) {
    const payments = asRecord(invoice.payments);
    invoicePayments = Array.isArray(payments.data)
      ? payments.data.map(asRecord)
      : [];
  }

  const chargeIds = new Set<string>();

  for (const invoicePayment of invoicePayments) {
    if (readString(invoicePayment.status) !== "paid") {
      continue;
    }

    const payment = asRecord(invoicePayment.payment);
    const directChargeId = readObjectId(payment.charge);

    if (directChargeId) {
      chargeIds.add(directChargeId);
      continue;
    }

    const paymentIntentId = readObjectId(payment.payment_intent);

    if (!paymentIntentId) {
      continue;
    }

    const expandedPaymentIntent = asRecord(payment.payment_intent);
    const expandedChargeId = readObjectId(expandedPaymentIntent.latest_charge);

    if (expandedChargeId) {
      chargeIds.add(expandedChargeId);
      continue;
    }

    const paymentIntent = await fetcher.retrievePaymentIntent(
      paymentIntentId,
      stripeAccountId
    );
    const chargeId = readObjectId(paymentIntent.latest_charge);

    if (chargeId) {
      chargeIds.add(chargeId);
    }
  }

  if (chargeIds.size > 1) {
    throw new Error(
      `invoice.paid ${invoiceId} has multiple charges and cannot be linked safely.`
    );
  }

  return [...chargeIds][0] ?? null;
}

async function handleCheckoutSessionCompleted(
  connection: Connection,
  event: Record<string, unknown>,
  storedEventId: string
) {
  const fetcher = getStripeFetcher(connection.livemode);
  const payloadObject = asRecord(asRecord(event.data).object);
  const resolvedSessionId = readString(payloadObject.id);

  if (!resolvedSessionId) {
    throw new Error("checkout.session.completed missing session id.");
  }

  const session = await fetcher.retrieveCheckoutSession(
    resolvedSessionId,
    connection.stripeAccountId
  );

  // Subscription-mode sessions link attribution only; invoices create the
  // transactions (prevents a double commission on the first payment).
  if (readString(session.mode) === "subscription") {
    return;
  }

  const paymentStatus = readString(session.payment_status);
  const amount = Number(session.amount_total ?? 0);
  const isPaid = paymentStatus === "paid";
  // Fully discounted checkouts complete with no_payment_required; they still
  // record a zero-amount transaction (which creates no commission entry).
  const isZeroNoPayment = paymentStatus === "no_payment_required" && amount === 0;

  if (!isPaid && !isZeroNoPayment) {
    return;
  }

  const app = await getAppForConnection(connection);

  if (!app) {
    throw new Error("App not found for Stripe connection.");
  }

  const attribution = await resolveStripeAttribution({
    appId: app.id,
    metadata: asRecord(session.metadata),
    livemode: connection.livemode,
    promotionCodeId: readPromotionCodeId(session),
  });

  let paymentAttribution: StripePaymentAttribution | null = null;

  if (attribution) {
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
      throw new Error("Referral attribution not found.");
    }

    const { rule } = await pinTermsOnReferral({
      referralId: referral.id,
      programId: attribution.programId,
    });

    paymentAttribution = {
      programId: attribution.programId,
      customerId: attribution.customerId,
      programAffiliateId: attribution.affiliateId,
      ruleId: rule.id,
    };
  }

  const currency = readString(session.currency) ?? "usd";
  const transactionDate = new Date(
    Number(session.created ?? event.created) * 1000
  );
  const chargeId = await resolveSessionChargeId(
    session,
    connection.stripeAccountId,
    connection.livemode
  );

  if (amount > 0 && !chargeId) {
    throw new Error(
      `Stripe Checkout payment ${resolvedSessionId} is waiting for its charge.`
    );
  }

  await recordStripePayment({
    appId: app.id,
    stripeConnectionId: connection.id,
    stripeObjectId: resolvedSessionId,
    stripeChargeId: chargeId,
    amount,
    currency,
    livemode: connection.livemode,
    stripeEventId: storedEventId,
    transactionDate,
    eventCreatedAt: new Date(Number(event.created) * 1000),
    attribution: paymentAttribution,
  });
}

// Subscriptions earn from invoice.paid only - first payment and renewals.
async function handleInvoicePaid(
  connection: Connection,
  event: Record<string, unknown>,
  storedEventId: string
) {
  const fetcher = getStripeFetcher(connection.livemode);
  const payloadObject = asRecord(asRecord(event.data).object);
  const invoiceId = readString(payloadObject.id);

  if (!invoiceId) {
    throw new Error("invoice.paid missing invoice id.");
  }

  const invoice = await fetcher.retrieveInvoice(
    invoiceId,
    connection.stripeAccountId
  );

  const app = await getAppForConnection(connection);

  if (!app) {
    throw new Error("App not found for Stripe connection.");
  }

  // Attribution resolution order per PRD: subscription metadata, then Stripe
  // customer metadata, then whatever is on the invoice itself.
  // Newer Stripe invoice shapes nest subscription fields under parent.
  const metadataSources: Record<string, unknown>[] = [];
  const parent = asRecord(invoice.parent);
  const parentSubscriptionDetails = asRecord(parent.subscription_details);
  const subscriptionDetails = {
    ...asRecord(invoice.subscription_details),
    ...parentSubscriptionDetails,
  };

  if (Object.keys(asRecord(subscriptionDetails.metadata)).length > 0) {
    metadataSources.push(asRecord(subscriptionDetails.metadata));
  }

  const subscriptionId =
    readObjectId(invoice.subscription)
    ?? readObjectId(subscriptionDetails.subscription);

  if (subscriptionId) {
    try {
      const subscription = await fetcher.retrieveSubscription(
        subscriptionId,
        connection.stripeAccountId
      );
      metadataSources.push(asRecord(subscription.metadata));
    }
    catch {
      // Subscription not fetchable; continue with other sources.
    }
  }

  const stripeCustomerId = readObjectId(invoice.customer);

  if (stripeCustomerId) {
    try {
      const stripeCustomer = await fetcher.retrieveCustomer(
        stripeCustomerId,
        connection.stripeAccountId
      );
      metadataSources.push(asRecord(stripeCustomer.metadata));
    }
    catch {
      // Customer not fetchable; continue with other sources.
    }
  }

  metadataSources.push(asRecord(invoice.metadata));

  const lines = asRecord(invoice.lines);
  const lineRows = Array.isArray(lines.data) ? lines.data : [];

  for (const lineRow of lineRows) {
    const lineMetadata = asRecord(asRecord(lineRow).metadata);

    if (Object.keys(lineMetadata).length > 0) {
      metadataSources.push(lineMetadata);
    }
  }

  const promotionCodeId = readPromotionCodeId(invoice);
  let attribution = null;

  for (const metadata of metadataSources) {
    attribution = await resolveStripeAttribution({
      appId: app.id,
      metadata,
      livemode: connection.livemode,
      promotionCodeId,
    });

    if (attribution) {
      break;
    }
  }

  let paymentAttribution: StripePaymentAttribution | null = null;

  if (attribution) {
    const dbForReferral = getDb();
    const [referral] = await dbForReferral
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
      throw new Error("Referral attribution not found.");
    }

    const { rule } = await pinTermsOnReferral({
      referralId: referral.id,
      programId: attribution.programId,
    });

    paymentAttribution = {
      programId: attribution.programId,
      customerId: attribution.customerId,
      programAffiliateId: attribution.affiliateId,
      ruleId: rule.id,
    };
  }
  else {
    console.warn(
      `[refkit:stripe] invoice.paid ${invoiceId} recorded without attribution.`
    );
  }

  // Commission basis is the amount actually paid; proration credits and
  // customer balance offsets never inflate it. Zero-amount invoices still
  // create a transaction so setup can detect a received payment.
  const amount = Number(invoice.amount_paid ?? 0);
  const currency = readString(invoice.currency) ?? "usd";
  const transactionDate = new Date(
    Number(invoice.created ?? event.created) * 1000
  );
  const chargeId = amount > 0
    ? await resolveInvoiceChargeId(
        invoice,
        invoiceId,
        connection.stripeAccountId,
        connection.livemode
      )
    : null;

  await recordStripePayment({
    appId: app.id,
    stripeConnectionId: connection.id,
    stripeObjectId: invoiceId,
    stripeChargeId: chargeId,
    amount,
    currency,
    livemode: connection.livemode,
    stripeEventId: storedEventId,
    transactionDate,
    eventCreatedAt: new Date(Number(event.created) * 1000),
    attribution: paymentAttribution,
  });
}

async function findPaymentForCharge(
  connection: Connection,
  charge: Record<string, unknown>
) {
  const chargeId = readString(charge.id);

  if (!chargeId) {
    return null;
  }

  return findTransactionByChargeId(connection.id, chargeId);
}

async function handleChargeRefunded(
  connection: Connection,
  event: Record<string, unknown>,
  storedEventId: string
) {
  const fetcher = getStripeFetcher(connection.livemode);
  const chargeObject = asRecord(asRecord(event.data).object);
  const chargeId = readString(chargeObject.id);

  if (!chargeId) {
    throw new Error("charge.refunded missing charge id.");
  }

  const charge = await fetcher.retrieveCharge(
    chargeId,
    connection.stripeAccountId
  );
  const payment = await findPaymentForCharge(connection, charge);

  if (!payment) {
    throw new Error(
      `Stripe refund for charge ${chargeId} is waiting for its parent payment transaction.`
    );
  }

  const refundRows = await fetcher.listRefundsForCharge(
    chargeId,
    connection.stripeAccountId
  );

  try {
    await getDb().transaction(async (tx) => {
      await lockAppRevenueSource(payment.appId, "stripe", tx);

      const lockedPayment = await lockTransactionForUpdate(payment.id, tx);

      if (!lockedPayment) {
        throw new Error(
          `Stripe refund for charge ${chargeId} is waiting for its parent payment transaction.`
        );
      }

      const earnedEntry = await getEarnedEntryForTransaction(
        lockedPayment.id,
        tx
      );

      for (const refundRow of refundRows) {
        const refund = asRecord(refundRow);
        const refundId = readString(refund.id);
        const refundAmount = Number(refund.amount ?? 0);

        if (!refundId || refundAmount <= 0) {
          continue;
        }

        const { created } = await createStripeTransactionRecord(
          {
            appId: lockedPayment.appId,
            stripeConnectionId: connection.id,
            programId: lockedPayment.programId,
            customerId: lockedPayment.customerId,
            programAffiliateId: lockedPayment.programAffiliateId,
            stripeObjectId: refundId,
            stripeChargeId: chargeId,
            action: "refund",
            amount: -refundAmount,
            currency: lockedPayment.currency,
            livemode: lockedPayment.livemode,
            stripeEventId: storedEventId,
            transactionDate: new Date(
              Number(refund.created ?? event.created) * 1000
            ),
            parentTransactionId: lockedPayment.id,
          },
          tx
        );

        if (created) {
          await assertRefundWithinPaymentBalance(lockedPayment, 0, tx);
        }

        if (created && earnedEntry) {
          await createRefundReversalEntry(
            {
              earnedEntryId: earnedEntry.id,
              refundAmountMinor: refundAmount,
              stripeRefundId: refundId,
              livemode: lockedPayment.livemode,
            },
            tx
          );
        }
      }
    });
  }
  catch (error) {
    if (
      error instanceof AppError
      && error.code === "revenue_source_conflict"
    ) {
      return;
    }

    throw error;
  }
}

async function resolveDisputeContext(
  connection: Connection,
  event: Record<string, unknown>
) {
  const fetcher = getStripeFetcher(connection.livemode);
  const disputeObject = asRecord(asRecord(event.data).object);
  const disputeId = readString(disputeObject.id);

  if (!disputeId) {
    throw new Error("Dispute event missing dispute id.");
  }

  const dispute = await fetcher.retrieveDispute(
    disputeId,
    connection.stripeAccountId
  );
  const chargeId = readObjectId(dispute.charge);

  if (!chargeId) {
    return { disputeId, dispute, payment: null };
  }

  let charge: Record<string, unknown> = { id: chargeId };

  try {
    charge = await fetcher.retrieveCharge(chargeId, connection.stripeAccountId);
  }
  catch {
    // Charge not fetchable; charge-id matching still works.
  }

  const payment = await findPaymentForCharge(connection, charge);

  return { disputeId, dispute, payment };
}

async function handleChargeDisputeCreated(
  connection: Connection,
  event: Record<string, unknown>
) {
  const { disputeId, dispute, payment } = await resolveDisputeContext(
    connection,
    event
  );

  if (!payment) {
    throw new Error(
      `Stripe dispute ${disputeId} is waiting for its parent payment transaction.`
    );
  }

  await applyRevenueDisputeEvent({
    payment,
    source: "stripe",
    disputeId,
    status: "opened",
    amount: Number(dispute.amount ?? 0),
    eventDate: new Date(Number(dispute.created ?? event.created) * 1000),
    stripeDisputeId: disputeId,
  });
}

async function handleChargeDisputeClosed(
  connection: Connection,
  event: Record<string, unknown>
) {
  const { disputeId, dispute, payment } = await resolveDisputeContext(
    connection,
    event
  );

  if (!payment) {
    throw new Error(
      `Stripe dispute ${disputeId} is waiting for its parent payment transaction.`
    );
  }

  const disputeStatus = readString(dispute.status);

  const normalizedStatus = disputeStatus === "warning_closed"
    ? "withdrawn"
    : disputeStatus;

  if (
    normalizedStatus !== "lost"
    && normalizedStatus !== "won"
    && normalizedStatus !== "withdrawn"
  ) {
    return;
  }

  await applyRevenueDisputeEvent({
    payment,
    source: "stripe",
    disputeId,
    status: normalizedStatus,
    amount: Number(dispute.amount ?? 0),
    eventDate: new Date(Number(dispute.created ?? event.created) * 1000),
    stripeDisputeId: disputeId,
  });
}

async function handleChargeDisputeFundsReinstated(
  connection: Connection,
  event: Record<string, unknown>
) {
  const { disputeId, dispute, payment } = await resolveDisputeContext(
    connection,
    event
  );

  if (!payment) {
    throw new Error(
      `Stripe dispute ${disputeId} is waiting for its parent payment transaction.`
    );
  }

  await applyRevenueDisputeEvent({
    payment,
    source: "stripe",
    disputeId,
    status: "funds_reinstated",
    amount: Number(dispute.amount ?? 0),
    eventDate: new Date(Number(dispute.created ?? event.created) * 1000),
    stripeDisputeId: disputeId,
  });
}

async function handleAccountDeauthorized(connection: Connection) {
  await markStripeConnectionDisconnected(connection);

  const app = await getAppForConnection(connection);

  if (!app) {
    return;
  }

  const ownerEmails = await getOrganizationOwnerEmails(app.organizationId);
  const adminEmails = (process.env.ADMIN_ALERT_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  const recipients = [...new Set([...ownerEmails, ...adminEmails])];

  const message = `The Stripe connection for app ${app.name} (${app.id}) was disconnected. Commission tracking is paused until it is reconnected.`;

  for (const to of recipients) {
    const html = await render(
      AdminAlertEmail({
        preview: "Stripe connection issue",
        message,
      })
    );

    await deliverEmail({
      template: "admin-alert",
      to,
      subject: "Stripe connection issue",
      html,
    });
  }
}

async function processClaimedStripeEvent(
  storedEvent: typeof stripeEvents.$inferSelect
) {
  const connection = await getDb()
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.id, storedEvent.stripeConnectionId))
    .limit(1)
    .then((rows) => rows[0]);

  if (!connection || connection.status === "disconnected") {
    return;
  }

  if (connection.livemode !== storedEvent.livemode) {
    throw new Error(
      "Stored Stripe event mode does not match its connection mode."
    );
  }

  const revenueSource = await getAppRevenueSource(connection.appId);

  if (revenueSource !== "stripe") {
    return;
  }

  const event = storedEvent.payload as Record<string, unknown>;
  const eventType = readString(event.type);

  if (getStripeRuntimeMode() === "fixture") {
    hydrateFixturesFromStoredEvent(connection.stripeAccountId, event);
  }

  if (
    eventType === "checkout.session.completed" ||
    eventType === "checkout.session.async_payment_succeeded"
  ) {
    await handleCheckoutSessionCompleted(connection, event, storedEvent.id);
  }
  else if (eventType === "invoice.paid") {
    await handleInvoicePaid(connection, event, storedEvent.id);
  }
  else if (eventType === "charge.refunded") {
    await handleChargeRefunded(connection, event, storedEvent.id);
  }
  else if (eventType === "charge.dispute.created") {
    await handleChargeDisputeCreated(connection, event);
  }
  else if (eventType === "charge.dispute.closed") {
    await handleChargeDisputeClosed(connection, event);
  }
  else if (eventType === "charge.dispute.funds_reinstated") {
    await handleChargeDisputeFundsReinstated(connection, event);
  }
  else if (eventType === "account.application.deauthorized") {
    await handleAccountDeauthorized(connection);
  }
  else if (eventType === "account.application.authorized") {
    if (connection.status !== "connected") {
      const db = getDb();
      await db
        .update(stripeConnections)
        .set({ status: "connected" })
        .where(eq(stripeConnections.id, connection.id));
    }
  }

}

async function emitProcessedStripeDomainEvents(stripeEventId: string) {
  const db = getDb();
  const transactionRows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.stripeEventId, stripeEventId));

  if (transactionRows.length === 0) {
    return;
  }

  const paymentIds = transactionRows
    .filter((transaction) => transaction.action === "payment")
    .map((transaction) => transaction.id);
  const refundIds = transactionRows
    .filter((transaction) => transaction.action === "refund")
    .map((transaction) => transaction.externalId);
  const commissionRows = [
    ...(paymentIds.length > 0
      ? await db
          .select()
          .from(commissionEntries)
          .where(inArray(commissionEntries.transactionId, paymentIds))
      : []),
    ...(refundIds.length > 0
      ? await db
          .select()
          .from(commissionEntries)
          .where(inArray(commissionEntries.stripeRefundId, refundIds))
      : []),
  ];

  await Promise.all([
    ...transactionRows.map((transaction) =>
      emitWebhookEvent({
        appId: transaction.appId,
        eventType:
          transaction.action === "refund"
            ? "transaction.refunded"
            : "transaction.created",
        livemode: transaction.livemode,
        data: {
          id: transaction.id,
          parent_transaction_id: transaction.parentTransactionId,
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
      })
    ),
    ...commissionRows.map((entry) => {
      const appId = transactionRows.find(
        (transaction) =>
          transaction.id === entry.transactionId
          || transaction.externalId === entry.stripeRefundId
      )?.appId;

      if (!appId) {
        return Promise.resolve(null);
      }

      return emitWebhookEvent({
        appId,
        eventType:
          entry.kind === "earned"
            ? "commission.created"
            : "commission.reversed",
        livemode: entry.livemode,
        data: {
          id: entry.id,
          program_id: entry.programId,
          program_affiliate_id: entry.programAffiliateId,
          transaction_id: entry.transactionId,
          kind: entry.kind,
          amount: { amount: entry.amount, currency: entry.currency },
          status: entry.status,
          created_at: entry.createdAt.toISOString(),
        },
      });
    }),
  ]);
}

export async function processStoredStripeEvent(
  stripeEventId: string,
  options: { force?: boolean } = {}
) {
  const claimedEvent = await claimStripeEvent(
    stripeEventId,
    options.force ?? false
  );

  if (!claimedEvent) {
    const existing = await getStoredStripeEvent(stripeEventId);

    if (!existing) {
      console.warn(
        `[refkit:stripe] Stored Stripe event ${stripeEventId} not found; skipping.`
      );
    }

    if (existing?.processingStatus === "processed") {
      return existing;
    }

    throw new Error("Stripe event is already being processed by another request.");
  }

  try {
    await processClaimedStripeEvent(claimedEvent);
    const processed = await markStripeEventProcessed(
      claimedEvent.id,
      claimedEvent.processingAttempts
    );

    if (!processed) {
      throw new Error("Stripe event processing claim was superseded.");
    }

    if (claimedEvent.processingAttempts === 1) {
      await emitProcessedStripeDomainEvents(claimedEvent.id);
    }

    return processed;
  }
  catch (error) {
    await markStripeEventFailed(
      claimedEvent.id,
      claimedEvent.processingAttempts,
      error
    );
    throw error;
  }
}

export async function ingestStripeEvent(input: {
  stripeAccountId: string;
  event: Record<string, unknown>;
}) {
  const eventType = readString(input.event.type);
  const eventLivemode = Boolean(input.event.livemode);
  let connection = await getStripeConnectionByAccountId(input.stripeAccountId);

  if (eventType === "account.application.authorized") {
    const result = await recordStripeAppAuthorization({
      stripeAccountId: input.stripeAccountId,
      livemode: eventLivemode,
    });

    if (result.connection) {
      connection = result.connection;
    }
    else {
      console.info(
        `[refkit:stripe] Authorization for ${input.stripeAccountId} stored; waiting for RefKit claim.`
      );
      return null;
    }
  }

  // Events for accounts we do not know (deleted connections, other platform
  // environments) are acknowledged and skipped - a thrown error would make
  // Stripe retry the webhook forever.
  if (!connection) {
    console.warn(
      `[refkit:stripe] Ignoring event for unknown Stripe account ${input.stripeAccountId}.`
    );
    return null;
  }

  if (connection.livemode !== eventLivemode) {
    console.warn(
      `[refkit:stripe] Ignoring ${eventType ?? "unknown"} mode mismatch for ${input.stripeAccountId}.`
    );
    return null;
  }

  const db = getDb();
  const stripeEventId = readString(input.event.id);

  if (!stripeEventId) {
    throw new Error("Stripe event id is required.");
  }

  const internalEventId = generateId(ID_PREFIXES.stripeEvent);
  const [inserted] = await db
    .insert(stripeEvents)
    .values({
      id: internalEventId,
      stripeConnectionId: connection.id,
      stripeEventId,
      eventType: eventType ?? "unknown",
      livemode: eventLivemode,
      payload: input.event,
      processingStatus: "pending",
    })
    .onConflictDoNothing({
      target: [stripeEvents.stripeConnectionId, stripeEvents.stripeEventId],
    })
    .returning();

  if (inserted) {
    return inserted;
  }

  const [existing] = await db
    .select()
    .from(stripeEvents)
    .where(
      and(
        eq(stripeEvents.stripeConnectionId, connection.id),
        eq(stripeEvents.stripeEventId, stripeEventId)
      )
    )
    .limit(1);

  if (!existing) {
    throw new Error("Stored Stripe event was not found after conflict.");
  }

  return existing;
}

export async function receiveVerifiedStripeWebhook(
  event: Record<string, unknown>
) {
  const stripeAccountId =
    readString(event.account) ??
    (process.env.NODE_ENV !== "production"
      ? process.env.STRIPE_DIRECT_ACCOUNT_ID
      : undefined);

  if (!stripeAccountId) {
    throw new Error("Stripe webhook event missing connected account field.");
  }

  const storedEvent = await ingestStripeEvent({
    stripeAccountId,
    event,
  });

  if (!storedEvent) {
    return null;
  }

  return processStoredStripeEvent(storedEvent.id);
}
