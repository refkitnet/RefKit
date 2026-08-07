import { timingSafeEqual } from "node:crypto";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  adminAuditLogs,
  affiliateLinks,
  affiliatePayoutDetails,
  affiliatePromotionCodes,
  apiKeys,
  appAgreementVersions,
  apps,
  clicks,
  commissionEntries,
  customers,
  managedAccounts,
  managedConnections,
  managedDataSubjectRedactions,
  organizations,
  payoutExecutions,
  payoutItems,
  payoutRequests,
  programAffiliates,
  programs,
  programTermsVersions,
  referrals,
  transactions,
  users,
  webhookDeliveries,
  webhookEndpoints,
  type ManagedConnection,
  type ManagedConnectionStatus,
} from "@/db/schema";
import {
  decryptManagedCredentialBundle,
  encryptManagedCredentialBundle,
  encryptPayoutDetails,
  hashApiKey,
} from "@/lib/crypto";
import { assertDeploymentCapability } from "@/lib/deployment";
import { AppError } from "@/lib/errors";
import { getServerEnv } from "@/lib/env";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { deleteStoredLogo } from "@/lib/logo-storage";
import { getTrackingOrigin } from "@/lib/tracking-origin";
import { buildRawKey } from "@/services/api-keys";
import { createInitialAppAgreement } from "@/services/apps/agreement";

type ManagedCredentialBundle = {
  managementKey: string;
  liveRevenueKey: string;
  testRevenueKey: string;
  credentialsAcknowledgementId: string;
  credentialsVersion: number;
};

type ProvisionManagedConnectionInput = {
  provider: string;
  externalAccountId: string;
  displayName: string;
  appName?: string;
  websiteUrl?: string;
  idempotencyKey: string;
};

function parseCredentialBundle(ciphertext: string): ManagedCredentialBundle {
  const parsed = JSON.parse(decryptManagedCredentialBundle(ciphertext)) as
    Partial<ManagedCredentialBundle>;

  if (
    typeof parsed.managementKey !== "string"
    || typeof parsed.liveRevenueKey !== "string"
    || typeof parsed.testRevenueKey !== "string"
    || typeof parsed.credentialsAcknowledgementId !== "string"
    || typeof parsed.credentialsVersion !== "number"
  ) {
    throw new Error("Invalid managed credential bundle.");
  }

  return parsed as ManagedCredentialBundle;
}

function serializeConnection(connection: ManagedConnection) {
  return {
    id: connection.id,
    managed_account_id: connection.managedAccountId,
    organization_id: connection.organizationId,
    app_id: connection.appId,
    provider: connection.provider,
    status: connection.status,
    credentials_version: connection.credentialsVersion,
    credentials_acknowledged_at:
      connection.credentialsAcknowledgedAt?.toISOString() ?? null,
    suspended_at: connection.suspendedAt?.toISOString() ?? null,
    uninstalled_at: connection.uninstalledAt?.toISOString() ?? null,
    redacted_at: connection.redactedAt?.toISOString() ?? null,
    created_at: connection.createdAt.toISOString(),
    updated_at: connection.updatedAt.toISOString(),
  };
}

