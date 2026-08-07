import { z } from "zod";
import { AppError } from "@/lib/errors";
import { handleRouteError, requireSessionUser } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { verifyJoinToken } from "@/lib/join-token";
import {
  assertPublicJoinProgramMatches,
  joinProgramViaPublicPage,
} from "@/services/affiliates/join";
import {
  getAffiliateUsers,
  serializeAffiliate,
} from "@/services/affiliates";

const confirmSchema = z.object({
  token: z.string().trim().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ programSlug: string }> }
) {
  try {
    const { programSlug } = await context.params;
    const session = await requireSessionUser(request);
    const body = await parseJsonBody(request, confirmSchema);

    let payload;
    try {
      payload = verifyJoinToken(body.token);
    }
    catch {
      throw new AppError(
        "invalid_request",
        "join_token_invalid",
        "This signup link is invalid or has expired. Start the signup again.",
        400
      );
    }

    const sessionEmail = session.email?.trim().toLowerCase();

    // The magic link proves the recipient controls the email; require the
    // verified session to match the email the token was issued for.
    if (!sessionEmail || sessionEmail !== payload.email) {
      throw new AppError(
        "forbidden",
        "join_email_mismatch",
        "Open the signup confirmation link from the same email you signed up with.",
        403
      );
    }

    await assertPublicJoinProgramMatches(programSlug, payload.programId);

    const result = await joinProgramViaPublicPage({
      programSlug,
      email: sessionEmail,
      name: payload.name,
      appAgreementVersionId: payload.appAgreementVersionId,
    });

    const affiliateUsers = await getAffiliateUsers([result.affiliate]);
    const user = affiliateUsers.get(result.affiliate.userId);

    return Response.json(
      {
        affiliate: serializeAffiliate(result.affiliate, user ?? undefined),
        status: result.status,
        message:
          result.status === "pending"
            ? "Signup received. The developer will review your application."
            : "You are now an active affiliate. Sign in to view your links.",
      },
      { status: 201 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
