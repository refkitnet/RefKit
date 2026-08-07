import { z } from "zod";
import { handleRouteError, requireSession } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  getCurrentAppAgreement,
  publishAppAgreement,
  serializeAppAgreementVersion,
} from "@/services/apps/agreement";
import { requireAppAccess } from "@/services/scoping";

const publishAgreementSchema = z.object({
  terms_text: z.string().trim().min(1).max(20000),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireSession(request);
    const { id: appId } = await context.params;
    await requireAppAccess(session.userId, appId);

    const current = await getCurrentAppAgreement(appId);

    if (!current) {
      return Response.json({ agreement_version: null });
    }

    return Response.json({
      agreement_version: serializeAppAgreementVersion(current),
    });
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
    const session = await requireSession(request);
    const { id: appId } = await context.params;
    const body = await parseJsonBody(request, publishAgreementSchema);
    await requireAppAccess(session.userId, appId);

    const published = await publishAppAgreement(
      session.userId,
      appId,
      body.terms_text
    );

    return Response.json(
      {
        agreement_version: serializeAppAgreementVersion(published),
      },
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
