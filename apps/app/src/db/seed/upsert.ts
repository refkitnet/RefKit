import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  accounts,
  affiliatePayoutDetails,
  affiliateLinks,
  apiKeys,
  appAgreementVersions,
  apps,
  clicks,
  commissionRules,
  programTermsVersions,
  customers,
  organizationMembers,
  organizations,
  payoutItems,
  payoutRequestItems,
  payoutRequests,
  payoutBatches,
  programAffiliates,
  programs,
  referrals,
  sessions,
  users,
} from "@/db/schema";
import { defaultAppAgreement } from "@/lib/compliance-copy";
import {
  encryptPayoutDetails,
  encryptTestApiKey,
  hashApiKey,
} from "@/lib/crypto";

type SeedUserInput = {
  id: string;
  email: string;
  name: string;
  isAdmin?: boolean;
};

async function removeUserIfPresent(userId: string) {
  const db = getDb();

  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(accounts).where(eq(accounts.userId, userId));
  await db
    .delete(organizationMembers)
    .where(eq(organizationMembers.userId, userId));
  await db.delete(apiKeys).where(eq(apiKeys.userId, userId));
  await db.delete(programAffiliates).where(eq(programAffiliates.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

export async function upsertSeedUser(input: SeedUserInput) {
  const db = getDb();
  const email = input.email.trim().toLowerCase();

  const [existingByEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existingByEmail && existingByEmail.id !== input.id) {
    await removeUserIfPresent(existingByEmail.id);
  }

  await db
    .insert(users)
    .values({
      id: input.id,
      email,
      name: input.name,
      isAdmin: input.isAdmin ?? false,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email,
        name: input.name,
        isAdmin: input.isAdmin ?? false,
        emailVerified: true,
        updatedAt: new Date(),
      },
    });
}

export async function upsertSeedOrganization(input: {
  id: string;
  name: string;
  ownerId: string;
}) {
  const db = getDb();

  await db
    .insert(organizations)
    .values({
      id: input.id,
      name: input.name,
    })
    .onConflictDoUpdate({
      target: organizations.id,
      set: {
        name: input.name,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(organizationMembers)
    .values({
      id: `mem_${input.id}`,
      organizationId: input.id,
      userId: input.ownerId,
      role: "owner",
    })
    .onConflictDoUpdate({
      target: organizationMembers.id,
      set: {
        userId: input.ownerId,
        role: "owner",
        updatedAt: new Date(),
      },
    });
}

export async function upsertSeedApp(input: {
  id: string;
  organizationId: string;
  name: string;
  revenueSource: "stripe" | "api";
  destinationUrl: string;
}) {
  const db = getDb();

  const trackingOrigin = new URL(input.destinationUrl).origin;

  await db
    .insert(apps)
    .values({
      id: input.id,
      organizationId: input.organizationId,
      name: input.name,
      revenueSource: input.revenueSource,
      websiteUrl: input.destinationUrl,
      trackingOrigin,
      status: "active",
    })
    .onConflictDoUpdate({
      target: apps.id,
      set: {
        name: input.name,
        revenueSource: input.revenueSource,
        websiteUrl: input.destinationUrl,
        trackingOrigin,
        status: "active",
        updatedAt: new Date(),
      },
    });

  await db
    .insert(appAgreementVersions)
    .values({
      id: `${input.id}_agreement_v1`,
      appId: input.id,
      versionNumber: 1,
      termsText: defaultAppAgreement(input.name),
      publishedByUserId: null,
    })
    .onConflictDoNothing();
}

type ProgramOptions = {
  joinPageEnabled?: boolean;
  joinPageApproval?: string;
  minimumPayoutAmount?: number;
  supportedPayoutMethods?: string[];
};

export async function upsertSeedProgram(input: {
  id: string;
  appId: string;
  name: string;
  slug: string;
  currency: string;
  destinationUrl: string;
  ruleId: string;
  options?: ProgramOptions;
}) {
  const db = getDb();
  const options = input.options ?? {};

  const [existingDefault] = await db
    .select({ id: programs.id })
    .from(programs)
    .where(and(eq(programs.appId, input.appId), eq(programs.isDefault, true)))
    .limit(1);

  const isDefault = !existingDefault || existingDefault.id === input.id;

  await db
    .insert(programs)
    .values({
      id: input.id,
      appId: input.appId,
      name: input.name,
      slug: input.slug,
      currency: input.currency,
      destinationUrl: input.destinationUrl,
      status: "active",
      accessMode: "private",
      isDefault,
      joinPageEnabled: options.joinPageEnabled ?? false,
      joinPageApproval: options.joinPageApproval ?? "active",
      minimumPayoutAmount: options.minimumPayoutAmount ?? 5000,
      supportedPayoutMethods: options.supportedPayoutMethods ?? ["paypal"],
    })
    .onConflictDoUpdate({
      target: programs.id,
      set: {
        name: input.name,
        destinationUrl: input.destinationUrl,
        isDefault,
        joinPageEnabled: options.joinPageEnabled ?? false,
        joinPageApproval: options.joinPageApproval ?? "active",
        minimumPayoutAmount: options.minimumPayoutAmount ?? 5000,
        supportedPayoutMethods: options.supportedPayoutMethods ?? ["paypal"],
        updatedAt: new Date(),
      },
    });

  await db
    .insert(programTermsVersions)
    .values({
      id: `${input.id}_terms_v1`,
      programId: input.id,
      versionNumber: 1,
      rewardType: "percent",
      percentValue: "20",
      publishedByUserId: null,
    })
    .onConflictDoNothing();

  await db
    .insert(commissionRules)
    .values({
      id: input.ruleId,
      programId: input.id,
      termsVersionId: `${input.id}_terms_v1`,
      rewardType: "percent",
      percentValue: "20",
      isDefault: true,
      isActive: true,
    })
    .onConflictDoNothing();
}

export async function upsertSeedApiKey(input: {
  id: string;
  userId: string;
  organizationId: string;
  appId: string;
  name: string;
  rawKey: string;
}) {
  const db = getDb();
  const testMode = input.rawKey.startsWith("rk_test_app_");
  const prefix = testMode ? "rk_test_app_" : "rk_app_";
  const encryptedTestKey = testMode ? encryptTestApiKey(input.rawKey) : null;

  await db
    .insert(apiKeys)
    .values({
      id: input.id,
      userId: input.userId,
      organizationId: input.organizationId,
      appId: input.appId,
      kind: "app",
      prefix,
      keyHash: hashApiKey(input.rawKey),
      testKey: null,
      testKeyEncrypted: encryptedTestKey,
      name: input.name,
    })
    .onConflictDoUpdate({
      target: apiKeys.id,
      set: {
        prefix,
        keyHash: hashApiKey(input.rawKey),
        testKey: null,
        testKeyEncrypted: encryptedTestKey,
        name: input.name,
        revokedAt: null,
        updatedAt: new Date(),
      },
    });
}

export async function upsertSeedAffiliate(input: {
  id: string;
  programId: string;
  userId: string;
  linkCode: string;
  linkId: string;
  status: "active" | "pending" | "disabled";
  isTest?: boolean;
}) {
  const db = getDb();

  const [program] = await db
    .select({ appId: programs.appId })
    .from(programs)
    .where(eq(programs.id, input.programId))
    .limit(1);

  if (!program) {
    throw new Error(`Seed program not found: ${input.programId}`);
  }

  await db
    .insert(programAffiliates)
    .values({
      id: input.id,
      programId: input.programId,
      userId: input.userId,
      status: input.status,
      isTest: input.isTest ?? false,
    })
    .onConflictDoUpdate({
      target: programAffiliates.id,
      set: {
        status: input.status,
        isTest: input.isTest ?? false,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(affiliateLinks)
    .values({
      id: input.linkId,
      appId: program.appId,
      programAffiliateId: input.id,
      programId: input.programId,
      linkCode: input.linkCode,
      label: "Default link",
    })
    .onConflictDoNothing();
}

export async function upsertSeedClick(input: {
  id: string;
  affiliateLinkId: string;
  programId: string;
  programAffiliateId: string;
  suffix: string;
}) {
  const db = getDb();

  await db
    .insert(clicks)
    .values({
      id: input.id,
      affiliateLinkId: input.affiliateLinkId,
      programId: input.programId,
      programAffiliateId: input.programAffiliateId,
      ipHash: `seed-${input.suffix}`,
      userAgent: "RefKit seed",
    })
    .onConflictDoNothing();
}

export async function upsertSeedCustomer(input: {
  id: string;
  appId: string;
  externalCustomerId: string;
  email: string;
}) {
  const db = getDb();

  await db
    .insert(customers)
    .values({
      id: input.id,
      appId: input.appId,
      externalCustomerId: input.externalCustomerId,
      email: input.email,
    })
    .onConflictDoNothing();
}

export async function upsertSeedReferral(input: {
  id: string;
  customerId: string;
  programId: string;
  programAffiliateId: string;
  clickId: string;
}) {
  const db = getDb();

  await db
    .insert(referrals)
    .values({
      id: input.id,
      customerId: input.customerId,
      programId: input.programId,
      programAffiliateId: input.programAffiliateId,
      clickId: input.clickId,
    })
    .onConflictDoNothing();
}

export async function upsertSeedOpenPayoutRequest(input: {
  id: string;
  programId: string;
  programAffiliateId: string;
  amount: number;
  currency: string;
  commissionEntryIds: string[];
}) {
  const db = getDb();

  await db
    .insert(payoutRequests)
    .values({
      id: input.id,
      programId: input.programId,
      programAffiliateId: input.programAffiliateId,
      status: "open",
      amount: input.amount,
      currency: input.currency,
    })
    .onConflictDoUpdate({
      target: payoutRequests.id,
      set: {
        programAffiliateId: input.programAffiliateId,
        status: "open",
        amount: input.amount,
        currency: input.currency,
        updatedAt: new Date(),
      },
    });

  for (const commissionEntryId of input.commissionEntryIds) {
    await db
      .insert(payoutRequestItems)
      .values({
        id: `preqi_${input.id}_${commissionEntryId}`,
        payoutRequestId: input.id,
        commissionEntryId,
      })
      .onConflictDoNothing();
  }
}

export async function upsertSeedPreparedPayoutBatch(input: {
  batchId: string;
  programId: string;
  requestId?: string;
  items: Array<{
    id: string;
    commissionEntryId: string;
    programAffiliateId: string;
    amount: number;
    currency: string;
    payoutMethod: string;
    payoutDetails: Record<string, unknown>;
  }>;
}) {
  const db = getDb();

  await db
    .insert(payoutBatches)
    .values({
      id: input.batchId,
      programId: input.programId,
      status: "prepared",
    })
    .onConflictDoUpdate({
      target: payoutBatches.id,
      set: {
        status: "prepared",
        updatedAt: new Date(),
      },
    });

  for (const item of input.items) {
    await db
      .insert(payoutItems)
      .values({
        id: item.id,
        payoutBatchId: input.batchId,
        payoutRequestId: input.requestId ?? null,
        commissionEntryId: item.commissionEntryId,
        programAffiliateId: item.programAffiliateId,
        amount: item.amount,
        currency: item.currency,
        status: "pending",
        batchStatus: "prepared",
        payoutMethod: item.payoutMethod,
        payoutDetailsSnapshotEncrypted: encryptPayoutDetails(
          JSON.stringify(item.payoutDetails)
        ),
      })
      .onConflictDoNothing();
  }
}

export async function upsertSeedPayoutDetails(input: {
  id: string;
  programAffiliateId: string;
  method: string;
  currency?: string;
  details: Record<string, unknown>;
}) {
  const db = getDb();
  const currency = (input.currency ?? "usd").toLowerCase();

  const [existing] = await db
    .select({ id: affiliatePayoutDetails.id })
    .from(affiliatePayoutDetails)
    .where(
      and(
        eq(
          affiliatePayoutDetails.programAffiliateId,
          input.programAffiliateId
        ),
        eq(affiliatePayoutDetails.method, input.method),
        eq(affiliatePayoutDetails.currency, currency)
      )
    )
    .limit(1);

  if (existing) {
    return;
  }

  await db.insert(affiliatePayoutDetails).values({
    id: input.id,
    programAffiliateId: input.programAffiliateId,
    method: input.method,
    currency,
    detailsEncrypted: encryptPayoutDetails(JSON.stringify(input.details)),
  });
}

export async function seedExists() {
  const db = getDb();

  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, "usr_seed_admin"))
    .limit(1);

  return Boolean(row);
}
