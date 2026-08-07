import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody, toIso } from "@/lib/api";
import { createApiKey, listApiKeys } from "@/services/api-keys";
import { requireOrganizationMembership } from "@/services/organizations";

const createApiKeySchema = z.object({
  kind: z.enum(["app", "affiliate"]),
  organization_id: z.string().optional(),
  app_id: z.string().optional(),
  name: z.string().trim().max(120).optional(),
  test_mode: z.boolean().optional(),
});

export async function GET(request: Request) {
  try {
    const session = await requireSession(request);
    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id") ?? undefined;
    const keys = await listApiKeys(session.userId, organizationId);

    return Response.json({
      data: keys.map((key) => ({
        id: key.id,
        kind: key.kind,
        prefix: key.prefix,
        name: key.name,
        organization_id: key.organizationId,
        app_id: key.appId,
        last_used_at: key.lastUsedAt ? toIso(key.lastUsedAt) : null,
        created_at: toIso(key.createdAt),
      })),
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    const body = await parseJsonBody(request, createApiKeySchema);

    if (body.organization_id) {
      await requireOrganizationMembership(session.userId, body.organization_id);
    }

    const created = await createApiKey({
      userId: session.userId,
      kind: body.kind,
      organizationId: body.organization_id,
      appId: body.app_id,
      name: body.name,
      testMode: body.test_mode,
    });

    return Response.json(
      {
        id: created.id,
        kind: created.kind,
        prefix: created.prefix,
        name: created.name,
        organization_id: created.organizationId,
        app_id: created.appId,
        key: created.key,
        created_at: toIso(created.createdAt),
      },
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
