import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  affiliateLinks,
  clicks,
  programAffiliates,
  programs,
} from "@/db/schema";
import { DEFAULT_LINK_LABEL, normalizeLinkCode } from "@/lib/link-code";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { requireProgramAffiliate } from "@/services/scoping";
import { requireProgramAccess } from "@/services/scoping";

export type CreateAffiliateLinkInput = {
  label?: string;
  link_code?: string;
  slug?: string;
  destinationUrl?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

function buildTrackingUrl(
  destinationUrl: string,
  link: typeof affiliateLinks.$inferSelect,
  options?: { includeAppHint?: boolean }
) {
  const url = new URL(destinationUrl);

  url.searchParams.delete("refkit_program");
  url.searchParams.delete("refkit_app");
  url.searchParams.set("via", link.linkCode);

  if (options?.includeAppHint) {
    url.searchParams.set("refkit_app", link.appId);
  }

  if (link.utmSource) {
    url.searchParams.set("utm_source", link.utmSource);
  }

  if (link.utmMedium) {
    url.searchParams.set("utm_medium", link.utmMedium);
  }

  if (link.utmCampaign) {
    url.searchParams.set("utm_campaign", link.utmCampaign);
  }

  return url.toString();
}

async function requireOwnedProgramAffiliate(
  ownerPrincipalId: string,
  programAffiliateId: string
) {
  const db = getDb();
  const [row] = await db
    .select({ affiliate: programAffiliates, program: programs })
    .from(programAffiliates)
    .innerJoin(programs, eq(programs.id, programAffiliates.programId))
    .where(eq(programAffiliates.id, programAffiliateId))
    .limit(1);

  if (!row) {
    throw new AppError(
      "not_found",
      "program_affiliate_not_found",
      "Program affiliate not found.",
      404
    );
  }

  await requireProgramAccess(ownerPrincipalId, row.program.id);
  return row;
}

export async function listAffiliateLinksForOwner(
  ownerPrincipalId: string,
  programAffiliateId: string
) {
  const row = await requireOwnedProgramAffiliate(
    ownerPrincipalId,
    programAffiliateId
  );

  return listAffiliateLinks(row.affiliate.userId, row.program.id);
}

export async function createAffiliateLinkForOwner(
  ownerPrincipalId: string,
  programAffiliateId: string,
  input: CreateAffiliateLinkInput
) {
  const row = await requireOwnedProgramAffiliate(
    ownerPrincipalId,
    programAffiliateId
  );

  return createAffiliateLink(row.affiliate.userId, row.program.id, input);
}

export async function updateAffiliateLinkForOwner(
  ownerPrincipalId: string,
  programAffiliateId: string,
  linkId: string,
  input: {
    label?: string;
    destinationUrl?: string | null;
    utmSource?: string | null;
    utmMedium?: string | null;
    utmCampaign?: string | null;
  }
) {
  const row = await requireOwnedProgramAffiliate(
    ownerPrincipalId,
    programAffiliateId
  );
  const db = getDb();
  const [link] = await db
    .select()
    .from(affiliateLinks)
    .where(
      and(
        eq(affiliateLinks.id, linkId),
        eq(affiliateLinks.programAffiliateId, programAffiliateId),
        eq(affiliateLinks.programId, row.program.id)
      )
    )
    .limit(1);

  if (!link) {
    throw new AppError(
      "not_found",
      "affiliate_link_not_found",
      "Affiliate link not found.",
      404
    );
  }

  if (
    input.destinationUrl !== undefined
    && input.destinationUrl !== null
    && input.destinationUrl !== row.program.destinationUrl
  ) {
    throw new AppError(
      "invalid_request",
      "destination_url_mismatch",
      "Link destination URL must match the program website URL.",
      400
    );
  }

  const [updated] = await db
    .update(affiliateLinks)
    .set({
      label: input.label,
      destinationUrl: input.destinationUrl,
      utmSource: input.utmSource,
      utmMedium: input.utmMedium,
      utmCampaign: input.utmCampaign,
      updatedAt: new Date(),
    })
    .where(eq(affiliateLinks.id, linkId))
    .returning();

  return updated;
}

export async function deleteAffiliateLinkForOwner(
  ownerPrincipalId: string,
  programAffiliateId: string,
  linkId: string
) {
  const row = await requireOwnedProgramAffiliate(
    ownerPrincipalId,
    programAffiliateId
  );

  return deleteAffiliateLink(
    row.affiliate.userId,
    row.program.id,
    linkId
  );
}

async function assertLinkCodeAvailable(appId: string, linkCode: string) {
  const db = getDb();

  const [existingLink] = await db
    .select({ id: affiliateLinks.id })
    .from(affiliateLinks)
    .where(
      and(
        eq(affiliateLinks.appId, appId),
        eq(affiliateLinks.linkCode, linkCode)
      )
    )
    .limit(1);

  if (existingLink) {
    throw new AppError(
      "conflict",
      "affiliate_link_code_taken",
      "This link code is already in use for this app.",
      409
    );
  }
}

export async function createAffiliateLink(
  userId: string,
  programId: string,
  input: CreateAffiliateLinkInput
) {
  const membership = await requireProgramAffiliate(userId, programId);
  const db = getDb();

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, programId))
    .limit(1);

  if (!program) {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }

  const rawCode = input.link_code ?? input.slug ?? input.label ?? "";
  const linkCode = normalizeLinkCode(rawCode);

  if (!linkCode) {
    throw new AppError(
      "invalid_request",
      "invalid_link_code",
      "Link code is required.",
      400
    );
  }

  const label = input.label?.trim() || linkCode;

  await assertLinkCodeAvailable(program.appId, linkCode);

  if (input.destinationUrl) {
    const [programRow] = await db
      .select({
        destinationUrl: programs.destinationUrl,
      })
      .from(programs)
      .where(eq(programs.id, programId))
      .limit(1);

    if (
      !programRow ||
      programRow.destinationUrl !== input.destinationUrl
    ) {
      throw new AppError(
        "invalid_request",
        "destination_url_mismatch",
        "Link destination URL must match the program website URL.",
        400
      );
    }
  }

  const linkId = generateId(ID_PREFIXES.link);

  try {
    await db.insert(affiliateLinks).values({
      id: linkId,
      appId: program.appId,
      programAffiliateId: membership.id,
      programId,
      linkCode,
      label,
      destinationUrl: input.destinationUrl ?? null,
      utmSource: input.utmSource ?? null,
      utmMedium: input.utmMedium ?? null,
      utmCampaign: input.utmCampaign ?? null,
    });
  }
  catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "23505"
    ) {
      throw new AppError(
        "conflict",
        "affiliate_link_code_taken",
        "This link code is already in use for this app.",
        409
      );
    }

    throw error;
  }

  const [created] = await db
    .select()
    .from(affiliateLinks)
    .where(eq(affiliateLinks.id, linkId))
    .limit(1);

  return created!;
}

