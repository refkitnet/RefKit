import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { POST as exportManagedData } from "@/app/api/v1/managed-data-subjects/export/route";
import { getDb } from "@/db/client";
import {
  affiliateLinks,
  apiKeys,
  appAgreementVersions,
  apps,
  clicks,
  commissionRules,
  commissionEntries,
  customers,
  managedAccounts,
  managedConnections,
  managedDataSubjectRedactions,
  organizations,
  programAffiliates,
  programs,
  programTermsVersions,
  referrals,
  transactions,
  users,
  webhookDeliveries,
  webhookEndpoints,
} from "@/db/schema";
import { requireAppKey } from "@/lib/auth-context";
import { encryptWebhookSecret, sha256 } from "@/lib/crypto";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import {
  redactManagedCustomerData,
} from "@/services/managed-data-subjects";
import {
  provisionManagedConnection,
  redactManagedConnection,
} from "@/services/managed-connections";
import { identifyCustomer } from "@/services/identify";

describe("managed data subjects", () => {
  it("exports click data, detaches the ledger, and redacts a reidentified customer", async () => {
    const db = getDb();
    const suffix = `${Date.now()}-${Math.random()}`;
    const provisioned = await provisionManagedConnection({
      provider: "privacy_test_provider",
      externalAccountId: sha256(`privacy-account-${suffix}`),
      displayName: "Privacy Test Account",
      websiteUrl: "https://privacy-test.example",
      idempotencyKey: `privacy-generation-${suffix}`,
    });
    const appId = provisioned.connection.app_id;
    const organizationId = provisioned.connection.organization_id;
    const managedAccountId = provisioned.connection.managed_account_id;
    const connectionId = provisioned.connection.id;
    const userId = generateId(ID_PREFIXES.user);
    const programId = generateId(ID_PREFIXES.program);
    const programAffiliateId = generateId(ID_PREFIXES.affiliate);
    const termsVersionId = generateId(ID_PREFIXES.termsVersion);
    const commissionRuleId = generateId(ID_PREFIXES.commissionRule);
    const linkId = generateId(ID_PREFIXES.link);
    const clickId = generateId(ID_PREFIXES.click);
    const firstCustomerId = generateId(ID_PREFIXES.customer);
    const firstReferralId = generateId(ID_PREFIXES.referral);
    const transactionId = generateId(ID_PREFIXES.transaction);
    const commissionEntryId = generateId(ID_PREFIXES.commissionEntry);
    const webhookEndpointId = generateId(ID_PREFIXES.webhookEndpoint);
    const webhookDeliveryId = generateId(ID_PREFIXES.webhookDelivery);
    const externalCustomerId = "x";

    try {
      await db.insert(users).values({
        id: userId,
        email: `privacy-${suffix}@example.com`,
        emailVerified: true,
        primaryMode: "affiliate",
      });
      await db.insert(programs).values({
        id: programId,
        appId,
        name: "Privacy Test Program",
        slug: `privacy-test-${suffix}`,
        currency: "usd",
        destinationUrl: "https://privacy-test.example/buy",
      });
      await db.insert(programTermsVersions).values({
        id: termsVersionId,
        programId,
        versionNumber: 1,
        rewardType: "percentage",
        percentValue: "20.0000",
      });
      await db.insert(commissionRules).values({
        id: commissionRuleId,
        programId,
        termsVersionId,
        rewardType: "percentage",
        percentValue: "20.0000",
      });
      await db.insert(programAffiliates).values({
        id: programAffiliateId,
        programId,
        userId,
        status: "active",
      });
      await db.insert(affiliateLinks).values({
        id: linkId,
        appId,
        programAffiliateId,
        programId,
        linkCode: `privacy-${suffix}`,
      });
      await db.insert(clicks).values({
        id: clickId,
        affiliateLinkId: linkId,
        programId,
        programAffiliateId,
        linkLabel: "Privacy link",
        linkCode: `privacy-${suffix}`,
        pageUrl: "https://privacy-test.example/buy?via=privacy",
        referrer: "https://affiliate.example/post",
        ipHash: sha256("203.0.113.10"),
        userAgent: "Privacy test browser",
      });
      await db.insert(customers).values({
        id: firstCustomerId,
        appId,
        externalCustomerId,
      });
      await db.insert(referrals).values({
        id: firstReferralId,
        customerId: firstCustomerId,
        programId,
        programAffiliateId,
        clickId,
      });
      await db.insert(transactions).values({
        id: transactionId,
        appId,
        source: "api",
        externalId: sha256(`order-${suffix}`),
        programId,
        customerId: firstCustomerId,
        programAffiliateId,
        action: "payment",
        amount: 10_000,
        currency: "usd",
        livemode: true,
        transactionDate: new Date(),
      });
      await db.insert(commissionEntries).values({
        id: commissionEntryId,
        transactionId,
        programId,
        programAffiliateId,
        customerId: firstCustomerId,
        kind: "earned",
        amount: 2_000,
        currency: "usd",
        livemode: true,
      });

      const exportResponse = await exportManagedData(
        new Request("http://refkit.test/v1/managed-data-subjects/export", {
          method: "POST",
          headers: {
            authorization: `Bearer ${provisioned.credentials!.managementKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            external_customer_id: externalCustomerId,
          }),
        })
      );
      const exported = await exportResponse.json();

      expect(exportResponse.status).toBe(200);
      expect(exported).toMatchObject({
        customer: {
          id: firstCustomerId,
          external_customer_id: externalCustomerId,
        },
        clicks: [
          {
            id: clickId,
            page_url: "https://privacy-test.example/buy?via=privacy",
            referrer: "https://affiliate.example/post",
            ip_hash: sha256("203.0.113.10"),
            user_agent: "Privacy test browser",
          },
        ],
        transactions: [{ id: transactionId }],
        commission_entries: [{ id: commissionEntryId }],
      });

      const firstRedaction = await redactManagedCustomerData(
        managedAccountId,
        appId,
        externalCustomerId
      );
      const [detachedReferral] = await db
        .select()
        .from(referrals)
        .where(eq(referrals.id, firstReferralId));
      const [detachedTransaction] = await db
        .select()
        .from(transactions)
        .where(eq(transactions.id, transactionId));
      const [detachedCommission] = await db
        .select()
        .from(commissionEntries)
        .where(eq(commissionEntries.id, commissionEntryId));
      const [scrubbedClick] = await db
        .select()
        .from(clicks)
        .where(eq(clicks.id, clickId));
      const [removedCustomer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, firstCustomerId));
      const [deidentifiedCustomer] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, detachedReferral.customerId));

      expect(firstRedaction).toMatchObject({
        customer_id: firstCustomerId,
        redacted: true,
      });
      expect(removedCustomer).toBeUndefined();
      expect(detachedReferral.customerId).not.toBe(firstCustomerId);
      expect(detachedReferral.clickId).toBeNull();
      expect(deidentifiedCustomer.externalCustomerId).toBe(
        `redacted_${detachedReferral.customerId}`
      );
      expect(deidentifiedCustomer.redactedAt).toBeInstanceOf(Date);
      expect(detachedTransaction.customerId).toBeNull();
      expect(detachedCommission.customerId).toBeNull();
      expect(scrubbedClick).toMatchObject({
        pageUrl: null,
        referrer: null,
        ipHash: "redacted",
        userAgent: null,
      });

      await expect(
        redactManagedCustomerData(
          managedAccountId,
          appId,
          externalCustomerId
        )
      ).resolves.toEqual(firstRedaction);

      const liveAuth = await requireAppKey(
        new Request("http://refkit.test/v1/identify", {
          headers: {
            authorization: `Bearer ${provisioned.credentials!.liveRevenueKey}`,
          },
        })
      );
      const reidentified = await identifyCustomer(liveAuth, {
        clickId,
        externalCustomerId,
      });
      const secondRedaction = await redactManagedCustomerData(
        managedAccountId,
        appId,
        externalCustomerId
      );
      const allReceipts = await db
        .select()
        .from(managedDataSubjectRedactions)
        .where(eq(managedDataSubjectRedactions.appId, appId));
      const preFinalCustomerIds = (
        await db
          .select({ id: customers.id })
          .from(customers)
          .where(eq(customers.appId, appId))
      ).map((customer) => customer.id);

      expect(reidentified.customer.id).not.toBe(firstCustomerId);
      expect(secondRedaction.customer_id).toBe(reidentified.customer.id);
      expect(secondRedaction.customer_id).not.toBe(firstRedaction.customer_id);
      expect(allReceipts).toHaveLength(1);
      expect(allReceipts[0].customerId).toBe(secondRedaction.customer_id);

      await db.insert(webhookEndpoints).values({
        id: webhookEndpointId,
        appId,
        url: "https://merchant.example/refkit-webhook",
        secretEncrypted: encryptWebhookSecret("merchant-webhook-secret"),
        enabledEvents: ["referral.created"],
      });
      await db.insert(webhookDeliveries).values({
        id: webhookDeliveryId,
        webhookEndpointId,
        appId,
        eventId: `privacy-event-${suffix}`,
        eventType: "referral.created",
        payload: { external_customer_id: externalCustomerId },
        success: true,
        httpStatus: 200,
      });

      const finalRedaction = await redactManagedConnection(connectionId);
      const [redactedApp] = await db
        .select()
        .from(apps)
        .where(eq(apps.id, appId));
      const [redactedProgram] = await db
        .select()
        .from(programs)
        .where(eq(programs.id, programId));
      const [redactedAffiliate] = await db
        .select()
        .from(programAffiliates)
        .where(eq(programAffiliates.id, programAffiliateId));
      const [redactedAffiliateUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, redactedAffiliate.userId));
      const retainedCustomers = await db
        .select()
        .from(customers)
        .where(eq(customers.appId, appId));
      const retainedReceipts = await db
        .select()
        .from(managedDataSubjectRedactions)
        .where(eq(managedDataSubjectRedactions.appId, appId));
      const retainedClicks = await db
        .select()
        .from(clicks)
        .where(eq(clicks.programId, programId));
      const retainedLinks = await db
        .select()
        .from(affiliateLinks)
        .where(eq(affiliateLinks.programId, programId));
      const retainedWebhookDeliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.appId, appId));
      const retainedWebhookEndpoints = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.appId, appId));
      const [retainedOriginalUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId));

      expect(finalRedaction.status).toBe("redacted");
      expect(redactedApp).toMatchObject({
        name: "Redacted managed app",
        websiteUrl: null,
        trackingOrigin: null,
        logoUrl: null,
        networkVisible: false,
        status: "disabled",
      });
      expect(redactedProgram).toMatchObject({
        name: "Redacted program",
        slug: `redacted-${programId}`,
        destinationUrl: "https://redacted.invalid/",
        status: "disabled",
        joinPageEnabled: false,
      });
      expect(redactedAffiliate).toMatchObject({ status: "disabled" });
      expect(redactedAffiliate.userId).not.toBe(userId);
      expect(redactedAffiliateUser).toMatchObject({
        name: null,
        emailVerified: false,
        primaryMode: "affiliate",
      });
      expect(redactedAffiliateUser.email).toMatch(
        /^redacted-usr_.+@redacted\.invalid$/
      );
      expect(retainedOriginalUser.email).toBe(`privacy-${suffix}@example.com`);
      expect(retainedCustomers).toHaveLength(2);
      expect(
        retainedCustomers.every(
          (customer) => !preFinalCustomerIds.includes(customer.id)
        )
      ).toBe(true);
      expect(
        retainedCustomers.every(
          (customer) =>
            customer.externalCustomerId === `redacted_${customer.id}`
            && customer.email === null
            && customer.redactedAt instanceof Date
        )
      ).toBe(true);
      expect(retainedReceipts).toHaveLength(0);
      expect(retainedClicks).toHaveLength(0);
      expect(retainedLinks).toHaveLength(0);
      expect(retainedWebhookDeliveries).toHaveLength(0);
      expect(retainedWebhookEndpoints).toHaveLength(0);
    }
    finally {
      const affiliateUsers = await db
        .select({ userId: programAffiliates.userId })
        .from(programAffiliates)
        .where(eq(programAffiliates.programId, programId));

      await db
        .delete(managedDataSubjectRedactions)
        .where(eq(managedDataSubjectRedactions.appId, appId));
      await db
        .delete(webhookDeliveries)
        .where(eq(webhookDeliveries.appId, appId));
      await db
        .delete(webhookEndpoints)
        .where(eq(webhookEndpoints.appId, appId));
      await db
        .delete(commissionEntries)
        .where(eq(commissionEntries.programId, programId));
      await db.delete(transactions).where(eq(transactions.appId, appId));
      await db.delete(referrals).where(eq(referrals.programId, programId));
      await db.delete(customers).where(eq(customers.appId, appId));
      await db.delete(clicks).where(eq(clicks.programId, programId));
      await db
        .delete(affiliateLinks)
        .where(eq(affiliateLinks.programId, programId));
      await db
        .delete(programAffiliates)
        .where(eq(programAffiliates.programId, programId));
      await db
        .delete(commissionRules)
        .where(eq(commissionRules.programId, programId));
      await db
        .delete(programTermsVersions)
        .where(eq(programTermsVersions.programId, programId));
      await db.delete(programs).where(eq(programs.id, programId));
      for (const affiliateUser of affiliateUsers) {
        await db.delete(users).where(eq(users.id, affiliateUser.userId));
      }
      await db.delete(users).where(eq(users.id, userId));
      await db
        .delete(appAgreementVersions)
        .where(eq(appAgreementVersions.appId, appId));
      await db.delete(apiKeys).where(eq(apiKeys.managedConnectionId, connectionId));
      await db
        .delete(managedConnections)
        .where(eq(managedConnections.id, connectionId));
      await db
        .delete(managedAccounts)
        .where(eq(managedAccounts.id, managedAccountId));
      await db.delete(apps).where(eq(apps.id, appId));
      await db
        .delete(organizations)
        .where(eq(organizations.id, organizationId));
    }
  });
});