async function issueCredentialBundle(input: {
  connectionId: string;
  managedAccountId: string;
  organizationId: string;
  appId: string;
  credentialsVersion: number;
  executor: DbExecutor;
}) {
  const management = buildRawKey("managed", false);
  const live = buildRawKey("app", false);
  const test = buildRawKey("app", true);
  const acknowledgementId = generateId("mack");

  await input.executor.insert(apiKeys).values([
    {
      id: generateId(ID_PREFIXES.apiKey),
      userId: null,
      managedAccountId: input.managedAccountId,
      managedConnectionId: input.connectionId,
      managedCredentialsVersion: input.credentialsVersion,
      organizationId: input.organizationId,
      appId: input.appId,
      kind: "managed",
      prefix: management.prefix,
      keyHash: hashApiKey(management.rawKey),
      name: "Managed administration key",
    },
    {
      id: generateId(ID_PREFIXES.apiKey),
      userId: null,
      managedAccountId: input.managedAccountId,
      managedConnectionId: input.connectionId,
      managedCredentialsVersion: input.credentialsVersion,
      organizationId: input.organizationId,
      appId: input.appId,
      kind: "app",
      prefix: live.prefix,
      keyHash: hashApiKey(live.rawKey),
      name: "Managed live revenue key",
    },
    {
      id: generateId(ID_PREFIXES.apiKey),
      userId: null,
      managedAccountId: input.managedAccountId,
      managedConnectionId: input.connectionId,
      managedCredentialsVersion: input.credentialsVersion,
      organizationId: input.organizationId,
      appId: input.appId,
      kind: "app",
      prefix: test.prefix,
      keyHash: hashApiKey(test.rawKey),
      name: "Managed test revenue key",
    },
  ]);

  const bundle: ManagedCredentialBundle = {
    managementKey: management.rawKey,
    liveRevenueKey: live.rawKey,
    testRevenueKey: test.rawKey,
    credentialsAcknowledgementId: acknowledgementId,
    credentialsVersion: input.credentialsVersion,
  };

  return {
    bundle,
    encrypted: encryptManagedCredentialBundle(JSON.stringify(bundle)),
  };
}

type ProvisioningMatch = {
  connection: ManagedConnection;
  kind: "idempotency" | "external_account" | "tracking_origin";
};

async function findConnectionForProvisioning(input: {
  provider: string;
  externalAccountId: string;
  idempotencyKey: string;
  websiteUrl?: string;
}): Promise<ProvisioningMatch | null> {
  const db = getDb();
  const [idempotentConnection] = await db
    .select()
    .from(managedConnections)
    .where(
      and(
        eq(managedConnections.provider, input.provider),
        eq(
          managedConnections.provisioningIdempotencyKey,
          input.idempotencyKey
        )
      )
    )
    .limit(1);

  if (idempotentConnection) {
    return {
      connection: idempotentConnection,
      kind: "idempotency",
    } satisfies ProvisioningMatch;
  }

  const [externalAccountConnection] = await db
    .select()
    .from(managedConnections)
    .where(
      and(
        eq(managedConnections.provider, input.provider),
        eq(managedConnections.externalAccountId, input.externalAccountId)
      )
    )
    .limit(1);

  if (externalAccountConnection) {
    return {
      connection: externalAccountConnection,
      kind: "external_account",
    } satisfies ProvisioningMatch;
  }

  const trackingOrigin = input.websiteUrl
    ? getTrackingOrigin(input.websiteUrl)
    : null;
  if (!trackingOrigin) return null;

  const [trackingOriginConnection] = await db
    .select({ connection: managedConnections })
    .from(managedConnections)
    .innerJoin(apps, eq(apps.id, managedConnections.appId))
    .where(
      and(
        eq(managedConnections.provider, input.provider),
        eq(apps.trackingOrigin, trackingOrigin)
      )
    )
    .limit(1);

  return trackingOriginConnection
    ? {
        connection: trackingOriginConnection.connection,
        kind: "tracking_origin",
      } satisfies ProvisioningMatch
    : null;
}

function assertProvisioningIdentity(
  connection: ManagedConnection,
  input: ProvisionManagedConnectionInput
) {
  if (
    connection.provider !== input.provider
    || connection.externalAccountId !== input.externalAccountId
  ) {
    throw new AppError(
      "conflict",
      "managed_idempotency_conflict",
      "This idempotency key was already used for another managed account.",
      409
    );
  }
}

function provisionResponse(connection: ManagedConnection, created: boolean) {
  const credentials = connection.pendingCredentialBundleEncrypted
    ? parseCredentialBundle(connection.pendingCredentialBundleEncrypted)
    : null;

  return {
    connection: serializeConnection(connection),
    credentials,
    created,
  };
}

