import { and, eq, sql } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  apps,
  commissionRules,
  programs,
  type CommissionRule,
  type Program,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { ListParams, listWithCursor } from "@/lib/pagination";
import { writeAuditLog } from "@/services/audit";
import { requireAppAccess, requireProgramAccess } from "@/services/scoping";
import { createInitialTermsVersion } from "@/services/programs/terms";

export type CommissionRuleInput = {
  rewardType: "percent" | "fixed";
  percentValue?: number;
  fixedAmount?: number;
  recurringDurationMonths?: number | null;
};

export type CreateProgramInput = {
  appId: string;
  name: string;
  slug: string;
  currency: string;
  destinationUrl?: string;
  commissionRule: CommissionRuleInput;
  minimumPayoutAmount?: number;
  supportedPayoutMethods?: string[];
  allowSelfReferral?: boolean;
  promotionCodeFallback?: boolean;
  joinPageEnabled?: boolean;
  joinPageApproval?: string;
};

export function validateCommissionRule(
  currency: string,
  rule: CommissionRuleInput
) {
  if (rule.rewardType === "percent") {
    if (
      rule.percentValue === undefined ||
      rule.percentValue <= 0 ||
      rule.percentValue > 100
    ) {
      throw new AppError(
        "invalid_request",
        "invalid_commission_rule",
        "Percent commission rules require percent_value between 0 and 100.",
        400
      );
    }
  }
  else if (rule.rewardType === "fixed") {
    if (!rule.fixedAmount || rule.fixedAmount <= 0) {
      throw new AppError(
        "invalid_request",
        "invalid_commission_rule",
        "Fixed commission rules require a positive fixed_amount.",
        400
      );
    }
  }
  else {
    throw new AppError(
      "invalid_request",
      "invalid_commission_rule",
      "Commission rule reward_type must be percent or fixed.",
      400
    );
  }

  if (
    rule.recurringDurationMonths !== undefined &&
    rule.recurringDurationMonths !== null &&
    rule.recurringDurationMonths <= 0
  ) {
    throw new AppError(
      "invalid_request",
      "invalid_commission_rule",
      "recurring_duration_months must be positive or null for lifetime.",
      400
    );
  }
}

export function resolveProgramDestinationUrl(
  websiteUrl: string | null,
  destinationUrl?: string
) {
  if (!websiteUrl) {
    throw new AppError(
      "invalid_request",
      "website_url_required",
      "Set a website URL on the app before creating a program.",
      400
    );
  }

  if (destinationUrl && destinationUrl !== websiteUrl) {
    throw new AppError(
      "invalid_request",
      "destination_url_mismatch",
      "Program destination URL must match the app website URL.",
      400
    );
  }

  return websiteUrl;
}

export async function createProgramRecords(input: {
  executor: DbExecutor;
  userId: string;
  appId: string;
  name: string;
  slug: string;
  currency: string;
  destinationUrl: string;
  commissionRule: CommissionRuleInput;
  minimumPayoutAmount?: number;
  supportedPayoutMethods?: string[];
  allowSelfReferral?: boolean;
  promotionCodeFallback?: boolean;
  joinPageEnabled?: boolean;
  joinPageApproval?: string;
  isDefault: boolean;
}) {
  const programId = generateId(ID_PREFIXES.program);

  await input.executor.insert(programs).values({
    id: programId,
    appId: input.appId,
    name: input.name,
    slug: input.slug,
    currency: input.currency,
    destinationUrl: input.destinationUrl,
    minimumPayoutAmount: input.minimumPayoutAmount ?? 0,
    supportedPayoutMethods: input.supportedPayoutMethods ?? [],
    allowSelfReferral: input.allowSelfReferral ?? false,
    promotionCodeFallback: input.promotionCodeFallback ?? false,
    isDefault: input.isDefault,
    joinPageEnabled: input.joinPageEnabled ?? true,
    joinPageApproval: input.joinPageApproval ?? "pending",
  });

  const { rule } = await createInitialTermsVersion({
    programId,
    currency: input.currency,
    commissionRule: input.commissionRule,
            publishedByUserId: input.userId.startsWith("macc_")
              ? undefined
              : input.userId,
  }, input.executor);

  const [program] = await input.executor
    .select()
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);

  return { program, commissionRule: rule };
}

