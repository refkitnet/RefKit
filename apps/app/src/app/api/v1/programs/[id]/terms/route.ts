import { z } from "zod";
import { handleRouteError, ownerPrincipalId, requireOwnerAuth } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  getCurrentTermsVersion,
  publishProgramTermsVersion,
  serializeTermsVersion,
} from "@/services/programs/terms";
import {
  serializeCommissionRule,
  type CommissionRuleInput,
} from "@/services/programs";
import { requireProgramAccess } from "@/services/scoping";
import { AppError } from "@/lib/errors";
import { minorUnitAmountSchema } from "@/lib/money";

const publishTermsSchema = z.object({
  commission_rule: z.object({
    reward_type: z.enum(["percent", "fixed"]),
    percent_value: z.number().optional(),
    fixed_amount: minorUnitAmountSchema.optional(),
    recurring_duration_months: z.number().int().positive().nullable().optional(),
  }),
});

function assertCommissionRule(
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

  void currency;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id: programId } = await context.params;
    await requireProgramAccess(ownerPrincipalId(auth), programId);

    const current = await getCurrentTermsVersion(programId);

    if (!current) {
      throw new AppError(
        "not_found",
        "terms_version_missing",
        "Program terms are not published yet.",
        404
      );
    }

    return Response.json({
      terms_version: serializeTermsVersion(current),
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id: programId } = await context.params;
    const body = await parseJsonBody(request, publishTermsSchema);
    const principalId = ownerPrincipalId(auth);
    const program = await requireProgramAccess(principalId, programId);

    const commissionRule: CommissionRuleInput = {
      rewardType: body.commission_rule.reward_type,
      percentValue: body.commission_rule.percent_value,
      fixedAmount: body.commission_rule.fixed_amount,
      recurringDurationMonths:
        body.commission_rule.recurring_duration_months ?? null,
    };

    assertCommissionRule(program.currency, commissionRule);

    const published = await publishProgramTermsVersion(
      principalId,
      programId,
      {
        commissionRule,
      },
      program.currency
    );

    return Response.json(
      {
        terms_version: serializeTermsVersion(published.termsVersion),
        commission_rule: serializeCommissionRule(published.rule),
      },
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
