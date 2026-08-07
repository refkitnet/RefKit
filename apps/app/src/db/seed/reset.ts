import { inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accounts,
  adminAuditLogs,
  affiliateLinks,
  affiliateAgreementAcceptances,
  affiliatePromotionCodes,
  apiKeys,
  apps,
  appAgreementVersions,
  clicks,
  commissionEntries,
  commissionRules,
  customers,
  deviceCodes,
  organizationMembers,
  organizations,
  payoutExecutions,
  payoutItems,
  payoutRequestItems,
  payoutRequests,
  payoutBatches,
  pendingStripeInstalls,
  programAffiliates,
  programs,
  programTermsVersions,
  referrals,
  sessions,
  stripeAppAuthorizations,
  stripeConnections,
  stripeEvents,
  transactions,
  users,
  webhookDeliveries,
  webhookEndpoints,
} from "@/db/schema";
import {
  allSeedAppIds,
  allSeedOrgIds,
  allSeedProgramIds,
  allSeedUserIds,
  SEED_MARKER_USER_ID,
  SEED_USERS,
} from "@/db/seed/ids";

async function resolveSeedUserIdsToDelete() {
  const db = getDb();
  const seedEmails = Object.values(SEED_USERS).map((user) => user.email.toLowerCase());
  const seedUserIds = allSeedUserIds();

  const emailMatches =
    seedEmails.length > 0
      ? await db
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.email, seedEmails))
      : [];

  return [...new Set([...seedUserIds, ...emailMatches.map((row) => row.id)])];
}

async function deleteSeedUserProgramAffiliateData(
  programAffiliateIds: string[]
) {
  if (programAffiliateIds.length === 0) {
    return;
  }

  const db = getDb();
  const requestRows = await db
    .select({ id: payoutRequests.id })
    .from(payoutRequests)
    .where(inArray(payoutRequests.programAffiliateId, programAffiliateIds));
  const requestIds = requestRows.map((row) => row.id);
  const transactionRows = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(inArray(transactions.programAffiliateId, programAffiliateIds));
  const transactionIds = transactionRows.map((row) => row.id);
  const affiliateCommissionRows = await db
    .select({ id: commissionEntries.id })
    .from(commissionEntries)
    .where(inArray(commissionEntries.programAffiliateId, programAffiliateIds));
  const transactionCommissionRows =
    transactionIds.length > 0
      ? await db
          .select({ id: commissionEntries.id })
          .from(commissionEntries)
          .where(inArray(commissionEntries.transactionId, transactionIds))
      : [];
  const commissionEntryIds = [
    ...new Set([
      ...affiliateCommissionRows.map((row) => row.id),
      ...transactionCommissionRows.map((row) => row.id),
    ]),
  ];
  const linkRows = await db
    .select({ id: affiliateLinks.id })
    .from(affiliateLinks)
    .where(inArray(affiliateLinks.programAffiliateId, programAffiliateIds));
  const linkIds = linkRows.map((row) => row.id);
  const affiliateClickRows = await db
    .select({ id: clicks.id })
    .from(clicks)
    .where(inArray(clicks.programAffiliateId, programAffiliateIds));
  const linkClickRows =
    linkIds.length > 0
      ? await db
          .select({ id: clicks.id })
          .from(clicks)
          .where(inArray(clicks.affiliateLinkId, linkIds))
      : [];
  const clickIds = [
    ...new Set([
      ...affiliateClickRows.map((row) => row.id),
      ...linkClickRows.map((row) => row.id),
    ]),
  ];

  await db
    .delete(payoutExecutions)
    .where(inArray(payoutExecutions.programAffiliateId, programAffiliateIds));
  await db
    .delete(payoutItems)
    .where(inArray(payoutItems.programAffiliateId, programAffiliateIds));

  if (requestIds.length > 0) {
    await db
      .delete(payoutItems)
      .where(inArray(payoutItems.payoutRequestId, requestIds));
    await db
      .delete(payoutRequestItems)
      .where(inArray(payoutRequestItems.payoutRequestId, requestIds));
  }

  if (commissionEntryIds.length > 0) {
    await db
      .delete(payoutItems)
      .where(inArray(payoutItems.commissionEntryId, commissionEntryIds));
    await db
      .delete(payoutRequestItems)
      .where(inArray(payoutRequestItems.commissionEntryId, commissionEntryIds));
  }

  if (requestIds.length > 0) {
    await db.delete(payoutRequests).where(inArray(payoutRequests.id, requestIds));
  }

  if (commissionEntryIds.length > 0) {
    await db
      .delete(commissionEntries)
      .where(inArray(commissionEntries.id, commissionEntryIds));
  }

  if (transactionIds.length > 0) {
    await db
      .delete(transactions)
      .where(inArray(transactions.id, transactionIds));
  }

  await db
    .delete(referrals)
    .where(inArray(referrals.programAffiliateId, programAffiliateIds));

  if (clickIds.length > 0) {
    await db.delete(referrals).where(inArray(referrals.clickId, clickIds));
    await db.delete(clicks).where(inArray(clicks.id, clickIds));
  }

  await db
    .delete(affiliateAgreementAcceptances)
    .where(
      inArray(
        affiliateAgreementAcceptances.programAffiliateId,
        programAffiliateIds
      )
    );
  await db
    .delete(affiliatePromotionCodes)
    .where(
      inArray(affiliatePromotionCodes.programAffiliateId, programAffiliateIds)
    );

  if (linkIds.length > 0) {
    await db.delete(affiliateLinks).where(inArray(affiliateLinks.id, linkIds));
  }

  await db
    .delete(programAffiliates)
    .where(inArray(programAffiliates.id, programAffiliateIds));
}

