import { eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  adminAuditLogs,
  affiliateAgreementAcceptances,
  affiliateLinks,
  affiliatePayoutDetails,
  affiliatePromotionCodes,
  apiKeys,
  apps,
  appAgreementVersions,
  clicks,
  commissionEntries,
  commissionRules,
  customers,
  organizationMembers,
  organizations,
  payoutItems,
  payoutExecutions,
  payoutRequestItems,
  payoutRequests,
  payoutBatches,
  programAffiliates,
  programs,
  programTermsVersions,
  referrals,
  pendingStripeInstalls,
  stripeAppAuthorizations,
  stripeConnections,
  stripeEvents,
  transactions,
  users,
  webhookDeliveries,
  webhookEndpoints,
} from "@/db/schema";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { hashRateLimitScope } from "@/lib/rate-limit";
import { createApp } from "@/services/apps";
import { createOrganization } from "@/services/organizations";
import { createProgram } from "@/services/programs";

export type TestContext = {
  suffix: string;
  destinationUrl: string;
  ownerUserId: string;
  affiliateUserId: string;
  organizationId: string;
  appId: string;
  programId: string;
  ruleId: string;
  programAffiliateId: string;
  linkCode: string;
  linkId: string;
  clickId: string;
  customerId: string;
  referralId: string;
  apiKeyId: string;
  apiKey: string;
  affiliateApiKeyIds?: string[];
  stripeConnectionId?: string;
  rateLimitScopes: string[];
};

export function createTestSuffix() {
  return `vitest-${Date.now().toString(36)}`;
}

export async function createOwnerUser(suffix: string) {
  const db = getDb();
  const userId = generateId(ID_PREFIXES.user);
  const email = `owner-${suffix}@refkit-vitest.test`;

  await db.insert(users).values({
    id: userId,
    email,
    name: `Owner ${suffix}`,
  });

  return userId;
}

export async function createAffiliateUser(suffix: string) {
  const db = getDb();
  const userId = generateId(ID_PREFIXES.user);
  const email = `affiliate-${suffix}@refkit-vitest.test`;

  await db.insert(users).values({
    id: userId,
    email,
    name: `Affiliate ${suffix}`,
  });

  return userId;
}

type SeedAttributionInput = {
  suffix?: string;
  commissionPercent?: number;
  recurringDurationMonths?: number | null;
  includeAttribution?: boolean;
  affiliateTestMode?: boolean;
};

export async function seedAttributionGraph(
  input: SeedAttributionInput = {}
): Promise<TestContext> {
  const suffix = input.suffix ?? createTestSuffix();
  const destinationUrl = `https://${suffix}.example.com`;
  const ownerUserId = await createOwnerUser(suffix);
  const affiliateUserId = await createAffiliateUser(suffix);
  const organization = await createOrganization(
    ownerUserId,
    `Org ${suffix}`
  );
  const app = await createApp(ownerUserId, {
    organizationId: organization.id,
    name: `App ${suffix}`,
    websiteUrl: destinationUrl,
  });
  const { program, commissionRule } = await createProgram(ownerUserId, {
    appId: app.id,
    name: `Program ${suffix}`,
    slug: `prg-${suffix}`,
    currency: "usd",
    destinationUrl,
    commissionRule: {
      rewardType: "percent",
      percentValue: input.commissionPercent ?? 20,
      recurringDurationMonths:
        input.recurringDurationMonths !== undefined
          ? input.recurringDurationMonths
          : null,
    },
  });

  const db = getDb();
  const programAffiliateId = generateId(ID_PREFIXES.affiliate);
  const linkId = generateId(ID_PREFIXES.link);
  const clickId = generateId(ID_PREFIXES.click);
  const customerId = generateId(ID_PREFIXES.customer);
  const referralId = generateId(ID_PREFIXES.referral);

  const linkCode = `aff${suffix.slice(-8)}`;

  await db.transaction(async (tx) => {
    await tx.insert(programAffiliates).values({
      id: programAffiliateId,
      programId: program.id,
      userId: affiliateUserId,
      status: "active",
      isTest: input.affiliateTestMode ?? false,
    });

    await tx.insert(affiliateLinks).values({
      id: linkId,
      appId: app.id,
      programAffiliateId,
      programId: program.id,
      linkCode,
      label: "Default link",
    });

    await tx.insert(clicks).values({
      id: clickId,
      affiliateLinkId: linkId,
      programId: program.id,
      programAffiliateId,
      ipHash: `hash-${suffix}`,
      userAgent: "vitest",
    });

    if (input.includeAttribution !== false) {
      await tx.insert(customers).values({
        id: customerId,
        appId: app.id,
        externalCustomerId: `ext-${suffix}`,
        email: `customer-${suffix}@refkit-vitest.test`,
      });

      await tx.insert(referrals).values({
        id: referralId,
        customerId,
        programId: program.id,
        programAffiliateId,
        clickId,
      });
    }
  });

  return {
    suffix,
    destinationUrl,
    ownerUserId,
    affiliateUserId,
    organizationId: organization.id,
    appId: app.id,
    programId: program.id,
    ruleId: commissionRule.id,
    programAffiliateId,
    linkCode,
    linkId,
    clickId,
    customerId,
    referralId,
    apiKeyId: app.testApiKeyId,
    apiKey: app.testApiKey,
    rateLimitScopes: [],
  };
}

