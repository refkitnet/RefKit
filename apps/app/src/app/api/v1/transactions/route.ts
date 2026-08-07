import { z } from "zod";
import { parseAppEnvironment } from "@/lib/app-environment";
import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
  requireAppKey,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  currencyCodeSchema,
  nonNegativeMinorUnitAmountSchema,
} from "@/lib/money";
import { parseListParams } from "@/lib/pagination";
import {
  listTransactionsForApp,
  listTransactionsForProgram,
  serializeTransaction,
} from "@/services/transactions";
import {
  reportPayment,
  serializeReportPaymentResult,
} from "@/services/revenue/report-payment";

const reportPaymentSchema = z.object({
  payment_id: z.string().trim().min(1).max(255),
  customer_id: z.string().trim().min(1),
  program_id: z.string().trim().min(1),
  amount: nonNegativeMinorUnitAmountSchema,
  currency: currencyCodeSchema,
  paid_at: z.string().datetime().optional(),
});

export async function GET(request: Request) {
  try {
    const auth = await requireOwnerAuth(request);
    const principalId = ownerPrincipalId(auth);
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
      const result = await listTransactionsForApp(
        principalId,
        appId,
        params,
        { environment },
      );

      return Response.json({
        data: result.data.map(serializeTransaction),
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

    const result = await listTransactionsForProgram(
      principalId,
      programId,
      params,
      { environment },
    );

    return Response.json({
      data: result.data.map(serializeTransaction),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAppKey(request);
    const body = await parseJsonBody(request, reportPaymentSchema);
    const result = await reportPayment(auth, {
      paymentId: body.payment_id,
      customerId: body.customer_id,
      programId: body.program_id,
      amount: body.amount,
      currency: body.currency,
      paidAt: body.paid_at ? new Date(body.paid_at) : undefined,
    });

    return Response.json(serializeReportPaymentResult(result), {
      status: result.created ? 201 : 200,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
