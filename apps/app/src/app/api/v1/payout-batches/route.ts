import { z } from "zod";
import { AppError } from "@/lib/errors";
import {
  assertManagedConnectionIsActive,
  authenticateRequest,
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { parseListParams } from "@/lib/pagination";
import {
  createPayoutRun,
  listPayoutRunsForAffiliateUser,
  listPayoutRunsForApp,
  listPayoutRunsForProgram,
  serializePayoutRun,
  serializePayoutRunForAffiliate,
} from "@/services/payouts/payout-batches";
import { getPayoutExecutionsForBatches } from "@/services/payouts/payout-executions";

const createPayoutRunSchema = z.object({
  program_id: z.string().trim().min(1),
});

export async function GET(request: Request) {
  try {
    const auth = await authenticateRequest(request);
    assertManagedConnectionIsActive(auth);
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
      const result = await listPayoutRunsForAffiliateUser(
        auth.userId,
        params
      );

      return Response.json({
        data: result.data.map(serializePayoutRunForAffiliate),
        has_more: result.hasMore,
      });
    }

    if (auth.type === "session") {
      if (appId) {
        const result = await listPayoutRunsForApp(
          auth.userId,
          appId,
          params
        );

        const executions = await getPayoutExecutionsForBatches(
          result.data.map((run) => run.id)
        );

        return Response.json({
          data: result.data.map((run) =>
            serializePayoutRun(
              run,
              executions.filter(
                (execution) => execution.payoutBatchId === run.id
              )
            )
          ),
          has_more: result.hasMore,
        });
      }

      if (programId) {
        const result = await listPayoutRunsForProgram(
          auth.userId,
          programId,
          params
        );

        const executions = await getPayoutExecutionsForBatches(
          result.data.map((run) => run.id)
        );

        return Response.json({
          data: result.data.map((run) =>
            serializePayoutRun(
              run,
              executions.filter(
                (execution) => execution.payoutBatchId === run.id
              )
            )
          ),
          has_more: result.hasMore,
        });
      }

      const result = await listPayoutRunsForAffiliateUser(
        auth.userId,
        params
      );

      return Response.json({
        data: result.data.map(serializePayoutRunForAffiliate),
        has_more: result.hasMore,
      });
    }

    if (auth.type === "managed_key") {
      const managedAppId = appId ?? auth.appId;

      if (managedAppId !== auth.appId || programId) {
        throw new AppError("not_found", "app_not_found", "App not found.", 404);
      }

      const result = await listPayoutRunsForApp(
        auth.managedAccountId,
        managedAppId,
        params
      );
      const executions = await getPayoutExecutionsForBatches(
        result.data.map((run) => run.id)
      );

      return Response.json({
        data: result.data.map((run) =>
          serializePayoutRun(
            run,
            executions.filter(
              (execution) => execution.payoutBatchId === run.id
            )
          )
        ),
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
    const auth = await requireOwnerAuth(request);
    const body = await parseJsonBody(request, createPayoutRunSchema);
    const run = await createPayoutRun(ownerPrincipalId(auth), body.program_id);

    return Response.json(serializePayoutRun(run), { status: 201 });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
