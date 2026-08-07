import {
  handleRouteError,
  requireAffiliateAuth,
} from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import { listAffiliateLinksForUser } from "@/services/links";

export async function GET(request: Request) {
  try {
    const auth = await requireAffiliateAuth(request);
    const { searchParams } = new URL(request.url);
    const params = parseListParams(searchParams);
    const result = await listAffiliateLinksForUser(
      auth.userId,
      params
    );

    return Response.json({
      data: result.data,
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
