import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  authenticateRequest,
  handleRouteError,
  requireAffiliateAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { parseListParams } from "@/lib/pagination";
import {
  createPayoutRequest,
  listPayoutRequestsForAffiliateUser,
  listPayoutRequestsForApp,
  listPayoutRequestsForProgram,
  serializePayoutRequest,
} from "@/services/payouts/payout-requests";

const createPayoutRequestSchema = z.object({
  program_id: z.string().trim().min(1),
});

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    const url = new URL(request.url);
    const params = parseListParams(url.searchParams);
    const programId = url.searchParams.get("program_id");
    const appId = url.searchParams.get("app_id");

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
      const result = await listPayoutRequestsForAffiliateUser(
        auth.userId,
        params
      );

      return Response.json({
        data: result.data.map(serializePayoutRequest),
        has_more: result.hasMore,
      });
    }

    if (auth.type === "session") {
      if (appId) {
        const result = await listPayoutRequestsForApp(
          auth.userId,
          appId,
          params
        );

        return Response.json({
          data: result.data.map(serializePayoutRequest),
          has_more: result.hasMore,
        });
      }

      if (programId) {
        const result = await listPayoutRequestsForProgram(
          auth.userId,
          programId,
          params
        );

        return Response.json({
          data: result.data.map(serializePayoutRequest),
          has_more: result.hasMore,
        });
      }

      const result = await listPayoutRequestsForAffiliateUser(
        auth.userId,
        params
      );

      return Response.json({
        data: result.data.map(serializePayoutRequest),
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

export async function POST(request: Request) {
  try {
    const auth = await requireAffiliateAuth(request);
    const body = await parseJsonBody(request, createPayoutRequestSchema);
    const payoutRequest = await createPayoutRequest(
      auth.userId,
      body.program_id
    );

    return Response.json(serializePayoutRequest(payoutRequest), {
      status: 201,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
