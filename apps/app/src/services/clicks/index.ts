import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  affiliateLinks,
  apps,
  managedConnections,
  programAffiliates,
  clicks,
  programs,
} from "@/db/schema";
import { normalizeLinkCode } from "@/lib/link-code";
import { AppError } from "@/lib/errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { hashIp } from "@/lib/ip-hash";
import { checkRateLimit } from "@/lib/rate-limit";
import { getTrackingOrigin } from "@/lib/tracking-origin";

type CaptureInput = {
  via: string;
  page?: string | null;
  referrer?: string | null;
  ip: string;
  userAgent: string | null;
  appId?: string;
  refkitAppId?: string | null;
};

type CaptureResult = {
  clickId: string | null;
};

async function resolveCaptureAppId(input: {
  appId?: string;
  refkitAppId?: string | null;
  page?: string | null;
}): Promise<string> {
  if (input.appId) {
    return input.appId;
  }

  const hintAppId = input.refkitAppId?.trim() || null;

  if (hintAppId) {
    const db = getDb();
    const [app] = await db
      .select({ id: apps.id })
      .from(apps)
      .where(eq(apps.id, hintAppId))
      .limit(1);

    if (!app) {
      throw new AppError(
        "not_found",
        "affiliate_link_not_found",
        "Affiliate link not found.",
        404
      );
    }

    return app.id;
  }

  if (!input.page) {
    throw new AppError(
      "invalid_request",
      "app_resolution_required",
      "Browser capture requires a page URL or refkit_app hint.",
      400
    );
  }

  let trackingOrigin: string;

  try {
    trackingOrigin = getTrackingOrigin(input.page);
  }
  catch {
    throw new AppError(
      "invalid_request",
      "invalid_page_url",
      "page must be an absolute URL.",
      400
    );
  }

  const db = getDb();
  const [app] = await db
    .select({ id: apps.id })
    .from(apps)
    .where(eq(apps.trackingOrigin, trackingOrigin))
    .limit(1);

  if (!app) {
    throw new AppError(
      "not_found",
      "affiliate_link_not_found",
      "Affiliate link not found.",
      404
    );
  }

  return app.id;
}

export async function captureAffiliateClick(
  input: CaptureInput
): Promise<CaptureResult> {
  const db = getDb();
  const ipHash = hashIp(input.ip);
  const via = normalizeLinkCode(input.via);

  if (!via) {
    throw new AppError(
      "invalid_request",
      "invalid_via_slug",
      "Affiliate via slug is required.",
      400
    );
  }

  const appId = await resolveCaptureAppId({
    appId: input.appId,
    refkitAppId: input.refkitAppId,
    page: input.page,
  });

  await checkRateLimit(
    `click_capture:${ipHash}:${appId}`,
    60
  );

  const [row] = await db
    .select({
      program: programs,
      affiliate: programAffiliates,
      link: affiliateLinks,
    })
    .from(affiliateLinks)
    .innerJoin(programs, eq(programs.id, affiliateLinks.programId))
    .leftJoin(
      managedConnections,
      eq(managedConnections.appId, affiliateLinks.appId)
    )
    .leftJoin(
      programAffiliates,
      and(
        eq(programAffiliates.id, affiliateLinks.programAffiliateId),
        eq(programAffiliates.programId, programs.id)
      )
    )
    .where(
      and(
        eq(affiliateLinks.appId, appId),
        eq(affiliateLinks.linkCode, via),
        or(
          isNull(managedConnections.id),
          eq(managedConnections.status, "active"),
          eq(managedConnections.status, "suspended")
        )
      )
    )
    .limit(1);

  if (!row) {
    throw new AppError(
      "not_found",
      "affiliate_link_not_found",
      "Affiliate link not found.",
      404
    );
  }

  const program = row.program;

  if (program.status === "disabled") {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }

  const link = row.link;

  const affiliate = row.affiliate;

  if (!affiliate) {
    throw new AppError(
      "not_found",
      "affiliate_not_found",
      "Affiliate not found.",
      404
    );
  }

  const shouldRecordClick =
    program.status === "active" && affiliate.status === "active";

  if (!shouldRecordClick) {
    return {
      clickId: null,
    };
  }

  const clickId = generateId(ID_PREFIXES.click);

  await db.insert(clicks).values({
    id: clickId,
    affiliateLinkId: link.id,
    programId: program.id,
    programAffiliateId: affiliate.id,
    linkLabel: link.label,
    linkCode: link.linkCode,
    utmSource: link.utmSource,
    utmMedium: link.utmMedium,
    utmCampaign: link.utmCampaign,
    pageUrl: input.page ?? null,
    referrer: input.referrer ?? null,
    ipHash,
    userAgent: input.userAgent,
  });

  return {
    clickId,
  };
}