export function rethrowProgramCreateError(error: unknown): never {
  if (isUniqueViolation(error)) {
    throw new AppError(
      "conflict",
      "program_slug_taken",
      "Program slug is already in use.",
      409
    );
  }

  throw error;
}

export async function createProgram(
  userId: string,
  input: CreateProgramInput
) {
  const app = await requireAppAccess(userId, input.appId);
  validateCommissionRule(input.currency, input.commissionRule);

  const destinationUrl = resolveProgramDestinationUrl(
    app.websiteUrl,
    input.destinationUrl
  );

  const db = getDb();
  let created: Awaited<ReturnType<typeof createProgramRecords>>;

  try {
    created = await db.transaction(async (tx) => {
      await tx.execute(sql`
        SELECT id FROM ${apps}
        WHERE ${apps.id} = ${input.appId}
        FOR UPDATE
      `);

      const [defaultProgram] = await tx
        .select({ id: programs.id })
        .from(programs)
        .where(
          and(
            eq(programs.appId, input.appId),
            eq(programs.isDefault, true)
          )
        )
        .limit(1);

      return createProgramRecords({
        executor: tx,
        userId,
        appId: input.appId,
        name: input.name,
        slug: input.slug,
        currency: input.currency,
        destinationUrl,
        commissionRule: input.commissionRule,
        minimumPayoutAmount: input.minimumPayoutAmount,
        supportedPayoutMethods: input.supportedPayoutMethods,
        allowSelfReferral: input.allowSelfReferral,
        promotionCodeFallback: input.promotionCodeFallback,
        joinPageEnabled: input.joinPageEnabled,
        joinPageApproval: input.joinPageApproval,
        isDefault: !defaultProgram,
      });
    });
  }
  catch (error) {
    rethrowProgramCreateError(error);
  }

  return created;
}

