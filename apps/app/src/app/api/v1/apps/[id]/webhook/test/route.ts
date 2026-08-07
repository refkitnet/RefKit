import { handleRouteError, requireSession } from "@/lib/auth-context";
import {
  sendTestWebhook,
  serializeWebhookDelivery,
} from "@/services/webhooks";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id: appId } = await context.params;
    const delivery = await sendTestWebhook(session.userId, appId);

    return Response.json({ delivery: serializeWebhookDelivery(delivery) });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
