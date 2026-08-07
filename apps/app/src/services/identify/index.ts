import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  programAffiliates,
  clicks,
  customers,
  programs,
  referrals,
} from "@/db/schema";
import { AppKeyAuthContext } from "@/lib/auth-context";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { checkRateLimit } from "@/lib/rate-limit";
import { requireAppInOrganization } from "@/services/apps";
import { pinTermsOnReferral } from "@/services/programs/terms";
import { emitWebhookEvent } from "@/services/webhooks";

const ATTRIBUTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type IdentifyInput = {
  clickId?: string;
  attributionEvidence?: {
    type: "promotion_code";
    value: string;
    programId: string;
    programAffiliateId: string;
  };
  externalCustomerId: string;
  email?: string;
};

async function assertProgramMatchesAuth(
  auth: AppKeyAuthContext,
  program: typeof programs.$inferSelect,
  notFoundCode: string
) {
  if (auth.appId) {
    if (program.appId !== auth.appId) {
      throw new AppError("not_found", notFoundCode, "Attribution not found.", 404);
    }

    return;
  }

  if (!auth.userId) {
    throw new AppError("unauthorized", "invalid_api_key", "Invalid API key.", 401);
  }

  await requireAppInOrganization(
    auth.userId,
    auth.organizationId,
    program.appId
  );
}

async function resolveAttribution(
  auth: AppKeyAuthContext,
  input: IdentifyInput
) {
  const db = getDb();

  if (input.clickId) {
    const [click] = await db
      .select()
      .from(clicks)
      .where(eq(clicks.id, input.clickId))
      .limit(1);

    if (!click) {
      throw new AppError("not_found", "click_not_found", "Click not found.", 404);
    }

    if (Date.now() - click.createdAt.getTime() > ATTRIBUTION_WINDOW_MS) {
      throw new AppError(
        "invalid_request",
        "click_expired",
        "Click is outside the 30-day attribution window.",
        400
      );
    }

    const [program] = await db
      .select()
      .from(programs)
      .where(eq(programs.id, click.programId))
      .limit(1);

    if (!program) {
      throw new AppError(
        "not_found",
        "program_not_found",
        "Program not found.",
        404
      );
    }

    await assertProgramMatchesAuth(auth, program, "click_not_found");

    const [affiliate] = await db
      .select()
      .from(programAffiliates)
      .where(eq(programAffiliates.id, click.programAffiliateId))
      .limit(1);

    if (!affiliate || affiliate.isTest !== auth.testMode) {
      throw new AppError("not_found", "click_not_found", "Click not found.", 404);
    }

    return {
      program,
      programAffiliateId: click.programAffiliateId,
      clickId: click.id,
      source: "click" as const,
    };
  }

  const evidence = input.attributionEvidence;

  if (!evidence) {
    throw new AppError(
      "invalid_request",
      "attribution_evidence_required",
      "Provide click_id or attribution_evidence.",
      400
    );
  }

  const [row] = await db
    .select({ program: programs, affiliate: programAffiliates })
    .from(programs)
    .innerJoin(
      programAffiliates,
      and(
        eq(programAffiliates.id, evidence.programAffiliateId),
        eq(programAffiliates.programId, programs.id)
      )
    )
    .where(
      and(
        eq(programs.id, evidence.programId),
        eq(programs.promotionCodeFallback, true)
      )
    )
    .limit(1);

  if (
    !row
    || row.affiliate.status !== "active"
    || row.affiliate.isTest !== auth.testMode
  ) {
    throw new AppError(
      "not_found",
      "promotion_code_attribution_not_found",
      "Promotion-code attribution not found.",
      404
    );
  }

  await assertProgramMatchesAuth(
    auth,
    row.program,
    "promotion_code_attribution_not_found"
  );

  return {
    program: row.program,
    programAffiliateId: row.affiliate.id,
    clickId: null,
    source: "promotion_code" as const,
  };
}

