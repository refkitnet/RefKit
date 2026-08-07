import { handleRouteError, requireAdmin } from "@/lib/auth-context";
import { adminExportPayoutRunCsv } from "@/services/admin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const admin = await requireAdmin(request);
    const { id } = await context.params;
    const csv = await adminExportPayoutRunCsv(admin.userId, id);

    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="payout-batch-${id}.csv"`,
      },
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
