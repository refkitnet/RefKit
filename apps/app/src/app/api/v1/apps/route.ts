import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { parseListParams } from "@/lib/pagination";
import {
  currencyCodeSchema,
  nonNegativeMinorUnitAmountSchema,
  positiveMinorUnitAmountSchema,
} from "@/lib/money";
import {
  createApp,
  getDefaultProgramIds,
  listApps,
  serializeApp,
} from "@/services/apps";

const commissionRuleSchema = z.object({
  reward_type: z.enum(["percent", "fixed"]),
  percent_value: z.number().positive().max(100).optional(),
  fixed_amount: positiveMinorUnitAmountSchema.optional(),
  recurring_duration_months: z.number().int().positive().nullable().optional(),
});

const defaultProgramSchema = z.object({
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

const createAppSchema = z.object({
  organization_id: z.string().trim().min(1),
  name: z.string().trim().min(1).max(120),
  website_url: z.string().url().optional(),
  revenue_source: z.enum(["stripe", "api"]).optional(),
  default_program: defaultProgramSchema.optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get("organization_id");

    if (!organizationId) {
      return Response.json(
        {
          error: {
            type: "invalid_request",
            code: "organization_id_required",
            message: "organization_id query parameter is required.",
          },
        },
        { status: 400 }
      );
    }

    const params = parseListParams(searchParams);
    const result = await listApps(
      session.userId,
      organizationId,
      params
    );

    const defaultProgramIds = await getDefaultProgramIds(
      result.data.map((app) => app.id)
    );

    return Response.json({
      data: result.data.map((app) =>
        serializeApp({
          ...app,
          defaultProgramId: defaultProgramIds.get(app.id) ?? null,
        })
      ),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await parseJsonBody(request, createAppSchema);
    const app = await createApp(session.userId, {
      organizationId: body.organization_id,
      name: body.name,
      websiteUrl: body.website_url,
      revenueSource: body.revenue_source,
      defaultProgram: body.default_program
        ? {
            name: body.default_program.name,
            slug: body.default_program.slug,
            currency: body.default_program.currency,
            destinationUrl: body.default_program.destination_url,
            commissionRule: {
              rewardType: body.default_program.commission_rule.reward_type,
              percentValue:
                body.default_program.commission_rule.percent_value,
              fixedAmount:
                body.default_program.commission_rule.fixed_amount,
              recurringDurationMonths:
                body.default_program.commission_rule.recurring_duration_months,
            },
            minimumPayoutAmount:
              body.default_program.minimum_payout_amount,
            supportedPayoutMethods:
              body.default_program.supported_payout_methods,
            allowSelfReferral: body.default_program.allow_self_referral,
            promotionCodeFallback:
              body.default_program.promotion_code_fallback,
            joinPageEnabled: body.default_program.join_page_enabled,
            joinPageApproval: body.default_program.join_page_approval,
          }
        : undefined,
    });

    return Response.json(serializeApp(app), { status: 201 });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
