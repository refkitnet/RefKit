import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { exportReadyPayoutsCsv } from "@/services/payouts/ready-payouts";

const exportSchema = z.object({
  program_id: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await parseJsonBody(request, exportSchema);
    const result = await exportReadyPayoutsCsv(
      session.userId,
      body.program_id
    );

    return new Response(result.csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payouts-${body.program_id}.csv"`,
      },
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
