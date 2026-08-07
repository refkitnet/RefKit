import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  affiliateAgreementAcceptances,
  affiliateLinks,
  programAffiliates,
  programs,
  users,
} from "@/db/schema";
import { SEED_USERS } from "@/db/seed/ids";
import { resetSeedData } from "@/db/seed/reset";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { getCurrentAppAgreement } from "@/services/apps/agreement";
import {
  cleanupTestContext,
  seedAttributionGraph,
} from "../helpers/context";

describe("seed reset", () => {
  it("removes a seed user's membership without deleting an external Program", async () => {
    await resetSeedData();
    const ctx = await seedAttributionGraph();
    const db = getDb();

    try {
      await db.insert(users).values({
        id: SEED_USERS.marcus.id,
        email: SEED_USERS.marcus.email,
        name: SEED_USERS.marcus.name,
      });
      const agreement = await getCurrentAppAgreement(ctx.appId);

      if (!agreement) {
        throw new Error("Expected an App agreement for the external Program.");
      }

      const programAffiliateId = generateId(ID_PREFIXES.affiliate);
      await db.insert(programAffiliates).values({
        id: programAffiliateId,
        programId: ctx.programId,
        userId: SEED_USERS.marcus.id,
        status: "pending",
      });
      await db.insert(affiliateLinks).values({
        id: generateId(ID_PREFIXES.link),
        appId: ctx.appId,
        programAffiliateId,
        programId: ctx.programId,
        linkCode: `seed-reset-${ctx.suffix}`,
        label: "Default link",
      });
      await db.insert(affiliateAgreementAcceptances).values({
        id: generateId(ID_PREFIXES.agreementAcceptance),
        programAffiliateId,
        appAgreementVersionId: agreement.id,
        acceptedAt: new Date(),
      });
      const linksBefore = await db
        .select({ id: affiliateLinks.id })
        .from(affiliateLinks)
        .where(eq(affiliateLinks.programAffiliateId, programAffiliateId));
      const acceptancesBefore = await db
        .select({ id: affiliateAgreementAcceptances.id })
        .from(affiliateAgreementAcceptances)
        .where(
          eq(
            affiliateAgreementAcceptances.programAffiliateId,
            programAffiliateId
          )
        );

      expect(linksBefore).toHaveLength(1);
      expect(acceptancesBefore).toHaveLength(1);

      await resetSeedData();

      const [externalProgram] = await db
        .select({ id: programs.id })
        .from(programs)
        .where(eq(programs.id, ctx.programId));
      const [originalAffiliate] = await db
        .select({ id: programAffiliates.id })
        .from(programAffiliates)
        .where(eq(programAffiliates.id, ctx.programAffiliateId));
      const removedMembership = await db
        .select({ id: programAffiliates.id })
        .from(programAffiliates)
        .where(eq(programAffiliates.id, programAffiliateId));
      const removedUser = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, SEED_USERS.marcus.id));

      expect(externalProgram).toEqual({ id: ctx.programId });
      expect(originalAffiliate).toEqual({ id: ctx.programAffiliateId });
      expect(removedMembership).toHaveLength(0);
      expect(removedUser).toHaveLength(0);
    }
    finally {
      await cleanupTestContext(ctx);
    }
  });
});
