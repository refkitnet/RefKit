import { handleRouteError, requireSession } from "@/lib/auth-context";
import {
  rotateWebhookSecret,
  serializeWebhookEndpoint,
} from "@/services/webhooks";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id: appId } = await context.params;
    const result = await rotateWebhookSecret(session.userId, appId);

    return Response.json({
      webhook: serializeWebhookEndpoint(result.endpoint),
      secret: result.secret,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
