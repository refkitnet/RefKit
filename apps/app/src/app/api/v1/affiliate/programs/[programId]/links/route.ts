import { z } from "zod";
import {
  handleRouteError,
  requireAffiliateAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  createAffiliateLink,
  listAffiliateLinks,
  serializeAffiliateLink,
} from "@/services/affiliates/links";
import { getProgramById } from "@/services/affiliates";

const createLinkSchema = z
  .object({
    label: z.string().trim().min(1).max(120).optional(),
    link_code: z.string().trim().min(1).max(60).optional(),
    slug: z.string().trim().min(1).max(60).optional(),
    destination_url: z.string().url().optional(),
    utm_source: z.string().trim().max(120).optional(),
    utm_medium: z.string().trim().max(120).optional(),
    utm_campaign: z.string().trim().max(120).optional(),
  })
  .refine((body) => Boolean(body.link_code || body.slug || body.label), {
    message: "Either link_code or label is required.",
    path: ["link_code"],
  });

export async function GET(
  request: Request,
  context: { params: Promise<{ programId: string }> }
) {
  try {
    const auth = await requireAffiliateAuth(request);
    const { programId } = await context.params;
    const links = await listAffiliateLinks(auth.userId, programId);
    const program = await getProgramById(programId);

    return Response.json({
      data: links.map((link) =>
        serializeAffiliateLink(
          link,
          program?.destinationUrl ?? ""
        )
      ),
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ programId: string }> }
) {
  try {
    const auth = await requireAffiliateAuth(request);
    const { programId } = await context.params;
    const body = await parseJsonBody(request, createLinkSchema);
    const link = await createAffiliateLink(auth.userId, programId, {
      label: body.label,
      link_code: body.link_code,
      slug: body.slug,
      destinationUrl: body.destination_url,
      utmSource: body.utm_source,
      utmMedium: body.utm_medium,
      utmCampaign: body.utm_campaign,
    });
    const program = await getProgramById(programId);

    return Response.json(
      serializeAffiliateLink(
        link,
        program?.destinationUrl ?? ""
      ),
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
