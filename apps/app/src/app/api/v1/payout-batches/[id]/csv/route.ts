import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { generatePayoutRunCsv } from "@/services/payouts/payout-batches";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: Request,
  context: RouteContext
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id } = await context.params;
    const csv = await generatePayoutRunCsv(ownerPrincipalId(auth), id);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payout-run-${id}.csv"`,
      },
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
