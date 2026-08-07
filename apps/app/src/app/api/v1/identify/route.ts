import { z } from "zod";
import {
  handleRouteError,
  requireAppKey,
} from "@/lib/auth-context";
import { parseJsonBody } from "@/lib/api";
import {
  identifyCustomer,
  serializeIdentifyResult,
} from "@/services/identify";

const identifySchema = z
  .object({
    click_id: z.string().trim().min(1).optional(),
    attribution_evidence: z
      .object({
        type: z.literal("promotion_code"),
        value: z.string().trim().min(1).max(255),
        program_id: z.string().trim().min(1),
        program_affiliate_id: z.string().trim().min(1),
      })
      .optional(),
    external_customer_id: z.string().trim().min(1).max(255),
    email: z.string().trim().email().optional(),
  })
  .refine((value) => value.click_id || value.attribution_evidence, {
    message: "click_id or attribution_evidence is required.",
  });

export async function POST(request: Request) {
  try {
    const auth = await requireAppKey(request);
    const body = await parseJsonBody(request, identifySchema);
    const result = await identifyCustomer(auth, {
      clickId: body.click_id,
      attributionEvidence: body.attribution_evidence
        ? {
            type: body.attribution_evidence.type,
            value: body.attribution_evidence.value,
            programId: body.attribution_evidence.program_id,
            programAffiliateId:
              body.attribution_evidence.program_affiliate_id,
          }
        : undefined,
      externalCustomerId: body.external_customer_id,
      email: body.email,
    });

    return Response.json(
      serializeIdentifyResult(result),
      { status: result.attributed ? 201 : 200 }
    );
  }
  catch (error) {
    return handleRouteError(error);
  }
}
