import { AppError } from "@/lib/errors";
import { parseAppEnvironment } from "@/lib/app-environment";
import {
  assertManagedConnectionIsActive,
  authenticateRequest,
  handleRouteError,
} from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import {
  listCommissionsForAffiliateUser,
  listCommissionsForApp,
  listCommissionsForProgram,
  serializeCommissionEntry,
} from "@/services/commissions";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    assertManagedConnectionIsActive(auth);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const programId = url.searchParams.get("program_id");
    const appId = url.searchParams.get("app_id");
    const environment = parseAppEnvironment(url.searchParams);

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

    if (auth.type === "affiliate_key") {
      const result = await listCommissionsForAffiliateUser(
        auth.userId,
        params
      );

      return Response.json({
        data: result.data.map(serializeCommissionEntry),
        has_more: result.hasMore,
      });
    }

    if (auth.type === "session") {
      if (appId) {
        const result = await listCommissionsForApp(
          auth.userId,
          appId,
          params,
          { environment },
        );

        return Response.json({
          data: result.data.map(serializeCommissionEntry),
          has_more: result.hasMore,
        });
      }

      if (programId) {
        const result = await listCommissionsForProgram(
          auth.userId,
          programId,
          params,
          { environment },
        );

        return Response.json({
          data: result.data.map(serializeCommissionEntry),
          has_more: result.hasMore,
        });
      }

      const result = await listCommissionsForAffiliateUser(
        auth.userId,
        params
      );

      return Response.json({
        data: result.data.map(serializeCommissionEntry),
        has_more: result.hasMore,
      });
    }

    if (auth.type === "managed_key") {
      const managedAppId = appId ?? auth.appId;

      if (managedAppId !== auth.appId || programId) {
        throw new AppError(
          "not_found",
          "app_not_found",
          "App not found.",
          404
        );
      }

      const result = await listCommissionsForApp(
        auth.managedAccountId,
        managedAppId,
        params,
        { environment }
      );

      return Response.json({
        data: result.data.map(serializeCommissionEntry),
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