export async function resetSeedData() {
  const db = getDb();
  const userIds = await resolveSeedUserIdsToDelete();
  const orgIds = allSeedOrgIds();
  const discoveredApps =
    orgIds.length > 0
      ? await db
          .select({ id: apps.id })
          .from(apps)
          .where(inArray(apps.organizationId, orgIds))
      : [];
  const appIds = [
    ...new Set([...allSeedAppIds(), ...discoveredApps.map((row) => row.id)]),
  ];
  const discoveredPrograms =
    appIds.length > 0
      ? await db
          .select({ id: programs.id })
          .from(programs)
          .where(inArray(programs.appId, appIds))
      : [];
  const programIds = [
    ...new Set([
      ...allSeedProgramIds(),
      ...discoveredPrograms.map((row) => row.id),
    ]),
  ];
  const seedUserProgramAffiliateRows =
    userIds.length > 0
      ? await db
          .select({ id: programAffiliates.id, programId: programAffiliates.programId })
          .from(programAffiliates)
          .where(inArray(programAffiliates.userId, userIds))
      : [];
  const seedProgramIdSet = new Set(programIds);
  const externalProgramAffiliateIds = seedUserProgramAffiliateRows
    .filter((row) => !seedProgramIdSet.has(row.programId))
    .map((row) => row.id);

  await deleteSeedUserProgramAffiliateData(externalProgramAffiliateIds);

  const connectionRows =
    appIds.length > 0
      ? await db
          .select({ id: stripeConnections.id })
          .from(stripeConnections)
          .where(inArray(stripeConnections.appId, appIds))
      : [];
  const connectionIds = connectionRows.map((row) => row.id);

  if (connectionIds.length > 0) {
    await db
      .delete(stripeEvents)
      .where(inArray(stripeEvents.stripeConnectionId, connectionIds));
  }

  const batchRows =
    programIds.length > 0
      ? await db
          .select({ id: payoutBatches.id })
          .from(payoutBatches)
          .where(inArray(payoutBatches.programId, programIds))
      : [];
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

  if (programIds.length > 0) {
    await db
      .delete(commissionEntries)
      .where(inArray(commissionEntries.programId, programIds));
  }

  if (appIds.length > 0) {
    await db
      .delete(transactions)
      .where(inArray(transactions.appId, appIds));
  }

  if (connectionIds.length > 0) {
    await db
      .delete(stripeConnections)
      .where(inArray(stripeConnections.id, connectionIds));
  }

  if (appIds.length > 0) {
    await db
      .delete(pendingStripeInstalls)
      .where(inArray(pendingStripeInstalls.appId, appIds));
    await db
      .delete(stripeAppAuthorizations)
      .where(inArray(stripeAppAuthorizations.claimedAppId, appIds));
  }

  if (programIds.length > 0) {
    await db
      .delete(referrals)
      .where(inArray(referrals.programId, programIds));
  }

  if (appIds.length > 0) {
    await db
      .delete(customers)
      .where(inArray(customers.appId, appIds));
  }

  if (programIds.length > 0) {
    await db
      .delete(clicks)
      .where(inArray(clicks.programId, programIds));
    await db
      .delete(affiliatePromotionCodes)
      .where(inArray(affiliatePromotionCodes.programId, programIds));
    await db
      .delete(affiliateLinks)
      .where(inArray(affiliateLinks.programId, programIds));

    const programAffiliateRows = await db
      .select({ id: programAffiliates.id })
      .from(programAffiliates)
      .where(inArray(programAffiliates.programId, programIds));
    const programAffiliateIds = programAffiliateRows.map((row) => row.id);

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
      .delete(programAffiliates)
      .where(inArray(programAffiliates.programId, programIds));
    await db
      .delete(commissionRules)
      .where(inArray(commissionRules.programId, programIds));
    await db
      .delete(programTermsVersions)
      .where(inArray(programTermsVersions.programId, programIds));
    await db.delete(programs).where(inArray(programs.id, programIds));
  }

  if (appIds.length > 0) {
    await db.delete(apiKeys).where(inArray(apiKeys.appId, appIds));
  }

  if (userIds.length > 0) {
    await db
      .delete(pendingStripeInstalls)
      .where(inArray(pendingStripeInstalls.userId, userIds));
    await db.delete(deviceCodes).where(inArray(deviceCodes.userId, userIds));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(accounts).where(inArray(accounts.userId, userIds));
    await db
      .delete(organizationMembers)
      .where(inArray(organizationMembers.userId, userIds));
    await db.delete(apiKeys).where(inArray(apiKeys.userId, userIds));
    await db.delete(programAffiliates).where(inArray(programAffiliates.userId, userIds));
  }

  if (appIds.length > 0) {
    await db
      .delete(appAgreementVersions)
      .where(inArray(appAgreementVersions.appId, appIds));
    await db
      .delete(webhookDeliveries)
      .where(inArray(webhookDeliveries.appId, appIds));
    await db
      .delete(webhookEndpoints)
      .where(inArray(webhookEndpoints.appId, appIds));
    await db.delete(apps).where(inArray(apps.id, appIds));
  }

  if (orgIds.length > 0) {
    await db
      .delete(apiKeys)
      .where(inArray(apiKeys.organizationId, orgIds));
    await db
      .delete(organizationMembers)
      .where(inArray(organizationMembers.organizationId, orgIds));
    await db.delete(organizations).where(inArray(organizations.id, orgIds));
  }

  const auditUserIds = [...new Set([...userIds, SEED_MARKER_USER_ID])];
  if (auditUserIds.length > 0) {
    await db
      .delete(adminAuditLogs)
      .where(inArray(adminAuditLogs.adminUserId, auditUserIds));
  }

  if (userIds.length > 0) {
    await db.delete(users).where(inArray(users.id, userIds));
  }
}
