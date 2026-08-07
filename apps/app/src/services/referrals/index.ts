import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  customers,
  programAffiliates,
  referrals,
  type Referral,
} from "@/db/schema";
import type { AppEnvironment } from "@/lib/app-environment";
import { ListParams, listWithCursor } from "@/lib/pagination";
import {
  getProgramIdsForApp,
  requireProgramAffiliate,
  requireProgramAccess,
} from "@/services/scoping";

export async function listReferralsForProgram(
  userId: string,
  programId: string,
  params: ListParams,
  options: { environment?: AppEnvironment } = {},
) {
  await requireProgramAccess(userId, programId);

  const limit = params.limit ?? 25;

  return listWithCursor<Referral>({
    table: referrals,
    columns: {
      id: referrals.id,
      createdAt: referrals.createdAt,
    },
    where: and(
      eq(referrals.programId, programId),
      sql`exists (
        select 1
        from ${programAffiliates}
        where ${programAffiliates.id} = ${referrals.programAffiliateId}
          and ${programAffiliates.isTest} = ${options.environment === "test"}
      )`
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listReferralsForApp(
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

  return listWithCursor<Referral>({
    table: referrals,
    columns: {
      id: referrals.id,
      createdAt: referrals.createdAt,
    },
    where: and(
      inArray(referrals.programId, programIds),
      sql`exists (
        select 1
        from ${programAffiliates}
        where ${programAffiliates.id} = ${referrals.programAffiliateId}
          and ${programAffiliates.isTest} = ${options.environment === "test"}
      )`
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listReferralsForAffiliate(
  userId: string,
  programId: string,
  params: ListParams
) {
  const membership = await requireProgramAffiliate(userId, programId);

  const limit = params.limit ?? 25;

  return listWithCursor<Referral>({
    table: referrals,
    columns: {
      id: referrals.id,
      createdAt: referrals.createdAt,
    },
    where: and(
      eq(referrals.programId, programId),
      eq(referrals.programAffiliateId, membership.id)
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export function serializeReferral(
  referral: Referral,
  customer?: { email: string | null; externalCustomerId: string } | null
) {
  return {
    id: referral.id,
    customer_id: referral.customerId,
    customer_email: customer?.email ?? null,
    customer_external_customer_id: customer?.externalCustomerId ?? null,
    program_id: referral.programId,
    program_affiliate_id: referral.programAffiliateId,
    click_id: referral.clickId,
    created_at: referral.createdAt.toISOString(),
    updated_at: referral.updatedAt.toISOString(),
  };
}

async function loadCustomersById(customerIds: string[]) {
  if (customerIds.length === 0) {
    return new Map<string, { email: string | null; externalCustomerId: string }>();
  }

  const db = getDb();
  const rows = await db
    .select({
      id: customers.id,
      email: customers.email,
      externalCustomerId: customers.externalCustomerId,
    })
    .from(customers)
    .where(inArray(customers.id, customerIds));

  return new Map(
    rows.map((row) => [
      row.id,
      { email: row.email, externalCustomerId: row.externalCustomerId },
    ])
  );
}

export async function serializeReferrals(referralRows: Referral[]) {
  const customerIds = Array.from(
    new Set(referralRows.map((referral) => referral.customerId))
  );
  const customersById = await loadCustomersById(customerIds);

  return referralRows.map((referral) =>
    serializeReferral(referral, customersById.get(referral.customerId) ?? null)
  );
}
