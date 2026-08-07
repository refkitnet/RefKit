import { desc, eq, inArray, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  affiliateAgreementAcceptances,
  appAgreementVersions,
  apps,
  type AppAgreementVersion,
} from "@/db/schema";
import { defaultAppAgreement } from "@/lib/compliance-copy";
import { generateId, ID_PREFIXES } from "@/lib/ids";

export async function getCurrentAppAgreement(
  appId: string,
  executor: DbExecutor = getDb()
) {
  const [version] = await executor
    .select()
    .from(appAgreementVersions)
    .where(eq(appAgreementVersions.appId, appId))
    .orderBy(desc(appAgreementVersions.versionNumber))
    .limit(1);

  return version ?? null;
}

export async function lockAppAgreement(
  executor: DbExecutor,
  appId: string
) {
  await executor.execute(sql`
    SELECT id
    FROM ${apps}
    WHERE ${apps.id} = ${appId}
    FOR UPDATE
  `);
}

export async function createInitialAppAgreement(input: {
  appId: string;
  appName: string;
  publishedByUserId?: string;
}, executor?: DbExecutor) {
  const db = getDb();
  const versionId = generateId(ID_PREFIXES.appAgreementVersion);

  const insertRecord = async (target: DbExecutor) => {
    await target.insert(appAgreementVersions).values({
      id: versionId,
      appId: input.appId,
      versionNumber: 1,
      termsText: defaultAppAgreement(input.appName),
      publishedByUserId: input.publishedByUserId ?? null,
    });
  };

  if (executor) {
    await insertRecord(executor);
  }
  else {
    await db.transaction(insertRecord);
  }

  const target = executor ?? db;
  const [version] = await target
    .select()
    .from(appAgreementVersions)
    .where(eq(appAgreementVersions.id, versionId))
    .limit(1);

  return version!;
}

export async function publishAppAgreement(
  userId: string,
  appId: string,
  termsText: string
) {
  const db = getDb();
  const versionId = generateId(ID_PREFIXES.appAgreementVersion);

  await db.transaction(async (tx) => {
    await lockAppAgreement(tx, appId);
    const current = await getCurrentAppAgreement(appId, tx);
    const nextVersionNumber = (current?.versionNumber ?? 0) + 1;

    await tx.insert(appAgreementVersions).values({
      id: versionId,
      appId,
      versionNumber: nextVersionNumber,
      termsText,
      publishedByUserId: userId,
    });
  });

  const [version] = await db
    .select()
    .from(appAgreementVersions)
    .where(eq(appAgreementVersions.id, versionId))
    .limit(1);

  return version!;
}

export async function recordAgreementAcceptance(input: {
  programAffiliateId: string;
  appAgreementVersionId: string;
}, executor: DbExecutor = getDb()) {
  const acceptanceId = generateId(ID_PREFIXES.agreementAcceptance);

  await executor
    .insert(affiliateAgreementAcceptances)
    .values({
      id: acceptanceId,
      programAffiliateId: input.programAffiliateId,
      appAgreementVersionId: input.appAgreementVersionId,
      acceptedAt: new Date(),
    })
    .onConflictDoNothing();

  const [acceptance] = await executor
    .select()
    .from(affiliateAgreementAcceptances)
    .where(
      eq(affiliateAgreementAcceptances.programAffiliateId, input.programAffiliateId)
    )
    .orderBy(desc(affiliateAgreementAcceptances.acceptedAt))
    .limit(1);

  return acceptance ?? null;
}

export async function getLatestAcceptedAgreementsByProgramAffiliateId(
  programAffiliateIds: string[],
  executor: DbExecutor = getDb()
) {
  if (programAffiliateIds.length === 0) {
    return new Map<string, AppAgreementVersion>();
  }

  const rows = await executor
    .select({
      programAffiliateId: affiliateAgreementAcceptances.programAffiliateId,
      version: appAgreementVersions,
      acceptedAt: affiliateAgreementAcceptances.acceptedAt,
    })
    .from(affiliateAgreementAcceptances)
    .innerJoin(
      appAgreementVersions,
      eq(
        appAgreementVersions.id,
        affiliateAgreementAcceptances.appAgreementVersionId
      )
    )
    .where(
      inArray(
        affiliateAgreementAcceptances.programAffiliateId,
        programAffiliateIds
      )
    )
    .orderBy(desc(affiliateAgreementAcceptances.acceptedAt));

  const latestByProgramAffiliateId = new Map<string, AppAgreementVersion>();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    if (!latestByProgramAffiliateId.has(row.programAffiliateId)) {
      latestByProgramAffiliateId.set(row.programAffiliateId, row.version);
    }
  }

  return latestByProgramAffiliateId;
}

export function serializeAppAgreementVersion(version: AppAgreementVersion) {
  return {
    id: version.id,
    app_id: version.appId,
    version_number: version.versionNumber,
    terms_text: version.termsText,
    published_at: version.createdAt.toISOString(),
  };
}
