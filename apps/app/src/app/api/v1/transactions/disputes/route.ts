import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import { handleRouteError, requireAppKey } from "@/lib/auth-context";
import { positiveMinorUnitAmountSchema } from "@/lib/money";
import { REVENUE_DISPUTE_STATUSES } from "@/services/revenue/disputes";
import {
  reportDispute,
  serializeReportDisputeResult,
} from "@/services/revenue/report-payment";

const reportDisputeSchema = z.object({
  dispute_id: z.string().trim().min(1).max(255),
  payment_id: z.string().trim().min(1).max(255),
  status: z.enum(REVENUE_DISPUTE_STATUSES),
  amount: positiveMinorUnitAmountSchema,
  occurred_at: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAppKey(request);
    const body = await parseJsonBody(request, reportDisputeSchema);
    const result = await reportDispute(auth, {
      disputeId: body.dispute_id,
      paymentId: body.payment_id,
      status: body.status,
      amount: body.amount,
      occurredAt: body.occurred_at ? new Date(body.occurred_at) : undefined,
    });

    return Response.json(serializeReportDisputeResult(result), {
      status: result.created ? 201 : 200,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