export async function listPrograms(
  userId: string,
  appId: string,
  params: ListParams
) {
  await requireAppAccess(userId, appId);

  const limit = params.limit ?? 25;

  return listWithCursor<Program>({
    table: programs,
    columns: {
      id: programs.id,
      createdAt: programs.createdAt,
    },
    where: eq(programs.appId, appId),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function getDefaultCommissionRule(programId: string) {
  const db = getDb();

  const [rule] = await db
    .select()
    .from(commissionRules)
    .where(
      and(
        eq(commissionRules.programId, programId),
        eq(commissionRules.isDefault, true),
        eq(commissionRules.isActive, true)
      )
    )
    .limit(1);

  return rule ?? null;
}

export async function pauseProgram(userId: string, programId: string) {
  const program = await requireProgramAccess(userId, programId);

  if (program.status !== "active") {
    throw new AppError(
      "invalid_request",
      "invalid_program_transition",
      "Only active programs can be paused.",
      400
    );
  }

  if (program.isDefault) {
    const app = await requireAppAccess(userId, program.appId);

    if (app.networkVisible) {
      throw new AppError(
        "conflict",
        "network_default_program_active_required",
        "Hide the app from the RefKit Network or choose another default program before pausing this one.",
        409
      );
    }
  }

  const db = getDb();

  const [updated] = await db
    .update(programs)
    .set({ status: "paused" })
    .where(and(eq(programs.id, programId), eq(programs.status, "active")))
    .returning();

  if (!updated) {
    throw new AppError(
      "invalid_request",
      "invalid_program_transition",
      "Only active programs can be paused.",
      400
    );
  }

  await writeAuditLog({
    actorUserId: userId,
    action: "program.paused",
    resourceType: "program",
    resourceId: programId,
    metadata: { from_status: program.status, to_status: "paused" },
  });

  return updated;
}

export async function resumeProgram(userId: string, programId: string) {
  const program = await requireProgramAccess(userId, programId);

  if (program.status !== "paused") {
    throw new AppError(
      "invalid_request",
      "invalid_program_transition",
      "Only paused programs can be resumed.",
      400
    );
  }

  const db = getDb();

  const [updated] = await db
    .update(programs)
    .set({ status: "active" })
    .where(and(eq(programs.id, programId), eq(programs.status, "paused")))
    .returning();

  if (!updated) {
    throw new AppError(
      "invalid_request",
      "invalid_program_transition",
      "Only paused programs can be resumed.",
      400
    );
  }

  await writeAuditLog({
    actorUserId: userId,
    action: "program.resumed",
    resourceType: "program",
    resourceId: programId,
    metadata: { from_status: program.status, to_status: "active" },
  });

  return updated;
}

type UpdateProgramInput = {
  name?: string;
  joinPageEnabled?: boolean;
  joinPageApproval?: string;
  minimumPayoutAmount?: number;
  supportedPayoutMethods?: string[];
};

export async function updateProgram(
  userId: string,
  programId: string,
  input: UpdateProgramInput
) {
  const program = await requireProgramAccess(userId, programId);

  if (program.status === "disabled") {
    throw new AppError(
      "invalid_request",
      "program_disabled",
      "Disabled programs cannot be updated.",
      400
    );
  }

  if (
    input.minimumPayoutAmount !== undefined &&
    input.minimumPayoutAmount < 0
  ) {
    throw new AppError(
      "invalid_request",
      "invalid_minimum_payout",
      "minimum_payout_amount must be zero or greater.",
      400
    );
  }

  if (
    input.joinPageApproval !== undefined &&
    input.joinPageApproval !== "active" &&
    input.joinPageApproval !== "pending"
  ) {
    throw new AppError(
      "invalid_request",
      "invalid_join_page_approval",
      "join_page_approval must be active or pending.",
      400
    );
  }

  const updates: Partial<typeof programs.$inferInsert> = {};

  if (input.name !== undefined) {
    updates.name = input.name;
  }

  if (input.joinPageEnabled !== undefined) {
    updates.joinPageEnabled = input.joinPageEnabled;
  }

  if (input.joinPageApproval !== undefined) {
    updates.joinPageApproval = input.joinPageApproval;
  }

  if (input.minimumPayoutAmount !== undefined) {
    updates.minimumPayoutAmount = input.minimumPayoutAmount;
  }

  if (input.supportedPayoutMethods !== undefined) {
    updates.supportedPayoutMethods = input.supportedPayoutMethods;
  }

  const db = getDb();

  await db
    .update(programs)
    .set(updates)
    .where(eq(programs.id, programId));

  await writeAuditLog({
    actorUserId: userId,
    action: "program.updated",
    resourceType: "program",
    resourceId: programId,
    metadata: {
      name: input.name,
      join_page_enabled: input.joinPageEnabled,
      join_page_approval: input.joinPageApproval,
      minimum_payout_amount: input.minimumPayoutAmount,
      supported_payout_methods: input.supportedPayoutMethods,
    },
  });

  const [updated] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);

  return updated;
}

export function serializeCommissionRule(rule: CommissionRule) {
  return {
    id: rule.id,
    reward_type: rule.rewardType,
    percent_value: rule.percentValue
      ? Number(rule.percentValue)
      : null,
    fixed_amount: rule.fixedAmount,
    fixed_currency: rule.fixedCurrency,
    recurring_duration_months: rule.recurringDurationMonths,
    is_default: rule.isDefault,
    is_active: rule.isActive,
    created_at: rule.createdAt.toISOString(),
    updated_at: rule.updatedAt.toISOString(),
  };
}

export function serializeProgram(
  program: Program,
  commissionRule?: CommissionRule | null
) {
  return {
    id: program.id,
    app_id: program.appId,
    name: program.name,
    slug: program.slug,
    currency: program.currency,
    destination_url: program.destinationUrl,
    status: program.status,
    is_default: program.isDefault,
    join_page_enabled: program.joinPageEnabled,
    join_page_approval: program.joinPageApproval,
    allow_self_referral: program.allowSelfReferral,
    promotion_code_fallback: program.promotionCodeFallback,
    minimum_payout_amount: {
      amount: program.minimumPayoutAmount,
      currency: program.currency,
    },
    supported_payout_methods: program.supportedPayoutMethods,
    commission_rule: commissionRule
      ? serializeCommissionRule(commissionRule)
      : null,
    created_at: program.createdAt.toISOString(),
    updated_at: program.updatedAt.toISOString(),
  };
}
