import { and, eq, inArray, lt, or, SQL } from "drizzle-orm";
import {
  adminAuditLogs,
  programAffiliates,
  apps,
  clicks,
  commissionEntries,
  customers,
  organizationMembers,
  organizations,
  payoutItems,
  payoutRequests,
  payoutBatches,
  programs,
  referrals,
  stripeConnections,
  stripeEvents,
  transactions,
  users,
  type AdminAuditLog,
  type ProgramAffiliate,
  type App,
  type Click,
  type CommissionEntry,
  type Customer,
  type Organization,
  type OrganizationMember,
  type PayoutItem,
  type PayoutRequest,
  type PayoutBatch,
  type Program,
  type Referral,
  type StripeConnection,
  type StripeEvent,
  type Transaction,
} from "@/db/schema";
import { getDb } from "@/db/client";
import { ListParams, listWithCursor } from "@/lib/pagination";

export type AdminListFilters = {
  status?: string;
  processingStatus?: string;
  attentionOnly?: boolean;
  programId?: string;
  affiliateId?: string;
  role?: string;
};

export async function listAdminOrganizations(params: ListParams) {
  const limit = params.limit ?? 25;

  return listWithCursor<Organization>({
    table: organizations,
    columns: {
      id: organizations.id,
      createdAt: organizations.createdAt,
    },
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminApps(params: ListParams) {
  const limit = params.limit ?? 25;

  return listWithCursor<App>({
    table: apps,
    columns: {
      id: apps.id,
      createdAt: apps.createdAt,
    },
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function getAdminAppOrganizationNames(appRows: App[]) {
  if (appRows.length === 0) {
    return new Map<string, string>();
  }

  const db = getDb();
  const organizationIds = [
    ...new Set(appRows.map((app) => app.organizationId)),
  ];
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
    })
    .from(organizations)
    .where(inArray(organizations.id, organizationIds));

  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function listAdminOrganizationMembers(
  params: ListParams,
  filters: AdminListFilters
) {
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [];

  if (filters.role) {
    conditions.push(eq(organizationMembers.role, filters.role));
  }

  return listWithCursor<OrganizationMember>({
    table: organizationMembers,
    columns: {
      id: organizationMembers.id,
      createdAt: organizationMembers.createdAt,
    },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function getAdminOrganizationMemberDetails(
  memberRows: OrganizationMember[]
) {
  if (memberRows.length === 0) {
    return new Map<
      string,
      {
        organization_name: string;
        user_email: string;
        user_name: string | null;
        user_image: string | null;
      }
    >();
  }

  const db = getDb();
  const organizationIds = [
    ...new Set(memberRows.map((row) => row.organizationId)),
  ];
  const userIds = [...new Set(memberRows.map((row) => row.userId))];
  const [organizationRows, userRows] = await Promise.all([
    db
      .select({
        id: organizations.id,
        name: organizations.name,
      })
      .from(organizations)
      .where(inArray(organizations.id, organizationIds)),
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
      })
      .from(users)
      .where(inArray(users.id, userIds)),
  ]);

  const organizationMap = new Map(
    organizationRows.map((row) => [row.id, row.name])
  );
  const userMap = new Map(
    userRows.map((row) => [
      row.id,
      { email: row.email, name: row.name, image: row.image },
    ])
  );
  const details = new Map<
    string,
    {
      organization_name: string;
      user_email: string;
      user_name: string | null;
      user_image: string | null;
    }
  >();

  for (const member of memberRows) {
    const organizationName = organizationMap.get(member.organizationId);
    const user = userMap.get(member.userId);

    if (!organizationName || !user) {
      continue;
    }

    details.set(member.id, {
      organization_name: organizationName,
      user_email: user.email,
      user_name: user.name,
      user_image: user.image,
    });
  }

  return details;
}

export async function listAdminPrograms(params: ListParams, filters: AdminListFilters) {
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(programs.status, filters.status));
  }

  return listWithCursor<Program>({
    table: programs,
    columns: {
      id: programs.id,
      createdAt: programs.createdAt,
    },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminAffiliates(params: ListParams, filters: AdminListFilters) {
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(programAffiliates.status, filters.status));
  }

  if (filters.programId) {
    conditions.push(eq(programAffiliates.programId, filters.programId));
  }

  return listWithCursor<ProgramAffiliate>({
    table: programAffiliates,
    columns: {
      id: programAffiliates.id,
      createdAt: programAffiliates.createdAt,
    },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminClicks(params: ListParams, filters: AdminListFilters) {
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [];

  if (filters.programId) {
    conditions.push(eq(clicks.programId, filters.programId));
  }

  if (filters.affiliateId) {
    conditions.push(eq(clicks.programAffiliateId, filters.affiliateId));
  }

  return listWithCursor<Click>({
    table: clicks,
    columns: {
      id: clicks.id,
      createdAt: clicks.createdAt,
    },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminReferrals(params: ListParams, filters: AdminListFilters) {
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [];

  if (filters.programId) {
    conditions.push(eq(referrals.programId, filters.programId));
  }

  if (filters.affiliateId) {
    conditions.push(eq(referrals.programAffiliateId, filters.affiliateId));
  }

  return listWithCursor<Referral>({
    table: referrals,
    columns: {
      id: referrals.id,
      createdAt: referrals.createdAt,
    },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminCustomers(params: ListParams) {
  const limit = params.limit ?? 25;

  return listWithCursor<Customer>({
    table: customers,
    columns: {
      id: customers.id,
      createdAt: customers.createdAt,
    },
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminStripeConnections(params: ListParams) {
  const limit = params.limit ?? 25;

  return listWithCursor<StripeConnection>({
    table: stripeConnections,
    columns: {
      id: stripeConnections.id,
      createdAt: stripeConnections.createdAt,
    },
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminStripeEvents(
  params: ListParams,
  filters: AdminListFilters
) {
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [];

  if (filters.processingStatus) {
    conditions.push(eq(stripeEvents.processingStatus, filters.processingStatus));
  }

  if (filters.attentionOnly) {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    const needsAttention = or(
      eq(stripeEvents.processingStatus, "failed"),
      and(
        inArray(stripeEvents.processingStatus, ["pending", "processing"]),
        lt(stripeEvents.updatedAt, staleBefore)
      )
    );

    if (needsAttention) {
      conditions.push(needsAttention);
    }
  }

  return listWithCursor<StripeEvent>({
    table: stripeEvents,
    columns: {
      id: stripeEvents.id,
      createdAt: stripeEvents.createdAt,
    },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminTransactions(
  params: ListParams,
  filters: AdminListFilters
) {
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [];

  if (filters.programId) {
    conditions.push(eq(transactions.programId, filters.programId));
  }

  return listWithCursor<Transaction>({
    table: transactions,
    columns: {
      id: transactions.id,
      createdAt: transactions.createdAt,
    },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminCommissionEntries(
  params: ListParams,
  filters: AdminListFilters
) {
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(commissionEntries.status, filters.status));
  }

  if (filters.programId) {
    conditions.push(eq(commissionEntries.programId, filters.programId));
  }

  if (filters.affiliateId) {
    conditions.push(eq(commissionEntries.programAffiliateId, filters.affiliateId));
  }

  return listWithCursor<CommissionEntry>({
    table: commissionEntries,
    columns: {
      id: commissionEntries.id,
      createdAt: commissionEntries.createdAt,
    },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminPayoutRuns(params: ListParams, filters: AdminListFilters) {
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(payoutBatches.status, filters.status));
  }

  if (filters.programId) {
    conditions.push(eq(payoutBatches.programId, filters.programId));
  }

  return listWithCursor<PayoutBatch>({
    table: payoutBatches,
    columns: {
      id: payoutBatches.id,
      createdAt: payoutBatches.createdAt,
    },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminPayoutRequests(
  params: ListParams,
  filters: AdminListFilters
) {
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [];

  if (filters.status) {
    conditions.push(eq(payoutRequests.status, filters.status));
  }

  if (filters.programId) {
    conditions.push(eq(payoutRequests.programId, filters.programId));
  }

  return listWithCursor<PayoutRequest>({
    table: payoutRequests,
    columns: {
      id: payoutRequests.id,
      createdAt: payoutRequests.createdAt,
    },
    where: conditions.length > 0 ? and(...conditions) : undefined,
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminPayoutItems(params: ListParams) {
  const limit = params.limit ?? 25;

  return listWithCursor<PayoutItem>({
    table: payoutItems,
    columns: {
      id: payoutItems.id,
      createdAt: payoutItems.createdAt,
    },
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listAdminAuditLogs(params: ListParams) {
  const limit = params.limit ?? 25;

  return listWithCursor<AdminAuditLog>({
    table: adminAuditLogs,
    columns: {
      id: adminAuditLogs.id,
      createdAt: adminAuditLogs.createdAt,
    },
    limit,
    startingAfter: params.startingAfter,
  });
}

export function parseAdminListFilters(
  searchParams: URLSearchParams
): AdminListFilters {
  return {
    status: searchParams.get("status") ?? undefined,
    processingStatus: searchParams.get("processing_status") ?? undefined,
    attentionOnly: searchParams.get("attention_only") === "true",
    programId: searchParams.get("program_id") ?? undefined,
    affiliateId: searchParams.get("affiliate_id") ?? undefined,
    role: searchParams.get("role") ?? undefined,
  };
}