async function provisionExistingConnection(
  input: ProvisionManagedConnectionInput,
  initialMatch: ProvisioningMatch
) {
  let { connection, kind } = initialMatch;

  while (true) {
    if (connection.status === "redacted") {
      throw new AppError(
        "conflict",
        "managed_connection_redacted",
        "This managed connection generation has been redacted.",
        409
      );
    }

    if (kind === "idempotency") {
      assertProvisioningIdentity(connection, input);
    }

    if (connection.provider !== input.provider) {
      throw new AppError(
        "conflict",
        "managed_idempotency_conflict",
        "This managed account belongs to another provider.",
        409
      );
    }

    if (connection.provisioningIdempotencyKey !== input.idempotencyKey) {
      return getDb().transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(managedConnections)
          .where(eq(managedConnections.id, connection.id))
          .for("update")
          .limit(1);

        if (!current || current.status === "redacted") {
          throw new AppError(
            "conflict",
            "managed_connection_redacted",
            "This managed connection generation has been redacted.",
            409
          );
        }

        let pendingCredentialBundleEncrypted =
          current.pendingCredentialBundleEncrypted;
        let credentialsAcknowledgementId =
          current.credentialsAcknowledgementId;
        let credentialsVersion = current.credentialsVersion;

        if (!pendingCredentialBundleEncrypted) {
          credentialsVersion += 1;
          const issued = await issueCredentialBundle({
            connectionId: current.id,
            managedAccountId: current.managedAccountId,
            organizationId: current.organizationId,
            appId: current.appId,
            credentialsVersion,
            executor: tx,
          });
          pendingCredentialBundleEncrypted = issued.encrypted;
          credentialsAcknowledgementId =
            issued.bundle.credentialsAcknowledgementId;
        }

        const [reprovisioned] = await tx
          .update(managedConnections)
          .set({
            provisioningIdempotencyKey: input.idempotencyKey,
            externalAccountId: input.externalAccountId,
            status: "active",
            credentialsVersion,
            credentialsAcknowledgementId,
            pendingCredentialBundleEncrypted,
            credentialsAcknowledgedAt: null,
            suspendedAt: null,
            uninstalledAt: null,
            updatedAt: new Date(),
          })
          .where(eq(managedConnections.id, current.id))
          .returning();

        return provisionResponse(reprovisioned, false);
      });
    }

    if (connection.status === "active") {
      return provisionResponse(connection, false);
    }

    const [reconnected] = await getDb()
      .update(managedConnections)
      .set({
        status: "active",
        suspendedAt: null,
        uninstalledAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(managedConnections.id, connection.id),
          inArray(managedConnections.status, ["suspended", "uninstalled"])
        )
      )
      .returning();

    if (reconnected) {
      return provisionResponse(reconnected, false);
    }

    const current = await findConnectionForProvisioning(input);

    if (!current) {
      throw new AppError(
        "internal",
        "managed_connection_provisioning_failed",
        "Could not complete managed connection provisioning.",
        500
      );
    }

    connection = current.connection;
    kind = current.kind;
  }
}

