import { and, desc, eq, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  commissionRules,
  programs,
  programTermsVersions,
  referrals,
  type ProgramTermsVersion,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import type { CommissionRuleInput } from "@/services/programs";

export async function getCurrentTermsVersion(
  programId: string,
  executor: DbExecutor = getDb()
) {

  const [version] = await executor
    .select()
    .from(programTermsVersions)
    .where(eq(programTermsVersions.programId, programId))
    .orderBy(desc(programTermsVersions.versionNumber))
    .limit(1);

  return version ?? null;
}

export async function getRuleForTermsVersion(
  termsVersionId: string,
  executor: DbExecutor = getDb()
) {

  const [rule] = await executor
    .select()
    .from(commissionRules)
    .where(eq(commissionRules.termsVersionId, termsVersionId))
    .limit(1);

  return rule ?? null;
}

export async function lockProgramTerms(
  executor: DbExecutor,
  programId: string
) {
  await executor.execute(sql`
    SELECT id
    FROM ${programs}
    WHERE ${programs.id} = ${programId}
    FOR UPDATE
  `);
}

export async function createInitialTermsVersion(input: {
  programId: string;
  currency: string;
  commissionRule: CommissionRuleInput;
  publishedByUserId?: string;
}, executor?: DbExecutor) {
  const db = getDb();
  const termsVersionId = generateId(ID_PREFIXES.termsVersion);
  const ruleId = generateId(ID_PREFIXES.commissionRule);

  const insertRecords = async (target: DbExecutor) => {
    await target.insert(programTermsVersions).values({
      id: termsVersionId,
      programId: input.programId,
      versionNumber: 1,
      rewardType: input.commissionRule.rewardType,
      percentValue:
        input.commissionRule.rewardType === "percent"
          ? String(input.commissionRule.percentValue)
          : null,
      fixedAmount:
        input.commissionRule.rewardType === "fixed"
          ? input.commissionRule.fixedAmount
          : null,
      fixedCurrency:
        input.commissionRule.rewardType === "fixed"
          ? input.currency
          : null,
      recurringDurationMonths:
        input.commissionRule.recurringDurationMonths ?? null,
      publishedByUserId: input.publishedByUserId ?? null,
    });

    await target.insert(commissionRules).values({
      id: ruleId,
      programId: input.programId,
      termsVersionId,
      rewardType: input.commissionRule.rewardType,
      percentValue:
        input.commissionRule.rewardType === "percent"
          ? String(input.commissionRule.percentValue)
          : null,
      fixedAmount:
        input.commissionRule.rewardType === "fixed"
          ? input.commissionRule.fixedAmount
          : null,
      fixedCurrency:
        input.commissionRule.rewardType === "fixed"
          ? input.currency
          : null,
      recurringDurationMonths:
        input.commissionRule.recurringDurationMonths ?? null,
      isDefault: true,
      isActive: true,
    });
  };

  if (executor) {
    await insertRecords(executor);
  }
  else {
    await db.transaction(insertRecords);
  }

  const target = executor ?? db;

  const [version] = await target
    .select()
    .from(programTermsVersions)
    .where(eq(programTermsVersions.id, termsVersionId))
    .limit(1);

  const [rule] = await target
    .select()
    .from(commissionRules)
    .where(eq(commissionRules.id, ruleId))
    .limit(1);

  return { termsVersion: version!, rule: rule! };
}

export async function publishProgramTermsVersion(
  userId: string,
  programId: string,
  input: {
    commissionRule: CommissionRuleInput;
  },
  currency: string
) {
  const db = getDb();
  const termsVersionId = generateId(ID_PREFIXES.termsVersion);
  const ruleId = generateId(ID_PREFIXES.commissionRule);

  await db.transaction(async (tx) => {
    await lockProgramTerms(tx, programId);
    const current = await getCurrentTermsVersion(programId, tx);
    const nextVersionNumber = (current?.versionNumber ?? 0) + 1;

    await tx
      .update(commissionRules)
      .set({ isActive: false, isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(commissionRules.programId, programId),
          eq(commissionRules.isDefault, true),
          eq(commissionRules.isActive, true)
        )
      );

    await tx.insert(programTermsVersions).values({
      id: termsVersionId,
      programId,
      versionNumber: nextVersionNumber,
      rewardType: input.commissionRule.rewardType,
      percentValue:
        input.commissionRule.rewardType === "percent"
          ? String(input.commissionRule.percentValue)
          : null,
      fixedAmount:
        input.commissionRule.rewardType === "fixed"
          ? input.commissionRule.fixedAmount
          : null,
      fixedCurrency:
        input.commissionRule.rewardType === "fixed"
          ? currency
          : null,
      recurringDurationMonths:
        input.commissionRule.recurringDurationMonths ?? null,
      publishedByUserId: userId.startsWith("macc_") ? null : userId,
    });

    await tx.insert(commissionRules).values({
      id: ruleId,
      programId,
      termsVersionId,
      rewardType: input.commissionRule.rewardType,
      percentValue:
        input.commissionRule.rewardType === "percent"
          ? String(input.commissionRule.percentValue)
          : null,
      fixedAmount:
        input.commissionRule.rewardType === "fixed"
          ? input.commissionRule.fixedAmount
          : null,
      fixedCurrency:
        input.commissionRule.rewardType === "fixed"
          ? currency
          : null,
      recurringDurationMonths:
        input.commissionRule.recurringDurationMonths ?? null,
      isDefault: true,
      isActive: true,
    });
  });

  const [version] = await db
    .select()
    .from(programTermsVersions)
    .where(eq(programTermsVersions.id, termsVersionId))
    .limit(1);

  const [rule] = await db
    .select()
    .from(commissionRules)
    .where(eq(commissionRules.id, ruleId))
    .limit(1);

  return { termsVersion: version!, rule: rule! };
}

export async function resolvePinnedRuleForReferral(input: {
  programId: string;
  referral?: {
    termsVersionId: string | null;
    pinnedRuleId: string | null;
  } | null;
}) {
  if (input.referral?.pinnedRuleId) {
    const db = getDb();

    const [rule] = await db
      .select()
      .from(commissionRules)
      .where(eq(commissionRules.id, input.referral.pinnedRuleId))
      .limit(1);

    if (rule) {
      return rule;
    }
  }

  if (input.referral?.termsVersionId) {
    const rule = await getRuleForTermsVersion(input.referral.termsVersionId);

    if (rule) {
      return rule;
    }
  }

  const db = getDb();

  const [rule] = await db
    .select()
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.programId, input.programId),
        eq(commissionRules.isDefault, true),
        eq(commissionRules.isActive, true)
      )
    )
    .limit(1);

  return rule ?? null;
}

