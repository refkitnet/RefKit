import { AppError } from "@/lib/errors";
import { parseAppEnvironment } from "@/lib/app-environment";
import {
  authenticateRequest,
  handleRouteError,
} from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import {
  listClicksForAffiliate,
  listClicksForProgram,
  serializeClick,
} from "@/services/clicks/list";
import { resolveProgramListAccess } from "@/services/scoping";

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const { searchParams } = new URL(request.url);
    const programId = searchParams.get("program_id");
    const environment = parseAppEnvironment(searchParams);

    if (!programId) {
      return Response.json(
        {
          error: {
            type: "invalid_request",
            code: "program_id_required",
            message: "program_id query parameter is required.",
          },
        },
        { status: 400 }
      );
    }

    const params = parseListParams(searchParams);

    if (auth.type === "session") {
      const access = await resolveProgramListAccess(auth.userId, programId);
      const result = access === "owner"
        ? await listClicksForProgram(auth.userId, programId, params, {
            environment,
          })
        : await listClicksForAffiliate(auth.userId, programId, params);

      return Response.json({
        data: result.data.map(serializeClick),
        has_more: result.hasMore,
      });
    }

    if (auth.type === "affiliate_key") {
      const result = await listClicksForAffiliate(
        auth.userId,
        programId,
        params
      );

      return Response.json({
        data: result.data.map(serializeClick),
        has_more: result.hasMore,
      });
    }

    throw new AppError(
      "unauthorized",
      "unsupported_credential",
      "Use a session token or affiliate API key.",
      401
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