export async function cleanupTestContext(ctx: TestContext) {
  const db = getDb();
  const programRows = await db
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.appId, ctx.appId));
  const programIds = programRows.map((program) => program.id);

  const batchRows = await db
    .select({ id: payoutBatches.id })
    .from(payoutBatches)
    .where(inArray(payoutBatches.programId, programIds));
  const batchIds = batchRows.map((row) => row.id);

  if (batchIds.length > 0) {
    await db
      .delete(payoutExecutions)
      .where(inArray(payoutExecutions.payoutBatchId, batchIds));
    await db
      .delete(payoutItems)
      .where(inArray(payoutItems.payoutBatchId, batchIds));
  }

  if (programIds.length > 0) {
    const requestRows = await db
      .select({ id: payoutRequests.id })
      .from(payoutRequests)
      .where(inArray(payoutRequests.programId, programIds));
    const requestIds = requestRows.map((row) => row.id);

    if (requestIds.length > 0) {
      await db
        .delete(payoutRequestItems)
        .where(inArray(payoutRequestItems.payoutRequestId, requestIds));
    }

    await db
      .delete(payoutRequests)
      .where(inArray(payoutRequests.programId, programIds));
  }

  if (batchIds.length > 0) {
    await db.delete(payoutBatches).where(inArray(payoutBatches.id, batchIds));
  }

  await db
    .delete(affiliatePayoutDetails)
    .where(eq(affiliatePayoutDetails.programAffiliateId, ctx.programAffiliateId));

  const entryRows = await db
    .select({ id: commissionEntries.id })
    .from(commissionEntries)
    .where(inArray(commissionEntries.programId, programIds));
  const entryIds = entryRows.map((row) => row.id);

  if (entryIds.length > 0) {
    await db
      .delete(commissionEntries)
      .where(inArray(commissionEntries.id, entryIds));
  }

  const txnRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(eq(transactions.appId, ctx.appId));
  const txnIds = txnRows.map((row) => row.id);

  if (txnIds.length > 0) {
    await db.delete(transactions).where(inArray(transactions.id, txnIds));
  }

  const stripeConnectionRows = await db
    .select({
      id: stripeConnections.id,
      stripeAccountId: stripeConnections.stripeAccountId,
    })
    .from(stripeConnections)
    .where(eq(stripeConnections.appId, ctx.appId));
  const stripeConnectionIds = stripeConnectionRows.map((row) => row.id);
  const stripeAccountIds = stripeConnectionRows.map(
    (row) => row.stripeAccountId
  );
  const stripeEventRows = stripeConnectionIds.length > 0
    ? await db
        .select({ id: stripeEvents.id })
        .from(stripeEvents)
        .where(inArray(stripeEvents.stripeConnectionId, stripeConnectionIds))
    : [];
  const stripeEventIds = stripeEventRows.map((row) => row.id);

  if (stripeEventIds.length > 0) {
    await db
      .delete(stripeEvents)
      .where(inArray(stripeEvents.id, stripeEventIds));
  }

  if (stripeAccountIds.length > 0) {
    await db
      .delete(stripeAppAuthorizations)
      .where(
        inArray(stripeAppAuthorizations.stripeAccountId, stripeAccountIds)
      );
  }

  await db
    .delete(stripeAppAuthorizations)
    .where(eq(stripeAppAuthorizations.claimedAppId, ctx.appId));
  await db
    .delete(pendingStripeInstalls)
    .where(eq(pendingStripeInstalls.appId, ctx.appId));

  if (stripeConnectionIds.length > 0) {
    await db
      .delete(stripeConnections)
      .where(inArray(stripeConnections.id, stripeConnectionIds));
  }

  await db.delete(referrals).where(inArray(referrals.programId, programIds));
  await db.delete(customers).where(inArray(customers.appId, [ctx.appId]));
  await db.delete(clicks).where(inArray(clicks.programId, programIds));

  await db
    .delete(affiliatePromotionCodes)
    .where(inArray(affiliatePromotionCodes.programId, programIds));

  const programAffiliateRows = await db
    .select({
      id: programAffiliates.id,
      userId: programAffiliates.userId,
    })
    .from(programAffiliates)
    .where(inArray(programAffiliates.programId, programIds));
  const programAffiliateIds = programAffiliateRows.map((row) => row.id);
  const programAffiliateUserIds = programAffiliateRows.map((row) => row.userId);

  if (programAffiliateIds.length > 0) {
    await db
      .delete(affiliateAgreementAcceptances)
      .where(
        inArray(
          affiliateAgreementAcceptances.programAffiliateId,
          programAffiliateIds
        )
      );
  }

  await db
    .delete(affiliateLinks)
    .where(inArray(affiliateLinks.programId, programIds));
  await db
    .delete(programAffiliates)
    .where(inArray(programAffiliates.programId, programIds));
  await db
    .delete(commissionRules)
    .where(inArray(commissionRules.programId, programIds));
  await db
    .delete(programTermsVersions)
    .where(inArray(programTermsVersions.programId, programIds));
  await db.delete(programs).where(inArray(programs.id, programIds));

  const apiKeyIds = [
    ctx.apiKeyId,
    ...(ctx.affiliateApiKeyIds ?? []),
  ];

  if (apiKeyIds.length > 0) {
    await db.delete(apiKeys).where(inArray(apiKeys.id, apiKeyIds));
  }

  await db
    .delete(appAgreementVersions)
    .where(inArray(appAgreementVersions.appId, [ctx.appId]));
  await db
    .delete(webhookDeliveries)
    .where(inArray(webhookDeliveries.appId, [ctx.appId]));
  await db
    .delete(webhookEndpoints)
    .where(inArray(webhookEndpoints.appId, [ctx.appId]));
  await db.delete(apps).where(inArray(apps.id, [ctx.appId]));

  await db
    .delete(adminAuditLogs)
    .where(inArray(adminAuditLogs.adminUserId, [ctx.ownerUserId]));

  const memberRows = await db
    .select({ id: organizationMembers.id })
    .from(organizationMembers)
    .where(
      inArray(organizationMembers.organizationId, [ctx.organizationId])
    );

  if (memberRows.length > 0) {
    await db
      .delete(organizationMembers)
      .where(
        inArray(
          organizationMembers.id,
          memberRows.map((row) => row.id)
        )
      );
  }

  await db
    .delete(organizations)
    .where(inArray(organizations.id, [ctx.organizationId]));

  if (ctx.rateLimitScopes.length > 0) {
    await db.execute(sql`
      DELETE FROM rate_limits
      WHERE scope IN (${sql.join(
        ctx.rateLimitScopes.map((scope) => sql`${hashRateLimitScope(scope)}`),
        sql`, `
      )})
    `);
  }

  await db
    .delete(users)
    .where(
      inArray(
        users.id,
        [...new Set([
          ctx.ownerUserId,
          ctx.affiliateUserId,
          ...programAffiliateUserIds,
        ])]
      )
    );
}