async function getTermsVersionById(
  termsVersionId: string,
  executor: DbExecutor
) {
  const [version] = await executor
    .select()
    .from(programTermsVersions)
    .where(eq(programTermsVersions.id, termsVersionId))
    .limit(1);

  return version ?? null;
}

async function getPinnedRule(
  ruleId: string,
  programId: string,
  executor: DbExecutor
) {
  const [rule] = await executor
    .select()
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.id, ruleId),
        eq(commissionRules.programId, programId)
      )
    )
    .limit(1);

  return rule ?? null;
}

async function pinTermsOnReferralWithExecutor(input: {
  referralId: string;
  programId: string;
}, executor: DbExecutor) {
  await lockProgramTerms(executor, input.programId);

  const [referral] = await executor
    .select({
      termsVersionId: referrals.termsVersionId,
      pinnedRuleId: referrals.pinnedRuleId,
    })
    .from(referrals)
    .where(
      and(
        eq(referrals.id, input.referralId),
        eq(referrals.programId, input.programId)
      )
    )
    .limit(1);

  if (!referral) {
    throw new AppError(
      "not_found",
      "referral_not_found",
      "Referral not found.",
      404
    );
  }

  if (referral.pinnedRuleId) {
    const rule = await getPinnedRule(
      referral.pinnedRuleId,
      input.programId,
      executor
    );

    if (!rule) {
      throw new AppError(
        "internal",
        "terms_rule_missing",
        "Program terms rule is missing.",
        500
      );
    }

    const termsVersionId = referral.termsVersionId ?? rule.termsVersionId;
    const termsVersion = termsVersionId
      ? await getTermsVersionById(termsVersionId, executor)
      : null;

    if (!termsVersion) {
      throw new AppError(
        "internal",
        "terms_version_missing",
        "Program terms version is missing.",
        500
      );
    }

    return { termsVersion, rule };
  }

  const current = referral.termsVersionId
    ? await getTermsVersionById(referral.termsVersionId, executor)
    : await getCurrentTermsVersion(input.programId, executor);

  if (!current) {
    throw new AppError(
      "internal",
      "terms_version_missing",
      "Program terms version is missing.",
      500
    );
  }

  const rule = await getRuleForTermsVersion(current.id, executor);

  if (!rule) {
    throw new AppError(
      "internal",
      "terms_rule_missing",
      "Program terms rule is missing.",
      500
    );
  }

  await executor
    .update(referrals)
    .set({
      termsVersionId: current.id,
      pinnedRuleId: rule.id,
      updatedAt: new Date(),
    })
    .where(eq(referrals.id, input.referralId));

  return { termsVersion: current, rule };
}

export async function pinTermsOnReferral(
  input: {
    referralId: string;
    programId: string;
  },
  executor?: DbExecutor
) {
  if (executor) {
    return pinTermsOnReferralWithExecutor(input, executor);
  }

  const db = getDb();
  return db.transaction((tx) => pinTermsOnReferralWithExecutor(input, tx));
}

export function serializeTermsVersion(version: ProgramTermsVersion) {
  return {
    id: version.id,
    program_id: version.programId,
    version_number: version.versionNumber,
    reward_type: version.rewardType,
    percent_value: version.percentValue
      ? Number(version.percentValue)
      : null,
    fixed_amount: version.fixedAmount,
    fixed_currency: version.fixedCurrency,
    recurring_duration_months: version.recurringDurationMonths,
    published_at: version.createdAt.toISOString(),
  };
}