export async function provisionManagedConnection(
  input: ProvisionManagedConnectionInput
) {
  assertDeploymentCapability("managed_connections");

  const existing = await findConnectionForProvisioning(input);

  if (existing) {
    return provisionExistingConnection(input, existing);
  }

  const organizationId = generateId(ID_PREFIXES.organization);
  const appId = generateId(ID_PREFIXES.app);
  const managedAccountId = generateId(ID_PREFIXES.managedAccount);
  const connectionId = generateId(ID_PREFIXES.managedConnection);
  const trackingOrigin = input.websiteUrl
    ? getTrackingOrigin(input.websiteUrl)
    : null;
  const db = getDb();

  try {
    await db.transaction(async (tx) => {
      await tx.insert(organizations).values({
        id: organizationId,
        name: input.displayName,
      });

      await tx.insert(apps).values({
        id: appId,
        organizationId,
        name: input.appName ?? input.displayName,
        revenueSource: "api",
        websiteUrl: input.websiteUrl ?? null,
        trackingOrigin,
      });

      await tx.insert(managedAccounts).values({
        id: managedAccountId,
        organizationId,
        appId,
        displayName: input.displayName,
      });

      await tx.insert(managedConnections).values({
        id: connectionId,
        managedAccountId,
        organizationId,
        appId,
        provider: input.provider,
        provisioningIdempotencyKey: input.idempotencyKey,
        externalAccountId: input.externalAccountId,
      });

      const credentialResult = await issueCredentialBundle({
        connectionId,
        managedAccountId,
        organizationId,
        appId,
        credentialsVersion: 1,
        executor: tx,
      });

      await tx
        .update(managedConnections)
        .set({
          credentialsAcknowledgementId:
            credentialResult.bundle.credentialsAcknowledgementId,
          pendingCredentialBundleEncrypted: credentialResult.encrypted,
        })
        .where(eq(managedConnections.id, connectionId));

      await createInitialAppAgreement(
        {
          appId,
          appName: input.appName ?? input.displayName,
        },
        tx
      );
    });
  }
  catch (error) {
    const concurrent = await findConnectionForProvisioning(input);

    if (concurrent) {
      return provisionExistingConnection(input, concurrent);
    }

    throw error;
  }

  const [created] = await db
    .select()
    .from(managedConnections)
    .where(eq(managedConnections.id, connectionId))
    .limit(1);

  return provisionResponse(created, true);
}

export async function acknowledgeManagedCredentials(
  connectionId: string,
  acknowledgementId: string
) {
  assertDeploymentCapability("managed_connections");
  const db = getDb();

  return db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(managedConnections)
      .where(eq(managedConnections.id, connectionId))
      .for("update")
      .limit(1);

    if (!connection || connection.status === "redacted") {
      throw new AppError(
        "not_found",
        "managed_connection_not_found",
        "Managed connection not found.",
        404
      );
    }

    if (
      connection.credentialsAcknowledgementId !== acknowledgementId
    ) {
      throw new AppError(
        "not_found",
        "credential_acknowledgement_not_found",
        "Credential acknowledgement not found.",
        404
      );
    }

    if (connection.pendingCredentialBundleEncrypted) {
      await tx
        .update(apiKeys)
        .set({ revokedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(apiKeys.managedConnectionId, connection.id),
            lt(
              apiKeys.managedCredentialsVersion,
              connection.credentialsVersion
            ),
            isNull(apiKeys.revokedAt)
          )
        );

      const [acknowledged] = await tx
        .update(managedConnections)
        .set({
          pendingCredentialBundleEncrypted: null,
          credentialsAcknowledgedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(managedConnections.id, connection.id))
        .returning();

      return serializeConnection(acknowledged);
    }

    return serializeConnection(connection);
  });
}

export async function rotateManagedCredentials(connectionId: string) {
  assertDeploymentCapability("managed_connections");
  const db = getDb();

  return db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(managedConnections)
      .where(eq(managedConnections.id, connectionId))
      .for("update")
      .limit(1);

    if (!connection || connection.status === "redacted") {
      throw new AppError(
        "not_found",
        "managed_connection_not_found",
        "Managed connection not found.",
        404
      );
    }

    if (connection.pendingCredentialBundleEncrypted) {
      return {
        connection: serializeConnection(connection),
        credentials: parseCredentialBundle(
          connection.pendingCredentialBundleEncrypted
        ),
        rotated: false,
      };
    }

    const nextVersion = connection.credentialsVersion + 1;
    const issued = await issueCredentialBundle({
      connectionId: connection.id,
      managedAccountId: connection.managedAccountId,
      organizationId: connection.organizationId,
      appId: connection.appId,
      credentialsVersion: nextVersion,
      executor: tx,
    });

    const [updated] = await tx
      .update(managedConnections)
      .set({
        credentialsVersion: nextVersion,
        credentialsAcknowledgementId:
          issued.bundle.credentialsAcknowledgementId,
        pendingCredentialBundleEncrypted: issued.encrypted,
        credentialsAcknowledgedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(managedConnections.id, connection.id))
      .returning();

    return {
      connection: serializeConnection(updated),
      credentials: issued.bundle,
      rotated: true,
    };
  });
}

