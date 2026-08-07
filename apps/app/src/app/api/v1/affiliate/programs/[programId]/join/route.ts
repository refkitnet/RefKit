import { z } from "zod";
import { handleRouteError, requireAffiliateAuth } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { joinListedProgramForUser } from "@/services/affiliates/join";
import { serializeAffiliate } from "@/services/affiliates";

const joinSchema = z.object({
  app_agreement_version_id: z.string().trim().min(1),
  accepted_program_rules: z.literal(true, {
    errorMap: () => ({
      message: "The App agreement and RefKit rules must be accepted.",
    }),
  }),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ programId: string }> }
) {
  try {
    const auth = await requireAffiliateAuth(request);
    const { programId } = await context.params;
    const body = await parseJsonBody(request, joinSchema);
    const result = await joinListedProgramForUser({
      programId,
      userId: auth.userId,
      appAgreementVersionId: body.app_agreement_version_id,
    });

    return Response.json(
      {
        affiliate: serializeAffiliate(result.affiliate),
        status: result.status,
      },
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
