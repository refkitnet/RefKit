import { z } from "zod";
import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { parseListParams } from "@/lib/pagination";
import {
  currencyCodeSchema,
  nonNegativeMinorUnitAmountSchema,
  positiveMinorUnitAmountSchema,
} from "@/lib/money";
import {
  createProgram,
  getDefaultCommissionRule,
  listPrograms,
  serializeProgram,
} from "@/services/programs";

const commissionRuleSchema = z.object({
  reward_type: z.enum(["percent", "fixed"]),
  percent_value: z.number().positive().max(100).optional(),
  fixed_amount: positiveMinorUnitAmountSchema.optional(),
  recurring_duration_months: z.number().int().positive().nullable().optional(),
});

const createProgramSchema = z.object({
  app_id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  currency: currencyCodeSchema,
  destination_url: z.string().url().optional(),
  commission_rule: commissionRuleSchema,
  minimum_payout_amount: nonNegativeMinorUnitAmountSchema.optional(),
  supported_payout_methods: z
    .array(z.enum(["paypal", "bank_transfer"]))
    .optional(),
  allow_self_referral: z.boolean().optional(),
  promotion_code_fallback: z.boolean().optional(),
  join_page_enabled: z.boolean().optional(),
  join_page_approval: z.enum(["active", "pending"]).optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireOwnerAuth(request);
    const { searchParams } = new URL(request.url);
    const appId = searchParams.get("app_id");

    if (!appId) {
      return Response.json(
        {
          error: {
            type: "invalid_request",
            code: "app_id_required",
            message: "app_id query parameter is required.",
          },
        },
        { status: 400 }
      );
    }

    const params = parseListParams(searchParams);
    const result = await listPrograms(ownerPrincipalId(auth), appId, params);

    const data = await Promise.all(
      result.data.map(async (program) => {
        const rule = await getDefaultCommissionRule(program.id);
        return serializeProgram(program, rule);
      })
    );

    return Response.json({
      data,
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireOwnerAuth(request);
    const body = await parseJsonBody(request, createProgramSchema);
    const created = await createProgram(ownerPrincipalId(auth), {
      appId: body.app_id,
      name: body.name,
      slug: body.slug,
      currency: body.currency,
      destinationUrl: body.destination_url,
      commissionRule: {
        rewardType: body.commission_rule.reward_type,
        percentValue: body.commission_rule.percent_value,
        fixedAmount: body.commission_rule.fixed_amount,
        recurringDurationMonths:
          body.commission_rule.recurring_duration_months,
      },
      minimumPayoutAmount: body.minimum_payout_amount,
      supportedPayoutMethods: body.supported_payout_methods,
      allowSelfReferral: body.allow_self_referral,
      promotionCodeFallback: body.promotion_code_fallback,
      joinPageEnabled: body.join_page_enabled,
      joinPageApproval: body.join_page_approval,
    });

    return Response.json(
      serializeProgram(created.program, created.commissionRule),
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