async function transitionManagedConnection(
  connectionId: string,
  from: ManagedConnectionStatus[],
  to: ManagedConnectionStatus
) {
  assertDeploymentCapability("managed_connections");
  const db = getDb();
  const now = new Date();
  const [connection] = await db
    .select()
    .from(managedConnections)
    .where(eq(managedConnections.id, connectionId))
    .limit(1);

  if (!connection || connection.status === "redacted") {
    throw new AppError(
      "not_found",
      "managed_connection_not_found",
      "Managed connection not found.",
      404
    );
  }

  if (connection.status === to) {
    return serializeConnection(connection);
  }

  if (!from.includes(connection.status)) {
    throw new AppError(
      "conflict",
      "invalid_managed_connection_transition",
      `Managed connection cannot transition from ${connection.status} to ${to}.`,
      409
    );
  }

  const [updated] = await db
    .update(managedConnections)
    .set({
      status: to,
      suspendedAt: to === "suspended" ? now : null,
      uninstalledAt: to === "uninstalled" ? now : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(managedConnections.id, connectionId),
        inArray(managedConnections.status, from)
      )
    )
    .returning();

  if (updated) {
    return serializeConnection(updated);
  }

  const [current] = await db
    .select()
    .from(managedConnections)
    .where(eq(managedConnections.id, connectionId))
    .limit(1);

  if (!current || current.status === "redacted") {
    throw new AppError(
      "not_found",
      "managed_connection_not_found",
      "Managed connection not found.",
      404
    );
  }

  if (current.status === to) {
    return serializeConnection(current);
  }

  throw new AppError(
    "conflict",
    "invalid_managed_connection_transition",
    `Managed connection cannot transition from ${current.status} to ${to}.`,
    409
  );
}

export function suspendManagedConnection(connectionId: string) {
  return transitionManagedConnection(connectionId, ["active"], "suspended");
}

export function reconnectManagedConnection(connectionId: string) {
  return transitionManagedConnection(
    connectionId,
    ["suspended", "uninstalled"],
    "active"
  );
}

export function uninstallManagedConnection(connectionId: string) {
  return transitionManagedConnection(
    connectionId,
    ["active", "suspended"],
    "uninstalled"
  );
}

