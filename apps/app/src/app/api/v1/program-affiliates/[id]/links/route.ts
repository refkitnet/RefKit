import { z } from "zod";
import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  createAffiliateLinkForOwner,
  listAffiliateLinksForOwner,
  serializeAffiliateLink,
} from "@/services/affiliates/links";
import { requireProgramAccess } from "@/services/scoping";

const createLinkSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  link_code: z.string().trim().min(1).max(60),
  destination_url: z.string().url().optional(),
  utm_source: z.string().trim().min(1).max(255).optional(),
  utm_medium: z.string().trim().min(1).max(255).optional(),
  utm_campaign: z.string().trim().min(1).max(255).optional(),
});

async function serializeLinks(
  principalId: string,
  links: Awaited<ReturnType<typeof listAffiliateLinksForOwner>>
) {
  if (links.length === 0) {
    return [];
  }

  const program = await requireProgramAccess(principalId, links[0].programId);
  return links.map((link) => serializeAffiliateLink(link, program.destinationUrl));
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const principalId = ownerPrincipalId(auth);
    const { id } = await context.params;
    const links = await listAffiliateLinksForOwner(principalId, id);

    return Response.json({
      data: await serializeLinks(principalId, links),
      has_more: false,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const principalId = ownerPrincipalId(auth);
    const { id } = await context.params;
    const body = await parseJsonBody(request, createLinkSchema);
    const link = await createAffiliateLinkForOwner(principalId, id, {
      label: body.label,
      link_code: body.link_code,
      destinationUrl: body.destination_url,
      utmSource: body.utm_source,
      utmMedium: body.utm_medium,
      utmCampaign: body.utm_campaign,
    });
    const program = await requireProgramAccess(principalId, link.programId);

    return Response.json(
      serializeAffiliateLink(link, program.destinationUrl),
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