export async function identifyCustomer(
  auth: AppKeyAuthContext,
  input: IdentifyInput
) {
  await checkRateLimit(`identify:${auth.keyId}`, 120);

  if (auth.managedConnectionId && input.email) {
    throw new AppError(
      "invalid_request",
      "managed_customer_email_not_allowed",
      "Managed connections must identify customers with opaque IDs only.",
      400
    );
  }

  if (
    !input.clickId
    && input.attributionEvidence
    && !auth.managedConnectionId
  ) {
    throw new AppError(
      "forbidden",
      "managed_connection_required",
      "Direct promotion-code evidence requires a managed connection.",
      403
    );
  }

  const db = getDb();
  const attribution = await resolveAttribution(auth, input);
  const program = attribution.program;

  const normalizedEmail = input.email?.trim().toLowerCase();

  let [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.appId, program.appId),
        eq(customers.externalCustomerId, input.externalCustomerId)
      )
    )
    .limit(1);

  if (!customer) {
    const customerId = generateId(ID_PREFIXES.customer);

    // onConflictDoNothing + re-select by natural key keeps concurrent
    // identify calls for the same new user from surfacing a unique violation.
    await db
      .insert(customers)
      .values({
        id: customerId,
        appId: program.appId,
        externalCustomerId: input.externalCustomerId,
        email: normalizedEmail ?? null,
      })
      .onConflictDoNothing();

    [customer] = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.appId, program.appId),
          eq(customers.externalCustomerId, input.externalCustomerId)
        )
      )
      .limit(1);
  }
  else if (normalizedEmail && customer.email !== normalizedEmail) {
    await db
      .update(customers)
      .set({ email: normalizedEmail })
      .where(eq(customers.id, customer.id));

    [customer] = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customer.id))
      .limit(1);
  }

  const [existingReferral] = await db
    .select()
    .from(referrals)
    .where(
      and(
        eq(referrals.customerId, customer.id),
        eq(referrals.programId, program.id)
      )
    )
    .limit(1);

  let referral = existingReferral;
  let attributed = false;

  if (!referral) {
    const referralId = generateId(ID_PREFIXES.referral);
    const result = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(referrals)
        .values({
          id: referralId,
          customerId: customer.id,
          programId: program.id,
          programAffiliateId: attribution.programAffiliateId,
          clickId: attribution.clickId,
        })
        .onConflictDoNothing()
        .returning({ id: referrals.id });

      const [storedReferral] = await tx
        .select()
        .from(referrals)
        .where(
          and(
            eq(referrals.customerId, customer.id),
            eq(referrals.programId, program.id)
          )
        )
        .limit(1);

      if (!storedReferral) {
        throw new AppError(
          "internal",
          "referral_create_failed",
          "Could not create referral attribution.",
          500
        );
      }

      if (inserted.length > 0) {
        await pinTermsOnReferral(
          {
            referralId: storedReferral.id,
            programId: program.id,
          },
          tx
        );
      }

      return {
        referral: storedReferral,
        attributed: inserted.length > 0,
      };
    });

    referral = result.referral;
    attributed = result.attributed;
  }

  const [affiliate] = await db
    .select()
    .from(programAffiliates)
    .where(eq(programAffiliates.id, referral.programAffiliateId))
    .limit(1);

  if (!affiliate || affiliate.isTest !== auth.testMode) {
    const code = input.clickId
      ? "click_not_found"
      : "promotion_code_attribution_not_found";
    throw new AppError("not_found", code, "Attribution not found.", 404);
  }

  if (attributed) {
    await emitWebhookEvent({
      appId: program.appId,
      eventType: "referral.created",
      livemode: !affiliate.isTest,
      data: {
        id: referral.id,
        customer_id: referral.customerId,
        program_id: referral.programId,
        program_affiliate_id: referral.programAffiliateId,
        click_id: referral.clickId,
        created_at: referral.createdAt.toISOString(),
      },
    });
  }

  return {
    customer,
    referral,
    program,
    affiliate,
    attributionSource: referral.clickId ? "click" as const : "promotion_code" as const,
    attributed,
  };
}

export function serializeIdentifyResult(result: {
  customer: typeof customers.$inferSelect;
  referral: typeof referrals.$inferSelect;
  program: typeof programs.$inferSelect;
  affiliate?: typeof programAffiliates.$inferSelect | null;
  attributionSource?: "click" | "promotion_code";
  attributed: boolean;
}) {
  return {
    customer_id: result.customer.id,
    external_customer_id: result.customer.externalCustomerId,
    referral_id: result.referral.id,
    program_id: result.program.id,
    program_affiliate_id: result.referral.programAffiliateId,
    click_id: result.referral.clickId,
    attribution_source:
      result.attributionSource
      ?? (result.referral.clickId ? "click" : "promotion_code"),
    attributed: result.attributed,
    stripe_metadata: {
      refkit_click_id: result.referral.clickId,
      refkit_customer_id: result.customer.id,
      refkit_program_id: result.program.id,
    },
  };
}
