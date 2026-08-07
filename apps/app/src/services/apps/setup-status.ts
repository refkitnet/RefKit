import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  apiKeys,
  apps,
  clicks,
  commissionEntries,
  programAffiliates,
  programs,
  referrals,
  stripeConnections,
  stripeEvents,
  transactions,
} from "@/db/schema";
import { requireAppAccess } from "@/services/scoping";
import { isCrossCurrencyIssue } from "@/services/revenue/currency-issues";
import { readRecoverableTestApiKey } from "@/services/api-keys";

function isProductionWebsiteUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return url.protocol === "https:"
      && hostname !== "localhost"
      && !hostname.endsWith(".localhost")
      && hostname !== "127.0.0.1"
      && hostname !== "::1";
  }
  catch {
    return false;
  }
}

export async function getAppSetupStatus(userId: string, appId: string) {
  await requireAppAccess(userId, appId);

  const db = getDb();

  const [appRow, programRows, connectionRows] = await Promise.all([
    db
      .select({
        organizationId: apps.organizationId,
        revenueSource: apps.revenueSource,
        websiteUrl: apps.websiteUrl,
        integrationIssue: apps.integrationIssue,
        integrationIssueAt: apps.integrationIssueAt,
      })
      .from(apps)
      .where(eq(apps.id, appId))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.appId, appId)),
    db
      .select({
        id: stripeConnections.id,
        status: stripeConnections.status,
        livemode: stripeConnections.livemode,
      })
      .from(stripeConnections)
      .where(eq(stripeConnections.appId, appId)),
  ]);

  const programIds = programRows.map((row) => row.id);
  const connectionIds = connectionRows.map((row) => row.id);
  const stripeConnected = connectionRows.some(
    (row) => row.status === "connected"
  );
  const testStripeConnected = connectionRows.some(
    (row) => row.status === "connected" && !row.livemode
  );
  const liveStripeConnected = connectionRows.some(
    (row) => row.status === "connected" && row.livemode
  );
  const programLaunched = programIds.length > 0;
  const revenueSource = appRow?.revenueSource ?? "stripe";

  const keyRows = await db
    .select({
      id: apiKeys.id,
      prefix: apiKeys.prefix,
      testKey: apiKeys.testKey,
      testKeyEncrypted: apiKeys.testKeyEncrypted,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.appId, appId),
        eq(apiKeys.kind, "app"),
        isNull(apiKeys.revokedAt)
      )
    )
    .orderBy(desc(apiKeys.createdAt));

  const testKeys = keyRows.filter((row) => row.prefix === "rk_test_app_");
  const liveKeys = keyRows.filter((row) => row.prefix === "rk_app_");
  const apiKeyCreated = keyRows.length > 0;
  const testApiKeyCreated = testKeys.length > 0;
  const recoverableTestKey = testKeys.find(
    (row) => row.testKeyEncrypted || row.testKey
  );
  const testApiKey = recoverableTestKey
    ? await readRecoverableTestApiKey(recoverableTestKey)
    : null;
  const testApiKeyUsed = testKeys.some((row) => Boolean(row.lastUsedAt));
  const liveApiKeyCreated = liveKeys.length > 0;
  const liveApiKeyUsed = liveKeys.some((row) => Boolean(row.lastUsedAt));

  const testAffiliateRows = programIds.length > 0
    ? await db
        .select({ id: programAffiliates.id })
        .from(programAffiliates)
        .where(
          and(
            inArray(programAffiliates.programId, programIds),
            eq(programAffiliates.isTest, true)
          )
        )
    : [];
  const testAffiliateIds = testAffiliateRows.map((row) => row.id);
  const testAffiliateCreated = testAffiliateIds.length > 0;

  let firstClick = false;
  let firstIdentify = false;
  let firstStripeEvent = false;
  let firstRevenueEvent = false;
  let firstCommission = false;
  let testFirstClick = false;
  let testFirstIdentify = false;
  let testFirstRevenueEvent = false;
  let testFirstCommission = false;
  let liveFirstRevenueEvent = false;
  let liveFirstCommission = false;
  let affiliateCommissionProven = false;
  let unattributedRevenueAlarm = false;

  // Payment received: any test-mode payment transaction counts, including $0
  // trials and unattributed payments. Commission remains a separate step.
  const [revenueEventRow, testRevenueEventRow, liveRevenueEventRow, unattributedRow] = await Promise.all([
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.appId, appId),
          eq(transactions.action, "payment")
        )
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.appId, appId),
          eq(transactions.action, "payment"),
          eq(transactions.livemode, false)
        )
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.appId, appId),
          eq(transactions.action, "payment"),
          eq(transactions.livemode, true),
          testAffiliateIds.length > 0
            ? notInArray(transactions.programAffiliateId, testAffiliateIds)
            : undefined
        )
      )
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.appId, appId),
          eq(transactions.action, "payment"),
          isNull(transactions.programAffiliateId)
        )
      )
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  firstRevenueEvent = Boolean(revenueEventRow);
  testFirstRevenueEvent = Boolean(testRevenueEventRow);
  liveFirstRevenueEvent = Boolean(liveRevenueEventRow);
  unattributedRevenueAlarm = Boolean(unattributedRow);

  if (programIds.length > 0) {
    const [
      clickRow,
      referralRow,
      eventRow,
      commissionRow,
      testClickRow,
      testReferralRow,
      testCommissionRow,
      liveCommissionRow,
      affiliateCommissionRow,
    ] = await Promise.all([
      db
        .select({ id: clicks.id })
        .from(clicks)
        .where(inArray(clicks.programId, programIds))
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select({ id: referrals.id })
        .from(referrals)
        .where(inArray(referrals.programId, programIds))
        .limit(1)
        .then((rows) => rows[0]),
      connectionIds.length > 0
        ? db
            .select({ id: stripeEvents.id })
            .from(stripeEvents)
            .where(
              and(
                inArray(stripeEvents.stripeConnectionId, connectionIds),
                eq(stripeEvents.processingStatus, "processed")
              )
            )
            .limit(1)
            .then((rows) => rows[0])
        : Promise.resolve(undefined),
      db
        .select({ id: commissionEntries.id })
        .from(commissionEntries)
        .where(
          and(
            inArray(commissionEntries.programId, programIds),
            eq(commissionEntries.kind, "earned")
          )
        )
        .limit(1)
        .then((rows) => rows[0]),
      testAffiliateIds.length > 0
        ? db
            .select({ id: clicks.id })
            .from(clicks)
            .where(inArray(clicks.programAffiliateId, testAffiliateIds))
            .limit(1)
            .then((rows) => rows[0])
        : Promise.resolve(undefined),
      testAffiliateIds.length > 0
        ? db
            .select({ id: referrals.id })
            .from(referrals)
            .where(inArray(referrals.programAffiliateId, testAffiliateIds))
            .limit(1)
            .then((rows) => rows[0])
        : Promise.resolve(undefined),
      testAffiliateIds.length > 0
        ? db
            .select({ id: commissionEntries.id })
            .from(commissionEntries)
            .where(
              and(
                inArray(
                  commissionEntries.programAffiliateId,
                  testAffiliateIds
                ),
                eq(commissionEntries.kind, "earned"),
                eq(commissionEntries.livemode, false)
              )
            )
            .limit(1)
            .then((rows) => rows[0])
        : Promise.resolve(undefined),
      db
        .select({ id: commissionEntries.id })
        .from(commissionEntries)
        .where(
          and(
            inArray(commissionEntries.programId, programIds),
            eq(commissionEntries.kind, "earned"),
            eq(commissionEntries.livemode, true),
            testAffiliateIds.length > 0
              ? notInArray(
                  commissionEntries.programAffiliateId,
                  testAffiliateIds
                )
              : undefined
          )
        )
        .limit(1)
        .then((rows) => rows[0]),
      db
        .select({ id: commissionEntries.id })
        .from(commissionEntries)
        .where(
          and(
            inArray(commissionEntries.programId, programIds),
            eq(commissionEntries.kind, "earned"),
            testAffiliateIds.length > 0
              ? notInArray(
                  commissionEntries.programAffiliateId,
                  testAffiliateIds
                )
              : undefined
          )
        )
        .limit(1)
        .then((rows) => rows[0]),
    ]);

    firstClick = Boolean(clickRow);
    firstIdentify = Boolean(referralRow);
    firstStripeEvent = Boolean(eventRow);
    firstCommission = Boolean(commissionRow);
    testFirstClick = Boolean(testClickRow);
    testFirstIdentify = Boolean(testReferralRow);
    testFirstCommission = Boolean(testCommissionRow);
    liveFirstCommission = Boolean(liveCommissionRow);
    affiliateCommissionProven = Boolean(affiliateCommissionRow);
  }

  const testBillingReady =
    revenueSource === "api"
    || testStripeConnected;
  const testPathComplete =
    programLaunched
    && testBillingReady
    && testApiKeyCreated
    && testApiKeyUsed
    && testAffiliateCreated
    && testFirstClick
    && testFirstIdentify
    && testFirstRevenueEvent
    && testFirstCommission;
  const affiliatePathComplete =
    programLaunched
    && apiKeyCreated
    && affiliateCommissionProven;
  const testIntegrationComplete = testPathComplete || affiliatePathComplete;
  const productionWebsiteReady = isProductionWebsiteUrl(appRow?.websiteUrl);
  const productionReady =
    productionWebsiteReady
    && liveApiKeyCreated
    && (revenueSource === "api" || liveStripeConnected);

  return {
    revenue_source: revenueSource,
    program_launched: programLaunched,
    api_key_created: apiKeyCreated,
    first_click: firstClick,
    first_identify: firstIdentify,
    stripe_connected: stripeConnected,
    first_stripe_event: firstStripeEvent,
    first_revenue_event: firstRevenueEvent,
    first_commission: firstCommission,
    test_api_key_created: testApiKeyCreated,
    test_api_key: testApiKey,
    test_api_key_used: testApiKeyUsed,
    test_affiliate_created: testAffiliateCreated,
    test_first_click: testFirstClick,
    test_first_identify: testFirstIdentify,
    test_stripe_connected: testStripeConnected,
    test_first_revenue_event: testFirstRevenueEvent,
    test_first_commission: testFirstCommission,
    test_integration_complete: testIntegrationComplete,
    live_api_key_created: liveApiKeyCreated,
    live_api_key_used: liveApiKeyUsed,
    live_stripe_connected: liveStripeConnected,
    live_first_revenue_event: liveFirstRevenueEvent,
    live_first_commission: liveFirstCommission,
    production_website_ready: productionWebsiteReady,
    production_ready: productionReady,
    unattributed_revenue_alarm: unattributedRevenueAlarm,
    cross_currency_alarm: isCrossCurrencyIssue(appRow?.integrationIssue),
    cross_currency_message: isCrossCurrencyIssue(appRow?.integrationIssue)
      ? (appRow?.integrationIssue?.replace(
          /^cross_currency_unsupported:\s*/,
          ""
        ) ?? null)
      : null,
    integration_issue: appRow?.integrationIssue ?? null,
    integration_issue_at: appRow?.integrationIssueAt
      ? appRow.integrationIssueAt.toISOString()
      : null,
  };
}
