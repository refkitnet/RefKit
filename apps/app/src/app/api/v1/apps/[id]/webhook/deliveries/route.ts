import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseListParams } from "@/lib/pagination";
import {
  listWebhookDeliveries,
  serializeWebhookDelivery,
} from "@/services/webhooks";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id: appId } = await context.params;
    const params = parseListParams(new URL(request.url).searchParams);
    const result = await listWebhookDeliveries(session.userId, appId, params);

    return Response.json({
      data: result.data.map(serializeWebhookDelivery),
      has_more: result.hasMore,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
