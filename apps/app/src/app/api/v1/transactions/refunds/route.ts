import { z } from "zod";
import { handleRouteError, requireAppKey } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { positiveMinorUnitAmountSchema } from "@/lib/money";
import {
  reportRefund,
  serializeReportRefundResult,
} from "@/services/revenue/report-payment";

const reportRefundSchema = z.object({
  refund_id: z.string().trim().min(1).max(255),
  payment_id: z.string().trim().min(1).max(255),
  amount: positiveMinorUnitAmountSchema,
  refunded_at: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAppKey(request);
    const body = await parseJsonBody(request, reportRefundSchema);
    const result = await reportRefund(auth, {
      refundId: body.refund_id,
      paymentId: body.payment_id,
      amount: body.amount,
      refundedAt: body.refunded_at ? new Date(body.refunded_at) : undefined,
    });

    return Response.json(serializeReportRefundResult(result), {
      status: result.created ? 201 : 200,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
