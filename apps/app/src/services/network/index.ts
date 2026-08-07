import { and, desc, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  appAgreementVersions,
  apps,
  commissionRules,
  programs,
  programTermsVersions,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { ListParams } from "@/lib/pagination";
import { serializeAppAgreementVersion } from "@/services/apps/agreement";
import { serializeTermsVersion } from "@/services/programs/terms";

export async function listNetworkApps(params: ListParams) {
  const db = getDb();
  const limit = params.limit ?? 25;
  const conditions = [
    eq(apps.status, "active"),
    eq(apps.networkVisible, true),
    isNotNull(apps.logoUrl),
    eq(programs.status, "active"),
    eq(programs.isDefault, true),
    eq(commissionRules.isDefault, true),
    eq(commissionRules.isActive, true),
  ];

  if (params.startingAfter) {
    const [cursor] = await db
      .select({ id: apps.id, createdAt: apps.createdAt })
      .from(programs)
      .innerJoin(apps, eq(apps.id, programs.appId))
      .innerJoin(
        commissionRules,
        eq(commissionRules.programId, programs.id)
      )
      .innerJoin(
        programTermsVersions,
        eq(programTermsVersions.id, commissionRules.termsVersionId)
      )
      .where(and(...conditions, eq(apps.id, params.startingAfter)))
      .limit(1);

    if (!cursor) {
      throw new AppError(
        "invalid_request",
        "invalid_starting_after",
        "Invalid starting_after cursor.",
        400
      );
    }

    conditions.push(
      or(
        lt(apps.createdAt, cursor.createdAt),
        and(
          eq(apps.createdAt, cursor.createdAt),
          lt(apps.id, cursor.id)
        )
      )!
    );
  }

  const rows = await db
    .select({
      app: apps,
      program: programs,
      commissionRule: commissionRules,
      termsVersion: programTermsVersions,
    })
    .from(programs)
    .innerJoin(apps, eq(apps.id, programs.appId))
    .innerJoin(
      commissionRules,
      eq(commissionRules.programId, programs.id)
    )
    .innerJoin(
      programTermsVersions,
      eq(programTermsVersions.id, commissionRules.termsVersionId)
    )
    .where(and(...conditions))
    .orderBy(desc(apps.createdAt), desc(apps.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const appIds = [...new Set(pageRows.map((row) => row.app.id))];
  const agreementRows =
    appIds.length === 0
      ? []
      : await db
          .select()
          .from(appAgreementVersions)
          .where(inArray(appAgreementVersions.appId, appIds))
          .orderBy(desc(appAgreementVersions.versionNumber));

  const latestAgreementByAppId = new Map<string, typeof appAgreementVersions.$inferSelect>();

  for (let i = 0; i < agreementRows.length; i++) {
    const row = agreementRows[i];

    if (!latestAgreementByAppId.has(row.appId)) {
      latestAgreementByAppId.set(row.appId, row);
    }
  }

  return {
    data: pageRows.map((row) => ({
      ...row,
      agreementVersion: latestAgreementByAppId.get(row.app.id) ?? null,
    })),
    hasMore,
  };
}

export function serializeNetworkApp(
  row: Awaited<ReturnType<typeof listNetworkApps>>["data"][number],
  origin: string
) {
  const { app, program, commissionRule, termsVersion, agreementVersion } = row;

  return {
    app: {
      id: app.id,
      name: app.name,
      website_url: app.websiteUrl,
      logo_url: app.logoUrl,
    },
    program: {
      id: program.id,
      name: program.name,
      slug: program.slug,
      currency: program.currency,
      join_page_approval: program.joinPageApproval,
      minimum_payout_amount: {
        amount: program.minimumPayoutAmount,
        currency: program.currency,
      },
      supported_payout_methods: program.supportedPayoutMethods,
    },
    commission_rule: {
      reward_type: commissionRule.rewardType,
      percent_value: commissionRule.percentValue
        ? Number(commissionRule.percentValue)
        : null,
      fixed_amount: commissionRule.fixedAmount,
      fixed_currency: commissionRule.fixedCurrency,
      recurring_duration_months: commissionRule.recurringDurationMonths,
    },
    current_terms_version: serializeTermsVersion(termsVersion),
    current_agreement_version: agreementVersion
      ? serializeAppAgreementVersion(agreementVersion)
      : null,
    join_url: new URL(`/join/${program.slug}`, origin).toString(),
  };
}

export const listNetworkPrograms = listNetworkApps;
export const serializeNetworkProgram = serializeNetworkApp;
