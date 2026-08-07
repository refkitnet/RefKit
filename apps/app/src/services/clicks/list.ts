import { and, eq, sql } from "drizzle-orm";
import { clicks, programAffiliates, type Click } from "@/db/schema";
import type { AppEnvironment } from "@/lib/app-environment";
import { ListParams, listWithCursor } from "@/lib/pagination";
import {
  requireProgramAffiliate,
  requireProgramAccess,
} from "@/services/scoping";

export async function listClicksForProgram(
  userId: string,
  programId: string,
  params: ListParams,
  options: { environment?: AppEnvironment } = {},
) {
  await requireProgramAccess(userId, programId);

  const limit = params.limit ?? 25;

  return listWithCursor<Click>({
    table: clicks,
    columns: {
      id: clicks.id,
      createdAt: clicks.createdAt,
    },
    where: and(
      eq(clicks.programId, programId),
      sql`exists (
        select 1
        from ${programAffiliates}
        where ${programAffiliates.id} = ${clicks.programAffiliateId}
          and ${programAffiliates.isTest} = ${options.environment === "test"}
      )`
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export async function listClicksForAffiliate(
  userId: string,
  programId: string,
  params: ListParams
) {
  const membership = await requireProgramAffiliate(userId, programId);

  const limit = params.limit ?? 25;

  return listWithCursor<Click>({
    table: clicks,
    columns: {
      id: clicks.id,
      createdAt: clicks.createdAt,
    },
    where: and(
      eq(clicks.programId, programId),
      eq(clicks.programAffiliateId, membership.id)
    ),
    limit,
    startingAfter: params.startingAfter,
  });
}

export function serializeClick(click: Click) {
  return {
    id: click.id,
    affiliate_link_id: click.affiliateLinkId,
    program_id: click.programId,
    program_affiliate_id: click.programAffiliateId,
    link_label: click.linkLabel,
    link_code: click.linkCode,
    utm_source: click.utmSource,
    utm_medium: click.utmMedium,
    utm_campaign: click.utmCampaign,
    page_url: click.pageUrl,
    referrer: click.referrer,
    created_at: click.createdAt.toISOString(),
    updated_at: click.updatedAt.toISOString(),
  };
}
