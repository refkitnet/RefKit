import { z } from "zod";
import { handleRouteError, requireManagedKey } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { exportManagedCustomerData } from "@/services/managed-data-subjects";

const dataSubjectSchema = z.object({
  external_customer_id: z.string().trim().min(1).max(255),
});

export async function POST(request: Request) {
  try {
    const auth = await requireManagedKey(request);
    const body = await parseJsonBody(request, dataSubjectSchema);
    return Response.json(
      await exportManagedCustomerData(
        auth.managedAccountId,
        auth.appId,
        body.external_customer_id
      )
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
