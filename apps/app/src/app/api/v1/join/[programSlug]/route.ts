import { z } from "zod";
import { auth } from "@/lib/auth";
import { handleRouteError } from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { hashIp } from "@/lib/ip-hash";
import { createJoinToken } from "@/lib/join-token";
import {
  ensurePublicJoinUser,
  getPublicJoinPageContext,
} from "@/services/affiliates/join";
import {
  getCurrentAppAgreement,
  serializeAppAgreementVersion,
} from "@/services/apps/agreement";
import {
  getCurrentTermsVersion,
  serializeTermsVersion,
} from "@/services/programs/terms";

function getClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "0.0.0.0";
  }

  return request.headers.get("x-real-ip") ?? "0.0.0.0";
}

const joinSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(1).max(120).optional(),
  app_agreement_version_id: z.string().trim().min(1),
  accepted_program_rules: z.literal(true, {
    errorMap: () => ({
      message: "The App agreement and RefKit rules must be accepted.",
    }),
  }),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ programSlug: string }> }
) {
  try {
    const { programSlug } = await context.params;
    const row = await getPublicJoinPageContext(programSlug);
    const { program } = row;

    const [currentTerms, currentAgreement] = await Promise.all([
      getCurrentTermsVersion(program.id),
      getCurrentAppAgreement(program.appId),
    ]);

    return Response.json({
      name: program.name,
      slug: program.slug,
      app: {
        name: row.appName,
        logo_url: row.appLogoUrl,
      },
      join_page_enabled: program.joinPageEnabled,
      join_page_approval: program.joinPageApproval,
      current_terms_version: currentTerms
        ? serializeTermsVersion(currentTerms)
        : null,
      current_agreement_version: currentAgreement
        ? serializeAppAgreementVersion(currentAgreement)
        : null,
    });
  }
  catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ programSlug: string }> }
) {
  try {
    const { programSlug } = await context.params;
    const body = await parseJsonBody(request, joinSchema);
    const email = body.email.trim().toLowerCase();

    await checkRateLimit(`join_ip:${hashIp(getClientIp(request))}`, 10);
    await checkRateLimit(`join_email:${email}`, 5);

    const { program } = await getPublicJoinPageContext(programSlug);

    // Create only an unverified user row now. The affiliate membership is
    // created after the recipient proves control of the email by opening the
    // magic link, which returns them to the confirm page with a signed token.
    await ensurePublicJoinUser(email, body.name);

    const token = createJoinToken({
      programId: program.id,
      email,
      appAgreementVersionId: body.app_agreement_version_id,
      name: body.name,
    });

    await auth.api.signInMagicLink({
      body: {
        email,
        name: body.name,
        callbackURL: `/join/${programSlug}/confirm?token=${encodeURIComponent(token)}`,
        metadata: { type: "program_join", program_name: program.name },
      },
      headers: request.headers,
    });

    return Response.json(
      {
        status: "email_sent",
        message:
          "Check your email to confirm and finish joining this program.",
      },
      { status: 202 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
