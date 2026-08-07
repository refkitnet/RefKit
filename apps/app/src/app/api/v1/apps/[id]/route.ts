import { z } from "zod";
import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { AppError } from "@/lib/errors";
import { parseJsonBody } from "@/lib/api";
import {
  getAppById,
  serializeApp,
  setAppNetworkVisibility,
  setDefaultProgram,
  updateAppRevenueSource,
  updateAppWebsiteUrl,
} from "@/services/apps";

const updateAppSchema = z
  .object({
    website_url: z.string().url().optional(),
    revenue_source: z.enum(["stripe", "api"]).optional(),
    default_program_id: z.string().trim().min(1).optional(),
    network_visible: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.website_url !== undefined ||
      value.revenue_source !== undefined ||
      value.default_program_id !== undefined ||
      value.network_visible !== undefined,
    {
      message:
        "Provide website_url, revenue_source, default_program_id, or network_visible.",
    }
  );

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const { id } = await context.params;
    const app = await getAppById(ownerPrincipalId(auth), id);

    return Response.json(serializeApp(app));
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const principalId = ownerPrincipalId(auth);
    const { id } = await context.params;
    const body = await parseJsonBody(request, updateAppSchema);

    if (
      auth.type === "managed_key"
      && (body.revenue_source !== undefined || body.network_visible !== undefined)
    ) {
      throw new AppError(
        "unauthorized",
        "managed_app_field_forbidden",
        "Managed connections cannot change revenue source or Network visibility.",
        403
      );
    }

    if (body.website_url !== undefined) {
      await updateAppWebsiteUrl(
        principalId,
        id,
        body.website_url
      );
    }

    if (body.revenue_source !== undefined) {
      await updateAppRevenueSource(
        principalId,
        id,
        body.revenue_source
      );
    }

    if (body.default_program_id !== undefined) {
      await setDefaultProgram(
        principalId,
        id,
        body.default_program_id
      );
    }

    if (body.network_visible !== undefined) {
      await setAppNetworkVisibility(
        principalId,
        id,
        body.network_visible
      );
    }

    const app = await getAppById(principalId, id);

    return Response.json(serializeApp(app));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