export async function deleteAffiliateLink(
  userId: string,
  programId: string,
  linkId: string
) {
  const membership = await requireProgramAffiliate(userId, programId);
  const db = getDb();

  const [link] = await db
    .select()
    .from(affiliateLinks)
    .where(
      and(
        eq(affiliateLinks.id, linkId),
        eq(affiliateLinks.programId, programId),
        eq(affiliateLinks.programAffiliateId, membership.id)
      )
    )
    .limit(1);

  if (!link) {
    throw new AppError(
      "not_found",
      "affiliate_link_not_found",
      "Affiliate link not found.",
      404
    );
  }

  if (link.label === DEFAULT_LINK_LABEL) {
    throw new AppError(
      "invalid_request",
      "default_affiliate_link_immutable",
      "The default affiliate link cannot be removed.",
      400
    );
  }

  const [existingClick] = await db
    .select({ id: clicks.id })
    .from(clicks)
    .where(eq(clicks.affiliateLinkId, linkId))
    .limit(1);

  if (existingClick) {
    throw new AppError(
      "conflict",
      "affiliate_link_has_clicks",
      "This link has recorded clicks and cannot be removed.",
      409
    );
  }

  await db.delete(affiliateLinks).where(eq(affiliateLinks.id, linkId));

  return link;
}

export async function listAffiliateLinks(userId: string, programId: string) {
  const membership = await requireProgramAffiliate(userId, programId);
  const db = getDb();

  return db
    .select()
    .from(affiliateLinks)
    .where(
      and(
        eq(affiliateLinks.programAffiliateId, membership.id),
        eq(affiliateLinks.programId, programId)
      )
    );
}

export function serializeAffiliateLink(
  link: typeof affiliateLinks.$inferSelect,
  programDestinationUrl: string,
  options?: { includeAppHint?: boolean }
) {
  const destinationUrl = link.destinationUrl ?? programDestinationUrl;

  return {
    id: link.id,
    program_id: link.programId,
    program_affiliate_id: link.programAffiliateId,
    link_code: link.linkCode,
    label: link.label,
    is_default: link.label === DEFAULT_LINK_LABEL,
    destination_url: link.destinationUrl,
    utm_source: link.utmSource,
    utm_medium: link.utmMedium,
    utm_campaign: link.utmCampaign,
    tracking_url: buildTrackingUrl(destinationUrl, link, options),
    created_at: link.createdAt.toISOString(),
    updated_at: link.updatedAt.toISOString(),
  };
}
