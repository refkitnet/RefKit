import { and, eq, inArray } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  affiliatePayoutDetails,
  programs,
  payoutItems,
  payoutRequests,
  payoutBatches,
} from "@/db/schema";
import {
  decryptPayoutDetails,
  encryptPayoutDetails,
} from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { validatePayoutDetailsSoft } from "@/services/payouts/validation";
import type {
  PayoutDetailsPayload,
  PayoutMethod,
} from "@/services/payouts/types";

export async function getPayoutDetailsProgram(programId: string) {
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

export async function saveAffiliatePayoutDetails(
  programAffiliateId: string,
  method: PayoutMethod,
  details: Record<string, unknown>,
  currency = "usd"
) {
  const locked = await isPayoutDetailsLocked(programAffiliateId);

  if (locked) {
    throw new AppError(
      "invalid_request",
      "payout_details_locked",
      "Payout details cannot be changed while a payout request is open or a payout batch is unpaid.",
      400
    );
  }

  const warnings = validatePayoutDetailsSoft(method, details);
  const db = getDb();
  const encrypted = encryptPayoutDetails(JSON.stringify(details));

  const [existing] = await db
    .select()
    .from(affiliatePayoutDetails)
    .where(
      and(
        eq(affiliatePayoutDetails.programAffiliateId, programAffiliateId),
        eq(affiliatePayoutDetails.method, method),
        eq(affiliatePayoutDetails.currency, currency.toLowerCase())
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(affiliatePayoutDetails)
      .set({
        detailsEncrypted: encrypted,
        updatedAt: new Date(),
      })
      .where(eq(affiliatePayoutDetails.id, existing.id));
  }
  else {
    await db.insert(affiliatePayoutDetails).values({
      id: generateId(ID_PREFIXES.payoutDetails),
      programAffiliateId,
      method,
      currency: currency.toLowerCase(),
      detailsEncrypted: encrypted,
    });
  }

  return {
    method,
    details,
    warnings,
  };
}

export async function getAffiliatePayoutDetails(
  programAffiliateId: string,
  method: PayoutMethod,
  currency = "usd"
): Promise<PayoutDetailsPayload | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(affiliatePayoutDetails)
    .where(
      and(
        eq(affiliatePayoutDetails.programAffiliateId, programAffiliateId),
        eq(affiliatePayoutDetails.method, method),
        eq(affiliatePayoutDetails.currency, currency.toLowerCase())
      )
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return JSON.parse(decryptPayoutDetails(row.detailsEncrypted));
}

export async function getAffiliatePayoutDetailsForMethods(
  programAffiliateId: string,
  methods: string[],
  currency: string,
  executor: DbExecutor = getDb()
) {
  if (methods.length === 0) {
    return [];
  }

  const db = executor;

  const rows = await db
    .select()
    .from(affiliatePayoutDetails)
    .where(
      and(
        eq(affiliatePayoutDetails.programAffiliateId, programAffiliateId),
        inArray(affiliatePayoutDetails.method, methods),
        eq(affiliatePayoutDetails.currency, currency.toLowerCase())
      )
    );

  return rows.map((row) => ({
    method: row.method as PayoutMethod,
    details: JSON.parse(
      decryptPayoutDetails(row.detailsEncrypted)
    ) as PayoutDetailsPayload,
  }));
}

export async function isPayoutDetailsLocked(programAffiliateId: string) {
  const db = getDb();

  const [openRequest] = await db
    .select({ id: payoutRequests.id })
    .from(payoutRequests)
    .where(
      and(
        eq(payoutRequests.programAffiliateId, programAffiliateId),
        eq(payoutRequests.status, "open")
      )
    )
    .limit(1);

  if (openRequest) {
    return true;
  }

  const [unpaidItem] = await db
    .select({ id: payoutItems.id })
    .from(payoutItems)
    .innerJoin(payoutBatches, eq(payoutBatches.id, payoutItems.payoutBatchId))
    .where(
      and(
        eq(payoutItems.programAffiliateId, programAffiliateId),
        eq(payoutBatches.status, "prepared")
      )
    )
    .limit(1);

  return Boolean(unpaidItem);
}

export async function affiliateHasPayoutDetailsForProgram(
  programAffiliateId: string,
  supportedMethods: string[],
  currency: string
) {
  if (supportedMethods.length === 0) {
    return false;
  }

  const db = getDb();

  const [row] = await db
    .select({ id: affiliatePayoutDetails.id })
    .from(affiliatePayoutDetails)
    .where(
      and(
        eq(affiliatePayoutDetails.programAffiliateId, programAffiliateId),
        inArray(affiliatePayoutDetails.method, supportedMethods),
        eq(affiliatePayoutDetails.currency, currency.toLowerCase())
      )
    )
    .limit(1);

  return Boolean(row);
}

export async function getPreferredPayoutMethod(
  programAffiliateId: string,
  supportedMethods: string[],
  currency: string
): Promise<PayoutMethod | null> {
  const details = await getPreferredPayoutDetails(
    programAffiliateId,
    supportedMethods,
    currency
  );

  return details?.method ?? null;
}

export async function getPreferredPayoutDetails(
  programAffiliateId: string,
  supportedMethods: string[],
  currency: string,
  executor: DbExecutor = getDb()
) {
  const details = await getAffiliatePayoutDetailsForMethods(
    programAffiliateId,
    supportedMethods,
    currency,
    executor
  );

  const preferred = supportedMethods.find((method) =>
    details.some((row) => row.method === method)
  );

  return details.find((row) => row.method === preferred) ?? null;
}
