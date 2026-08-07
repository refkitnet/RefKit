import { isIP } from "node:net";
import { z } from "zod";
import { handleRouteError, requireAppKey } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { AppError } from "@/lib/errors";
import {
  publicCorsPreflightResponse,
  withPublicCors,
} from "@/lib/cors";
import { captureAffiliateClick } from "@/services/clicks";

const captureSchema = z.object({
  via: z.string().trim().min(1).max(60),
  page: z.string().url().optional(),
  referrer: z.string().url().optional(),
  refkit_app: z.string().trim().min(1).max(64).optional(),
});

const serverCaptureSchema = captureSchema.extend({
  visitor_ip: z
    .string()
    .trim()
    .min(1)
    .max(45)
    .refine((value) => isIP(value) !== 0, "Must be a valid IP address.")
    .optional(),
  visitor_user_agent: z.string().trim().min(1).max(1024).optional(),
});

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "0.0.0.0";
  }

  return request.headers.get("x-real-ip") ?? "0.0.0.0";
}

export async function OPTIONS() {
  return publicCorsPreflightResponse();
}

export async function POST(request: Request) {
  try {
    const hasAuthorization = request.headers.has("authorization");
    const auth = hasAuthorization ? await requireAppKey(request) : null;

    if (auth && !auth.appId) {
      throw new AppError(
        "invalid_request",
        "app_scope_required",
        "Server capture requires an app-scoped API key.",
        400
      );
    }

    let body: z.infer<typeof captureSchema>;
    let visitorIp: string | undefined;
    let visitorUserAgent: string | undefined;

    if (auth) {
      const serverBody = await parseJsonBody(request, serverCaptureSchema);
      body = serverBody;
      visitorIp = serverBody.visitor_ip;
      visitorUserAgent = serverBody.visitor_user_agent;
    }
    else {
      body = await parseJsonBody(request, captureSchema);
    }

    const result = await captureAffiliateClick({
      via: body.via,
      page: body.page ?? null,
      referrer: body.referrer ?? null,
      ip: visitorIp ?? getClientIp(request),
      userAgent: visitorUserAgent ?? request.headers.get("user-agent"),
      appId: auth?.appId ?? undefined,
      refkitAppId: auth ? null : (body.refkit_app ?? null),
    });

    return withPublicCors(
      Response.json({
        click_id: result.clickId,
      })
    );
  }
  catch (error) {
    return withPublicCors(handleRouteError(error));
  }
}