async function redactManagedAppData(
  connection: ManagedConnection,
  now: Date,
  tx: DbExecutor
) {
  const programRows = await tx
    .select({ id: programs.id })
    .from(programs)
    .where(eq(programs.appId, connection.appId));
  const programIds = programRows.map((program) => program.id);
  const affiliateRows = programIds.length === 0
    ? []
    : await tx
        .select({ id: programAffiliates.id })
        .from(programAffiliates)
        .where(inArray(programAffiliates.programId, programIds));
  const programAffiliateIds = affiliateRows.map((affiliate) => affiliate.id);

  await tx
    .update(transactions)
    .set({ customerId: null, updatedAt: now })
    .where(eq(transactions.appId, connection.appId));

  if (programIds.length > 0) {
    await tx
      .update(commissionEntries)
      .set({
        customerId: null,
        approvedByUserId: null,
        approvalReason: null,
        updatedAt: now,
      })
      .where(inArray(commissionEntries.programId, programIds));

    await tx
      .update(referrals)
      .set({ clickId: null, updatedAt: now })
      .where(inArray(referrals.programId, programIds));

    await tx.delete(clicks).where(inArray(clicks.programId, programIds));
    await tx
      .delete(affiliateLinks)
      .where(inArray(affiliateLinks.programId, programIds));
    await tx
      .delete(affiliatePromotionCodes)
      .where(inArray(affiliatePromotionCodes.programId, programIds));
    await tx
      .update(programTermsVersions)
      .set({ publishedByUserId: null, updatedAt: now })
      .where(inArray(programTermsVersions.programId, programIds));
    await tx
      .update(payoutRequests)
      .set({ declineReason: null, updatedAt: now })
      .where(inArray(payoutRequests.programId, programIds));
    await tx
      .update(programs)
      .set({
        name: "Redacted program",
        slug: sql<string>`'redacted-' || ${programs.id}`,
        destinationUrl: "https://redacted.invalid/",
        status: "disabled",
        joinPageEnabled: false,
        updatedAt: now,
      })
      .where(inArray(programs.id, programIds));
  }

  if (programAffiliateIds.length > 0) {
    await tx
      .delete(affiliatePayoutDetails)
      .where(
        inArray(
          affiliatePayoutDetails.programAffiliateId,
          programAffiliateIds
        )
      );

    await tx
      .update(payoutItems)
      .set({
        payoutDetailsSnapshotEncrypted: null,
        externalReference: null,
        failureReason: null,
        updatedAt: now,
      })
      .where(inArray(payoutItems.programAffiliateId, programAffiliateIds));

    for (const affiliate of affiliateRows) {
      const replacementUserId = generateId(ID_PREFIXES.user);

      await tx.insert(users).values({
        id: replacementUserId,
        email: `redacted-${replacementUserId}@redacted.invalid`,
        name: null,
        emailVerified: false,
        primaryMode: "affiliate",
      });
      await tx
        .update(programAffiliates)
        .set({
          userId: replacementUserId,
          status: "disabled",
          updatedAt: now,
        })
        .where(eq(programAffiliates.id, affiliate.id));
    }
  }

  await tx
    .update(payoutExecutions)
    .set({
      method: "redacted",
      instructionSnapshotEncrypted: encryptPayoutDetails("{}"),
      externalReference: null,
      failureReason: null,
      lastIdempotencyKey: null,
      lastCallbackPayloadHash: null,
      updatedAt: now,
    })
    .where(eq(payoutExecutions.appId, connection.appId));

  const customerRows = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(eq(customers.appId, connection.appId));
  const referralCustomerRows = programIds.length === 0
    ? []
    : await tx
        .select({ customerId: referrals.customerId })
        .from(referrals)
        .where(inArray(referrals.programId, programIds));
  const referralCustomerIds = new Set(
    referralCustomerRows.map((referral) => referral.customerId)
  );

  for (const customer of customerRows) {
    if (referralCustomerIds.has(customer.id)) {
      const replacementCustomerId = generateId(ID_PREFIXES.customer);

      await tx.insert(customers).values({
        id: replacementCustomerId,
        appId: connection.appId,
        externalCustomerId: `redacted_${replacementCustomerId}`,
        redactedAt: now,
      });
      await tx
        .update(referrals)
        .set({ customerId: replacementCustomerId, updatedAt: now })
        .where(eq(referrals.customerId, customer.id));
    }

    await tx.delete(customers).where(eq(customers.id, customer.id));
  }

  await tx
    .delete(managedDataSubjectRedactions)
    .where(eq(managedDataSubjectRedactions.appId, connection.appId));
  await tx
    .delete(webhookDeliveries)
    .where(eq(webhookDeliveries.appId, connection.appId));
  await tx
    .delete(webhookEndpoints)
    .where(eq(webhookEndpoints.appId, connection.appId));
  await tx
    .update(adminAuditLogs)
    .set({ metadata: null, updatedAt: now })
    .where(eq(adminAuditLogs.managedAccountId, connection.managedAccountId));
}

