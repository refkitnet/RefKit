import { and, desc, eq, lt, or, SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  affiliateLinks,
  programAffiliates,
  programs,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { ListParams } from "@/lib/pagination";
import { serializeAffiliateLink } from "@/services/affiliates/links";

export async function listAffiliateLinksForUser(
  userId: string,
  params: ListParams
) {
  const db = getDb();
  const limit = params.limit ?? 25;
  const conditions: SQL[] = [eq(programAffiliates.userId, userId)];

  if (params.startingAfter) {
    const [cursor] = await db
      .select({
        id: affiliateLinks.id,
        createdAt: affiliateLinks.createdAt,
      })
      .from(affiliateLinks)
      .innerJoin(programAffiliates, eq(programAffiliates.id, affiliateLinks.programAffiliateId))
      .where(
        and(
          eq(affiliateLinks.id, params.startingAfter),
          eq(programAffiliates.userId, userId)
        )
      )
      .limit(1);

    if (!cursor) {
      throw new AppError(
        "invalid_request",
        "invalid_starting_after",
        "Invalid starting_after cursor.",
        400
      );
    }

    conditions.push(
      or(
        lt(affiliateLinks.createdAt, cursor.createdAt),
        and(
          eq(affiliateLinks.createdAt, cursor.createdAt),
          lt(affiliateLinks.id, cursor.id)
        )
      )!
    );
  }

  const rows = await db
    .select({
      link: affiliateLinks,
      affiliateStatus: programAffiliates.status,
      programSlug: programs.slug,
      programName: programs.name,
      programStatus: programs.status,
      programDestinationUrl: programs.destinationUrl,
    })
    .from(affiliateLinks)
    .innerJoin(programAffiliates, eq(programAffiliates.id, affiliateLinks.programAffiliateId))
    .innerJoin(programs, eq(programs.id, affiliateLinks.programId))
    .where(and(...conditions))
    .orderBy(desc(affiliateLinks.createdAt), desc(affiliateLinks.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    data: page.map((row) => {
      const link = serializeAffiliateLink(
        row.link,
        row.programDestinationUrl
      );

      return {
        ...link,
        url: link.tracking_url,
        program_slug: row.programSlug,
        program_name: row.programName,
        program_status: row.programStatus,
        affiliate_status: row.affiliateStatus,
      };
    }),
    hasMore,
  };
}
