import { and, eq, inArray, sql } from "drizzle-orm";
import {
  programAffiliates,
  transactions,
  type Transaction,
} from "@/db/schema";
import type { AppEnvironment } from "@/lib/app-environment";
import { ListParams, listWithCursor } from "@/lib/pagination";
import { getProgramIdsForApp, requireProgramAccess } from "@/services/scoping";

function transactionEnvironmentFilter(environment?: AppEnvironment) {
  if (!environment) {
    return undefined;
  }

  if (environment === "test") {
    return eq(transactions.livemode, false);
  }

  return and(
    eq(transactions.livemode, true),
    sql`not exists (
      select 1
      from ${programAffiliates}
      where ${programAffiliates.id} = ${transactions.programAffiliateId}
        and ${programAffiliates.isTest} = true
    )`,
  );
}

export async function listTransactionsForProgram(
  userId: string,
  programId: string,
  params: ListParams,
  options: { environment?: AppEnvironment } = {},
) {
  await requireProgramAccess(userId, programId);

  const limit = params.limit ?? 25;

  return listWithCursor<Transaction>({
    table: transactions,
    columns: {
      id: transactions.id,
      createdAt: transactions.createdAt,
    },
    where: and(
      eq(transactions.programId, programId),
      transactionEnvironmentFilter(options.environment),
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listTransactionsForApp(
  userId: string,
  appId: string,
  params: ListParams,
  options: { environment?: AppEnvironment } = {},
) {
  const programIds = await getProgramIdsForApp(userId, appId);

  if (programIds.length === 0) {
    return { data: [], hasMore: false };
  }

  const limit = params.limit ?? 25;

  return listWithCursor<Transaction>({
    table: transactions,
    columns: {
      id: transactions.id,
      createdAt: transactions.createdAt,
    },
    where: and(
      inArray(transactions.programId, programIds),
      transactionEnvironmentFilter(options.environment),
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export function serializeTransaction(transaction: Transaction) {
  return {
    id: transaction.id,
    app_id: transaction.appId,
    source: transaction.source,
    external_id: transaction.externalId,
    parent_transaction_id: transaction.parentTransactionId,
    program_id: transaction.programId,
    customer_id: transaction.customerId,
    program_affiliate_id: transaction.programAffiliateId,
    stripe_object_id: transaction.stripeObjectId,
    action: transaction.action,
    amount: { amount: transaction.amount, currency: transaction.currency },
    livemode: transaction.livemode,
    transaction_date: transaction.transactionDate.toISOString(),
    created_at: transaction.createdAt.toISOString(),
    updated_at: transaction.updatedAt.toISOString(),
  };
}