export async function redactManagedConnection(connectionId: string) {
  assertDeploymentCapability("managed_connections");
  const db = getDb();

  const result = await db.transaction(async (tx) => {
    const [connection] = await tx
      .select()
      .from(managedConnections)
      .where(eq(managedConnections.id, connectionId))
      .for("update")
      .limit(1);

    if (!connection) {
      throw new AppError(
        "not_found",
        "managed_connection_not_found",
        "Managed connection not found.",
        404
      );
    }

    const [appState] = await tx
      .select({ logoUrl: apps.logoUrl })
      .from(apps)
      .where(eq(apps.id, connection.appId))
      .limit(1);

    if (connection.status === "redacted") {
      return {
        connection: serializeConnection(connection),
        logoUrl: appState?.logoUrl ?? null,
      };
    }

    const now = new Date();

    await redactManagedAppData(connection, now, tx);

    await tx
      .update(apiKeys)
      .set({ revokedAt: now, updatedAt: now })
      .where(
        and(
          eq(apiKeys.managedConnectionId, connection.id),
          isNull(apiKeys.revokedAt)
        )
      );

    await tx
      .update(managedAccounts)
      .set({
        displayName: "Redacted managed account",
        status: "redacted",
        redactedAt: now,
        updatedAt: now,
      })
      .where(eq(managedAccounts.id, connection.managedAccountId));

    await tx
      .update(apps)
      .set({
        name: "Redacted managed app",
        websiteUrl: null,
        trackingOrigin: null,
        logoUrl: null,
        networkVisible: false,
        status: "disabled",
        integrationIssue: null,
        integrationIssueAt: null,
        updatedAt: now,
      })
      .where(eq(apps.id, connection.appId));

    await tx
      .update(organizations)
      .set({ name: "Redacted managed organization", updatedAt: now })
      .where(eq(organizations.id, connection.organizationId));

    await tx
      .update(appAgreementVersions)
      .set({
        termsText: "Redacted managed app agreement.",
        publishedByUserId: null,
        updatedAt: now,
      })
      .where(eq(appAgreementVersions.appId, connection.appId));

    const [redacted] = await tx
      .update(managedConnections)
      .set({
        externalAccountId: null,
        status: "redacted",
        credentialsAcknowledgementId: null,
        pendingCredentialBundleEncrypted: null,
        redactedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(managedConnections.id, connection.id),
          inArray(managedConnections.status, [
            "active",
            "suspended",
            "uninstalled",
          ])
        )
      )
      .returning();

    if (!redacted) {
      throw new AppError(
        "not_found",
        "managed_connection_not_found",
        "Managed connection not found.",
        404
      );
    }

    return {
      connection: serializeConnection(redacted),
      logoUrl: appState?.logoUrl ?? null,
    };
  });

  if (result.logoUrl) {
    await deleteStoredLogo(result.logoUrl);
  }

  return result.connection;
}

export async function getManagedConnectionForApiKey(keyId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      connection: managedConnections,
      accountStatus: managedAccounts.status,
    })
    .from(apiKeys)
    .innerJoin(
      managedConnections,
      eq(managedConnections.id, apiKeys.managedConnectionId)
    )
    .innerJoin(
      managedAccounts,
      eq(managedAccounts.id, managedConnections.managedAccountId)
    )
    .where(eq(apiKeys.id, keyId))
    .limit(1);

  return row ?? null;
}

export async function requireManagedConnectionAccess(
  managedAccountId: string,
  connectionId: string
) {
  assertDeploymentCapability("managed_connections");
  const db = getDb();
  const [connection] = await db
    .select()
    .from(managedConnections)
    .where(
      and(
        eq(managedConnections.id, connectionId),
        eq(managedConnections.managedAccountId, managedAccountId)
      )
    )
    .limit(1);

  if (!connection || connection.status === "redacted") {
    throw new AppError(
      "not_found",
      "managed_connection_not_found",
      "Managed connection not found.",
      404
    );
  }

  return connection;
}

export function requireManagedProvisioningSecret(request: Request) {
  assertDeploymentCapability("managed_connections");
  const configured = getServerEnv().MANAGED_CONNECTIONS_PROVISIONING_SECRET;
  const authorization = request.headers.get("authorization");
  const provided = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!configured || !provided) {
    throw new AppError(
      "unauthorized",
      "invalid_managed_provisioning_secret",
      "Invalid managed provisioning credentials.",
      401
    );
  }

  const configuredBytes = Buffer.from(configured);
  const providedBytes = Buffer.from(provided);

  if (
    configuredBytes.length !== providedBytes.length
    || !timingSafeEqual(configuredBytes, providedBytes)
  ) {
    throw new AppError(
      "unauthorized",
      "invalid_managed_provisioning_secret",
      "Invalid managed provisioning credentials.",
      401
    );
  }
}
