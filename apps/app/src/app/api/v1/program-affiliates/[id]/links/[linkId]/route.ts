import { z } from "zod";
import {
  handleRouteError,
  ownerPrincipalId,
  requireOwnerAuth,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  deleteAffiliateLinkForOwner,
  serializeAffiliateLink,
  updateAffiliateLinkForOwner,
} from "@/services/affiliates/links";
import { requireProgramAccess } from "@/services/scoping";

const updateLinkSchema = z.object({
  label: z.string().trim().min(1).max(120).optional(),
  destination_url: z.string().url().nullable().optional(),
  utm_source: z.string().trim().min(1).max(255).nullable().optional(),
  utm_medium: z.string().trim().min(1).max(255).nullable().optional(),
  utm_campaign: z.string().trim().min(1).max(255).nullable().optional(),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const principalId = ownerPrincipalId(auth);
    const { id, linkId } = await context.params;
    const body = await parseJsonBody(request, updateLinkSchema);
    const link = await updateAffiliateLinkForOwner(
      principalId,
      id,
      linkId,
      {
        label: body.label,
        destinationUrl: body.destination_url,
        utmSource: body.utm_source,
        utmMedium: body.utm_medium,
        utmCampaign: body.utm_campaign,
      }
    );
    const program = await requireProgramAccess(principalId, link.programId);

    return Response.json(serializeAffiliateLink(link, program.destinationUrl));
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; linkId: string }> }
) {
  try {
    const auth = await requireOwnerAuth(request);
    const principalId = ownerPrincipalId(auth);
    const { id, linkId } = await context.params;
    const link = await deleteAffiliateLinkForOwner(principalId, id, linkId);
    const program = await requireProgramAccess(principalId, link.programId);

    return Response.json(serializeAffiliateLink(link, program.destinationUrl));
  }
  catch (error) {
    return handleRouteError(error);
  }
}
