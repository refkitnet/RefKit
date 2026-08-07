import { AppError } from "@/lib/errors";
import { parseAppEnvironment } from "@/lib/app-environment";
import {
  assertManagedConnectionIsActive,
  authenticateRequest,
  handleRouteError,
} from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import {
  listReferralsForAffiliate,
  listReferralsForApp,
  listReferralsForProgram,
  serializeReferrals,
} from "@/services/referrals";
import { resolveProgramListAccess } from "@/services/scoping";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    assertManagedConnectionIsActive(auth);
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get("program_id");
    const appId = searchParams.get("app_id");
    const environment = parseAppEnvironment(searchParams);
    const params = parseListParams(searchParams);

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
      if (auth.type !== "session" && auth.type !== "managed_key") {
        throw new AppError(
          "unauthorized",
          "unsupported_credential",
          "app_id listing requires Developer authentication.",
          401
        );
      }

      const principalId = auth.type === "session"
        ? auth.userId
        : auth.managedAccountId;

      if (auth.type === "managed_key" && appId !== auth.appId) {
        throw new AppError("not_found", "app_not_found", "App not found.", 404);
      }

      const result = await listReferralsForApp(principalId, appId, params, {
        environment,
      });

      return Response.json({
        data: await serializeReferrals(result.data),
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

    if (auth.type === "session") {
      const access = await resolveProgramListAccess(auth.userId, programId);
      const result = access === "owner"
        ? await listReferralsForProgram(auth.userId, programId, params, {
            environment,
          })
        : await listReferralsForAffiliate(auth.userId, programId, params);

      return Response.json({
        data: await serializeReferrals(result.data),
        has_more: result.hasMore,
      });
    }

    if (auth.type === "managed_key") {
      const result = await listReferralsForProgram(
        auth.managedAccountId,
        programId,
        params,
        { environment }
      );

      return Response.json({
        data: await serializeReferrals(result.data),
        has_more: result.hasMore,
      });
    }

    if (auth.type === "affiliate_key") {
      const result = await listReferralsForAffiliate(
        auth.userId,
        programId,
        params
      );

      return Response.json({
        data: await serializeReferrals(result.data),
        has_more: result.hasMore,
      });
    }

    throw new AppError(
      "unauthorized",
      "unsupported_credential",
      "Use a Developer session, managed key, or Affiliate API key.",
      401
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
