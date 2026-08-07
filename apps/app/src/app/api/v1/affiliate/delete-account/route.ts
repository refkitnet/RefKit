import { z } from "zod";
import {
  handleRouteError,
  requireAffiliateAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { deleteAffiliateAccount } from "@/services/affiliates/compliance";

const deleteAccountSchema = z.object({
  waive_balance: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const auth = await requireAffiliateAuth(request);
    const body = await parseJsonBody(request, deleteAccountSchema);
    const result = await deleteAffiliateAccount(auth.userId, {
      waiveBalance: body.waive_balance,
    });

    return Response.json(result);
  }
  catch (error) {
    return handleRouteError(error);
  }
}
