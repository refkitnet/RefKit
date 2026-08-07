import {
  handleRouteError,
  requireAffiliateAuth,
} from "@/lib/auth-context";
import {
  deleteAffiliateLink,
  serializeAffiliateLink,
} from "@/services/affiliates/links";
import { getProgramById } from "@/services/affiliates";

export async function DELETE(
  request: Request,
  context: { params: Promise<{ programId: string; linkId: string }> }
) {
  try {
    const auth = await requireAffiliateAuth(request);
    const { programId, linkId } = await context.params;
    const link = await deleteAffiliateLink(auth.userId, programId, linkId);
    const program = await getProgramById(programId);

    return Response.json(
      serializeAffiliateLink(
        link,
        program?.destinationUrl ?? ""
      )
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
