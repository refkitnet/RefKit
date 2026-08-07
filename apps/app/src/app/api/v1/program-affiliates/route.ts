import { z } from "zod";
import { parseAppEnvironment } from "@/lib/app-environment";
import { AppError } from "@/lib/errors";
import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { parseListParams } from "@/lib/pagination";
import {
  createAffiliate,
  getAffiliateDefaultLinks,
  getAffiliateUsers,
  listAffiliates,
  listAffiliatesForApp,
  serializeAffiliate,
} from "@/services/affiliates";

const createAffiliateSchema = z.object({
  program_id: z.string().trim().min(1),
  email: z.string().trim().email().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  test_mode: z.boolean().optional(),
}).superRefine((value, context) => {
  if (!value.test_mode && !value.email) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["email"],
      message: "Email is required for an affiliate invite.",
    });
  }
});

export async function GET(request: Request) {
  try {
    const auth = await requireOwnerAuth(request);
    const principalId = ownerPrincipalId(auth);
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get("program_id");
    const appId = searchParams.get("app_id");
    const environment = parseAppEnvironment(searchParams);
    const testModeValue = searchParams.get("test_mode");
    const legacyTestMode = testModeValue === "true";
    const testMode = environment
      ? environment === "test"
      : legacyTestMode;
    const params = parseListParams(searchParams);

    if (
      environment
      && testModeValue !== null
      && legacyTestMode !== (environment === "test")
    ) {
      throw new AppError(
        "invalid_request",
        "conflicting_environment",
        "environment and test_mode must select the same data.",
        400,
      );
    }

    if (programId && appId) {
      return Response.json(
        {
          error: {
            type: "invalid_request",
            code: "conflicting_scope",
            message: "Provide either program_id or app_id, not both.",
          },
        },
        { status: 400 }
      );
    }

    if (appId) {
      const result = await listAffiliatesForApp(principalId, appId, params, {
        testMode,
      });
      const [userMap, linkMap] = await Promise.all([
        getAffiliateUsers(result.data),
        getAffiliateDefaultLinks(result.data),
      ]);

      return Response.json({
        data: result.data.map((affiliate) =>
          serializeAffiliate(
            affiliate,
            userMap.get(affiliate.userId),
            linkMap.get(affiliate.id)
          )
        ),
        has_more: result.hasMore,
      });
    }

    if (!programId) {
      return Response.json(
        {
          error: {
            type: "invalid_request",
            code: "scope_required",
            message: "program_id or app_id query parameter is required.",
          },
        },
        { status: 400 }
      );
    }

    const result = await listAffiliates(principalId, programId, params, {
      testMode,
    });
    const [userMap, linkMap] = await Promise.all([
      getAffiliateUsers(result.data),
      getAffiliateDefaultLinks(result.data),
    ]);

    return Response.json({
      data: result.data.map((affiliate) =>
        serializeAffiliate(
          affiliate,
          userMap.get(affiliate.userId),
          linkMap.get(affiliate.id)
        )
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
    const auth = await requireOwnerAuth(request);
    const body = await parseJsonBody(request, createAffiliateSchema);
    const created = await createAffiliate(ownerPrincipalId(auth), {
      programId: body.program_id,
      email: body.email,
      name: body.name,
      testMode: body.test_mode,
    });

    return Response.json(
      {
        ...serializeAffiliate(created.affiliate, {
          email: created.user.email,
          name: created.user.name,
          image: created.user.image,
        }, created.link),
        link_id: created.link.id,
      },
      { status: created.created ? 201 : 200 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
