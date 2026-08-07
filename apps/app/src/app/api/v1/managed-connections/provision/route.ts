import { z } from "zod";
import { parseJsonBody } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { handleRouteError } from "@/lib/auth-context";
import {
  provisionManagedConnection,
  requireManagedProvisioningSecret,
} from "@/services/managed-connections";

const provisionSchema = z.object({
  provider: z
    .string()
    .trim()
    .min(2)
    .max(64)
    .regex(/^[a-z][a-z0-9_-]*$/),
  external_account_id: z.string().trim().min(16).max(255),
  display_name: z.string().trim().min(1).max(120).optional(),
  app_name: z.string().trim().min(1).max(120).optional(),
  website_url: z.string().url().optional(),
});

export async function POST(request: Request) {
  try {
    requireManagedProvisioningSecret(request);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();

    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 255) {
      throw new AppError(
        "invalid_request",
        "idempotency_key_required",
        "A stable Idempotency-Key header is required.",
        400
      );
    }

    const body = await parseJsonBody(request, provisionSchema);
    const result = await provisionManagedConnection({
      provider: body.provider,
      externalAccountId: body.external_account_id,
      displayName: body.display_name ?? "Managed account",
      appName: body.app_name,
      websiteUrl: body.website_url,
      idempotencyKey,
    });

    return Response.json(
      {
        ...result.connection,
        credentials: result.credentials
          ? {
              management_key: result.credentials.managementKey,
              live_revenue_key: result.credentials.liveRevenueKey,
              test_revenue_key: result.credentials.testRevenueKey,
              acknowledgement_id:
                result.credentials.credentialsAcknowledgementId,
              version: result.credentials.credentialsVersion,
            }
          : null,
      },
      { status: result.created ? 201 : 200 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
