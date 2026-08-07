import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import {
  WEBHOOK_EVENT_TYPES,
  configureWebhookEndpoint,
  deleteWebhookEndpoint,
  getWebhookEndpoint,
  serializeWebhookEndpoint,
} from "@/services/webhooks";

const webhookEventSchema = z.enum(WEBHOOK_EVENT_TYPES);
const configureWebhookSchema = z.object({
  url: z.string().trim().url(),
  enabled_events: z.array(webhookEventSchema).max(WEBHOOK_EVENT_TYPES.length),
  enabled: z.boolean().default(true),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const session = await requireSession(request);
    const { id: appId } = await context.params;
    const endpoint = await getWebhookEndpoint(session.userId, appId);

    return Response.json({
      webhook: endpoint ? serializeWebhookEndpoint(endpoint) : null,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    const session = await requireSession(request);
    const { id: appId } = await context.params;
    const body = await parseJsonBody(request, configureWebhookSchema);
    const result = await configureWebhookEndpoint(session.userId, appId, {
      url: body.url,
      enabledEvents: body.enabled_events,
      enabled: body.enabled,
    });

    return Response.json({
      webhook: serializeWebhookEndpoint(result.endpoint),
      secret: result.secret,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const session = await requireSession(request);
    const { id: appId } = await context.params;
    await deleteWebhookEndpoint(session.userId, appId);
    return Response.json({ deleted: true });
  }
  catch (error) {
    return handleRouteError(error);
  }
}
