import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  apiKeys,
  appAgreementVersions,
  apps,
  affiliateLinks,
  commissionRules,
  customers,
  managedAccounts,
  managedConnections,
  organizations,
  programAffiliates,
  programs,
  programTermsVersions,
  users,
} from "@/db/schema";
import { GET as getCommissions } from "@/app/api/v1/commissions/route";
import { GET as getPayoutBatches } from "@/app/api/v1/payout-batches/route";
import { POST as markAffiliatePayoutPaid } from "@/app/api/v1/payout-batches/[id]/affiliates/[programAffiliateId]/mark-paid/route";
import { GET as getPayoutBatchCsv } from "@/app/api/v1/payout-batches/[id]/csv/route";
import { GET as getPayoutBatchItems } from "@/app/api/v1/payout-batches/[id]/items/route";
import { POST as markPayoutBatchPaid } from "@/app/api/v1/payout-batches/[id]/mark-paid/route";
import { POST as markReadyPayoutPaid } from "@/app/api/v1/ready-payouts/[programAffiliateId]/mark-paid/route";
import { GET as getReferrals } from "@/app/api/v1/referrals/route";
import {
  requireAppKey,
  requireManagedKey,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { DELETE as deleteManagedConnection } from "@/app/api/v1/managed-connections/[id]/route";
import { sha256 } from "@/lib/crypto";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import {
  exportManagedCustomerData,
  redactManagedCustomerData,
} from "@/services/managed-data-subjects";
import {
  acknowledgeManagedCredentials,
  provisionManagedConnection,
  reconnectManagedConnection,
  redactManagedConnection,
  rotateManagedCredentials,
  suspendManagedConnection,
  uninstallManagedConnection,
} from "@/services/managed-connections";
import { captureAffiliateClick } from "@/services/clicks";
import {
  getPublicJoinPageContext,
  joinProgramViaPublicPage,
} from "@/services/affiliates/join";
import { getCurrentAppAgreement } from "@/services/apps/agreement";
import { createProgram } from "@/services/programs";

describe("managed connection lifecycle", () => {
  const connectionIds: string[] = [];
  const managedAccountIds: string[] = [];
  const appIds: string[] = [];
  const organizationIds: string[] = [];
  const customerIds: string[] = [];
  const programIds: string[] = [];
  const affiliateUserIds: string[] = [];

  afterAll(async () => {
    const db = getDb();

    for (const customerId of customerIds) {
      await db.delete(customers).where(eq(customers.id, customerId));
    }

    for (const programId of programIds) {
      await db.delete(affiliateLinks).where(eq(affiliateLinks.programId, programId));
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
    }

    for (const userId of affiliateUserIds) {
      await db.delete(users).where(eq(users.id, userId));
    }

    for (const connectionId of connectionIds) {
      await db.delete(apiKeys).where(eq(apiKeys.managedConnectionId, connectionId));
      await db
        .delete(managedConnections)
        .where(eq(managedConnections.id, connectionId));
    }

    for (const appId of appIds) {
      await db.delete(customers).where(eq(customers.appId, appId));
    }

    for (const appId of appIds) {
      await db
        .delete(appAgreementVersions)
        .where(eq(appAgreementVersions.appId, appId));
    }

    for (const managedAccountId of managedAccountIds) {
      await db
        .delete(managedAccounts)
        .where(eq(managedAccounts.id, managedAccountId));
    }

    for (const appId of appIds) {
      await db.delete(apps).where(eq(apps.id, appId));
    }

    for (const organizationId of organizationIds) {
      await db
        .delete(organizations)
        .where(eq(organizations.id, organizationId));
    }
  });

  it("provisions, acknowledges, rotates, gates, and redacts credentials", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const externalAccountId = sha256(`provider-account-${suffix}`);
    const input = {
      provider: "example_provider",
      externalAccountId,
      displayName: "Managed Test Account",
      idempotencyKey: `install-generation-${suffix}`,
    };
    const first = await provisionManagedConnection(input);

    connectionIds.push(first.connection.id);
    managedAccountIds.push(first.connection.managed_account_id);
    appIds.push(first.connection.app_id);
    organizationIds.push(first.connection.organization_id);

    expect(first.created).toBe(true);
    expect(first.credentials?.managementKey).toMatch(/^rk_managed_/);
    expect(first.credentials?.liveRevenueKey).toMatch(/^rk_app_/);
    expect(first.credentials?.testRevenueKey).toMatch(/^rk_test_app_/);

    const replay = await provisionManagedConnection(input);
    expect(replay.created).toBe(false);
    expect(replay.connection.id).toBe(first.connection.id);
    expect(replay.credentials).toEqual(first.credentials);

    const managementKey = first.credentials!.managementKey;
    const liveRevenueKey = first.credentials!.liveRevenueKey;
    const managedRequest = new Request("http://refkit.test/v1/programs", {
      headers: { authorization: `Bearer ${managementKey}` },
    });

    await expect(requireManagedKey(managedRequest)).resolves.toMatchObject({
      connectionId: first.connection.id,
    });
    await expect(requireOwnerAuth(managedRequest)).resolves.toMatchObject({
      type: "managed_key",
    });
    await expect(requireAppKey(managedRequest)).rejects.toMatchObject({
      code: "app_key_required",
    });

    const customerId = generateId(ID_PREFIXES.customer);
    const externalCustomerId = sha256(`customer-${suffix}`);
    customerIds.push(customerId);
    await getDb().insert(customers).values({
      id: customerId,
      appId: first.connection.app_id,
      externalCustomerId,
    });
    await expect(
      exportManagedCustomerData(
        first.connection.managed_account_id,
        first.connection.app_id,
        externalCustomerId
      )
    ).resolves.toMatchObject({ customer: { id: customerId } });
    const customerRedaction = await redactManagedCustomerData(
      first.connection.managed_account_id,
      first.connection.app_id,
      externalCustomerId
    );
    expect(customerRedaction).toMatchObject({
      customer_id: customerId,
      redacted: true,
    });
    await expect(
      redactManagedCustomerData(
        first.connection.managed_account_id,
        first.connection.app_id,
        externalCustomerId
      )
    ).resolves.toEqual(customerRedaction);
    await expect(
      exportManagedCustomerData(
        first.connection.managed_account_id,
        first.connection.app_id,
        externalCustomerId
      )
    ).rejects.toMatchObject({ code: "customer_not_found" });

    await acknowledgeManagedCredentials(
      first.connection.id,
      first.credentials!.credentialsAcknowledgementId
    );
    const acknowledgedReplay = await provisionManagedConnection(input);
    expect(acknowledgedReplay.credentials).toBeNull();

    await suspendManagedConnection(first.connection.id);
    await expect(requireManagedKey(managedRequest)).resolves.toMatchObject({
      type: "managed_key",
    });
    await expect(requireOwnerAuth(managedRequest)).rejects.toMatchObject({
      code: "managed_connection_inactive",
    });
    await expect(
      requireAppKey(
        new Request("http://refkit.test/v1/identify", {
          headers: { authorization: `Bearer ${liveRevenueKey}` },
        })
      )
    ).rejects.toMatchObject({ code: "managed_connection_inactive" });

    await reconnectManagedConnection(first.connection.id);
    await expect(requireOwnerAuth(managedRequest)).resolves.toMatchObject({
      type: "managed_key",
    });

    const rotation = await rotateManagedCredentials(first.connection.id);
    expect(rotation.rotated).toBe(true);
    expect(rotation.credentials.managementKey).not.toBe(managementKey);

    await acknowledgeManagedCredentials(
      first.connection.id,
      rotation.credentials.credentialsAcknowledgementId
    );
    await expect(requireManagedKey(managedRequest)).rejects.toMatchObject({
      code: "invalid_api_key",
    });
    await expect(
      requireManagedKey(
        new Request("http://refkit.test/v1/programs", {
          headers: {
            authorization: `Bearer ${rotation.credentials.managementKey}`,
          },
        })
      )
    ).resolves.toMatchObject({ connectionId: first.connection.id });

    const nextGeneration = await provisionManagedConnection({
      ...input,
      idempotencyKey: `install-generation-next-${suffix}`,
    });
    expect(nextGeneration.connection.id).toBe(first.connection.id);
    expect(nextGeneration.connection.app_id).toBe(first.connection.app_id);
    expect(nextGeneration.credentials?.managementKey).not.toBe(
      rotation.credentials.managementKey
    );
    await acknowledgeManagedCredentials(
      nextGeneration.connection.id,
      nextGeneration.credentials!.credentialsAcknowledgementId
    );

    const otherConnection = await provisionManagedConnection({
      provider: "example_provider",
      externalAccountId: sha256(`other-provider-account-${suffix}`),
      displayName: "Other managed account",
      idempotencyKey: `other-install-generation-${suffix}`,
    });
    connectionIds.push(otherConnection.connection.id);
    managedAccountIds.push(otherConnection.connection.managed_account_id);
    appIds.push(otherConnection.connection.app_id);
    organizationIds.push(otherConnection.connection.organization_id);

    await uninstallManagedConnection(first.connection.id);
    const deleteRequest = new Request(
      `http://refkit.test/v1/managed-connections/${first.connection.id}`,
      {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${nextGeneration.credentials!.managementKey}`,
        },
      }
    );
    const deleteContext = {
      params: Promise.resolve({ id: first.connection.id }),
    };
    const deletedResponse = await deleteManagedConnection(
      deleteRequest,
      deleteContext
    );
    const deleted = await deletedResponse.json();

    expect(deletedResponse.status).toBe(200);
    expect(deleted).toMatchObject({ status: "redacted" });

    const replayResponse = await deleteManagedConnection(
      deleteRequest,
      deleteContext
    );
    const replayed = await replayResponse.json();

    expect(replayResponse.status).toBe(200);
    expect(replayed.redacted_at).toBe(deleted.redacted_at);

    const serviceReplay = await redactManagedConnection(first.connection.id);
    expect(serviceReplay.redacted_at).toBe(deleted.redacted_at);

    const wrongConnectionResponse = await deleteManagedConnection(
      new Request(
        `http://refkit.test/v1/managed-connections/${first.connection.id}`,
        {
          method: "DELETE",
          headers: {
            authorization:
              `Bearer ${otherConnection.credentials!.managementKey}`,
          },
        }
      ),
      deleteContext
    );
    expect(wrongConnectionResponse.status).toBe(401);

    await expect(
      requireManagedKey(
        new Request("http://refkit.test/v1/programs", {
          headers: {
            authorization: `Bearer ${rotation.credentials.managementKey}`,
          },
        })
      )
    ).rejects.toMatchObject({ code: "invalid_api_key" });
  });

  it("scopes provisioning idempotency by provider and rejects conflicting replays", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const idempotencyKey = `shared-provider-install-${suffix}`;
    const provider = "collision_provider";
    const firstExternalAccountId = sha256(`first-${suffix}`);
    const secondExternalAccountId = sha256(`second-${suffix}`);

    const results = await Promise.allSettled([
      provisionManagedConnection({
        provider,
        externalAccountId: firstExternalAccountId,
        displayName: "First collision account",
        idempotencyKey,
      }),
      provisionManagedConnection({
        provider,
        externalAccountId: secondExternalAccountId,
        displayName: "Second collision account",
        idempotencyKey,
      }),
    ]);

    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<
        Awaited<ReturnType<typeof provisionManagedConnection>>
      > => result.status === "fulfilled"
    );
    const rejected = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    );

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toMatchObject({
      code: "managed_idempotency_conflict",
    });

    const winner = fulfilled[0]!.value;
    connectionIds.push(winner.connection.id);
    managedAccountIds.push(winner.connection.managed_account_id);
    appIds.push(winner.connection.app_id);
    organizationIds.push(winner.connection.organization_id);

    const otherProvider = await provisionManagedConnection({
      provider: "other_collision_provider",
      externalAccountId: sha256(`other-provider-${suffix}`),
      displayName: "Other provider account",
      idempotencyKey,
    });

    connectionIds.push(otherProvider.connection.id);
    managedAccountIds.push(otherProvider.connection.managed_account_id);
    appIds.push(otherProvider.connection.app_id);
    organizationIds.push(otherProvider.connection.organization_id);

    expect(otherProvider.created).toBe(true);
    expect(otherProvider.connection.id).not.toBe(winner.connection.id);
    expect(otherProvider.credentials?.managementKey).not.toBe(
      winner.credentials?.managementKey
    );
  });

  it("serializes concurrent provisioning for the same managed store", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const websiteUrl = `https://managed-${sha256(suffix).slice(0, 16)}.example.com`;

    const [first, second] = await Promise.all([
      provisionManagedConnection({
        provider: "store_provider",
        externalAccountId: sha256(`legacy-generation-${suffix}`),
        displayName: "Concurrent managed store",
        websiteUrl,
        idempotencyKey: `concurrent-install-first-${suffix}`,
      }),
      provisionManagedConnection({
        provider: "store_provider",
        externalAccountId: sha256(`stable-store-${suffix}`),
        displayName: "Concurrent managed store",
        websiteUrl,
        idempotencyKey: `concurrent-install-second-${suffix}`,
      }),
    ]);

    connectionIds.push(first.connection.id);
    managedAccountIds.push(first.connection.managed_account_id);
    appIds.push(first.connection.app_id);
    organizationIds.push(first.connection.organization_id);

    expect(second.connection.id).toBe(first.connection.id);
    expect(second.connection.app_id).toBe(first.connection.app_id);
    expect(second.connection.organization_id).toBe(
      first.connection.organization_id
    );
    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(second.credentials?.managementKey).toBe(
      first.credentials?.managementKey
    );
  });

  it("keeps redaction terminal when provisioning races with the lifecycle", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const input = {
      provider: "redaction-race-provider",
      externalAccountId: sha256(`redaction-race-${suffix}`),
      displayName: "Redaction race account",
      idempotencyKey: `redaction-race-install-${suffix}`,
    };
    const provisioned = await provisionManagedConnection(input);

    connectionIds.push(provisioned.connection.id);
    managedAccountIds.push(provisioned.connection.managed_account_id);
    appIds.push(provisioned.connection.app_id);
    organizationIds.push(provisioned.connection.organization_id);

    await suspendManagedConnection(provisioned.connection.id);

    const [, redaction] = await Promise.allSettled([
      provisionManagedConnection(input),
      redactManagedConnection(provisioned.connection.id),
    ]);

    expect(redaction).toMatchObject({ status: "fulfilled" });

    const [connection] = await getDb()
      .select({ status: managedConnections.status })
      .from(managedConnections)
      .where(eq(managedConnections.id, provisioned.connection.id))
      .limit(1);

    expect(connection?.status).toBe("redacted");
    await expect(provisionManagedConnection(input)).rejects.toMatchObject({
      code: "managed_connection_redacted",
    });
  });

  it("blocks suspended and uninstalled managed keys from mixed-auth reads", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const provisioned = await provisionManagedConnection({
      provider: "read-gate-provider",
      externalAccountId: sha256(`read-gate-${suffix}`),
      displayName: "Read gate account",
      idempotencyKey: `read-gate-install-${suffix}`,
    });

    connectionIds.push(provisioned.connection.id);
    managedAccountIds.push(provisioned.connection.managed_account_id);
    appIds.push(provisioned.connection.app_id);
    organizationIds.push(provisioned.connection.organization_id);

    const managedKey = provisioned.credentials!.managementKey;
    const inactiveOwnerResponses = () => [
      getReferrals(
        new Request(
          `http://refkit.test/v1/referrals?app_id=${provisioned.connection.app_id}`,
          { headers: { authorization: `Bearer ${managedKey}` } }
        )
      ),
      getCommissions(
        new Request(
          `http://refkit.test/v1/commissions?app_id=${provisioned.connection.app_id}`,
          { headers: { authorization: `Bearer ${managedKey}` } }
        )
      ),
      getPayoutBatches(
        new Request(
          `http://refkit.test/v1/payout-batches?app_id=${provisioned.connection.app_id}`,
          { headers: { authorization: `Bearer ${managedKey}` } }
        )
      ),
      getPayoutBatchCsv(
        new Request(
          "http://refkit.test/v1/payout-batches/prun_missing/csv",
          { headers: { authorization: `Bearer ${managedKey}` } }
        ),
        { params: Promise.resolve({ id: "prun_missing" }) }
      ),
      getPayoutBatchItems(
        new Request(
          "http://refkit.test/v1/payout-batches/prun_missing/items",
          { headers: { authorization: `Bearer ${managedKey}` } }
        ),
        { params: Promise.resolve({ id: "prun_missing" }) }
      ),
      markPayoutBatchPaid(
        new Request("http://refkit.test/v1/payout-batches/prun_missing/mark-paid", {
          method: "POST",
          headers: { authorization: `Bearer ${managedKey}` },
        }),
        { params: Promise.resolve({ id: "prun_missing" }) }
      ),
      markAffiliatePayoutPaid(
        new Request(
          "http://refkit.test/v1/payout-batches/prun_missing/affiliates/aff_missing/mark-paid",
          {
            method: "POST",
            headers: { authorization: `Bearer ${managedKey}` },
          }
        ),
        {
          params: Promise.resolve({
            id: "prun_missing",
            programAffiliateId: "aff_missing",
          }),
        }
      ),
      markReadyPayoutPaid(
        new Request(
          "http://refkit.test/v1/ready-payouts/aff_missing/mark-paid",
          {
            method: "POST",
            headers: { authorization: `Bearer ${managedKey}` },
          }
        ),
        { params: Promise.resolve({ programAffiliateId: "aff_missing" }) }
      ),
    ];

    await suspendManagedConnection(provisioned.connection.id);

    for (const response of await Promise.all(inactiveOwnerResponses())) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "managed_connection_inactive" },
      });
    }

    await uninstallManagedConnection(provisioned.connection.id);

    for (const response of await Promise.all(inactiveOwnerResponses())) {
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "managed_connection_inactive" },
      });
    }
  });

  it("stops public capture and hosted join after uninstall", async () => {
    const suffix = `${Date.now()}-${Math.random()}`;
    const provisioned = await provisionManagedConnection({
      provider: "public-gate-provider",
      externalAccountId: sha256(`public-gate-${suffix}`),
      displayName: "Public gate account",
      appName: "Public gate app",
      websiteUrl: `https://public-gate-${suffix}.example.com`,
      idempotencyKey: `public-gate-install-${suffix}`,
    });

    connectionIds.push(provisioned.connection.id);
    managedAccountIds.push(provisioned.connection.managed_account_id);
    appIds.push(provisioned.connection.app_id);
    organizationIds.push(provisioned.connection.organization_id);

    const program = await createProgram(
      provisioned.connection.managed_account_id,
      {
        appId: provisioned.connection.app_id,
        name: "Public gate program",
        slug: `public-gate-${suffix}`,
        currency: "usd",
        destinationUrl: `https://public-gate-${suffix}.example.com`,
        commissionRule: {
          rewardType: "percent",
          percentValue: 20,
          recurringDurationMonths: null,
        },
      }
    );
    programIds.push(program.program.id);

    const affiliateUserId = generateId(ID_PREFIXES.user);
    const programAffiliateId = generateId(ID_PREFIXES.affiliate);
    const linkCode = `publicgate${suffix.replace(/[^a-z0-9]/gi, "")}`
      .slice(0, 60)
      .toLowerCase();
    affiliateUserIds.push(affiliateUserId);

    await getDb().transaction(async (tx) => {
      await tx.insert(users).values({
        id: affiliateUserId,
        email: `public-gate-${suffix}@refkit-vitest.test`,
        name: "Public gate affiliate",
      });
      await tx
        .update(programs)
        .set({ joinPageEnabled: true })
        .where(eq(programs.id, program.program.id));
      await tx.insert(programAffiliates).values({
        id: programAffiliateId,
        programId: program.program.id,
        userId: affiliateUserId,
        status: "active",
      });
      await tx.insert(affiliateLinks).values({
        id: generateId(ID_PREFIXES.link),
        appId: provisioned.connection.app_id,
        programAffiliateId,
        programId: program.program.id,
        linkCode,
        label: "Public gate link",
      });
    });

    const agreement = await getCurrentAppAgreement(
      provisioned.connection.app_id
    );
    expect(agreement).not.toBeNull();

    await uninstallManagedConnection(provisioned.connection.id);

    await expect(
      captureAffiliateClick({
        via: linkCode,
        refkitAppId: provisioned.connection.app_id,
        ip: "203.0.113.231",
        userAgent: "managed-uninstall-test",
      })
    ).rejects.toMatchObject({ code: "affiliate_link_not_found" });

    await expect(
      getPublicJoinPageContext(program.program.slug)
    ).rejects.toMatchObject({ code: "program_not_found" });
    await expect(
      joinProgramViaPublicPage({
        programSlug: program.program.slug,
        email: `blocked-join-${suffix}@refkit-vitest.test`,
        name: "Blocked join",
        appAgreementVersionId: agreement!.id,
      })
    ).rejects.toMatchObject({ code: "program_not_found" });
  });
});
