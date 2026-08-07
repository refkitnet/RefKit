import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  affiliateAgreementAcceptances,
  affiliateLinks,
  programAffiliates,
  clicks,
  commissionRules,
  programTermsVersions,
  programs,
  users,
} from "@/db/schema";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { defaultAppAgreement } from "@/lib/compliance-copy";
import { joinProgramViaPublicPage } from "@/services/affiliates/join";
import { createProgram } from "@/services/programs";
import {
  getCurrentAppAgreement,
  publishAppAgreement,
} from "@/services/apps/agreement";
import {
  createAffiliateLink,
  createAffiliateLinkForOwner,
  deleteAffiliateLink,
  deleteAffiliateLinkForOwner,
  listAffiliateLinks,
  listAffiliateLinksForOwner,
  serializeAffiliateLink,
  updateAffiliateLinkForOwner,
} from "@/services/affiliates/links";
import {
  getCurrentTermsVersion,
  pinTermsOnReferral,
  publishProgramTermsVersion,
} from "@/services/programs/terms";
import { serializeClick } from "@/services/clicks/list";
import { listAffiliateLinksForUser } from "@/services/links";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

describe("app agreements, program terms, and affiliate links", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("seeds new apps with the default agreement", async () => {
    const current = await getCurrentAppAgreement(ctx.appId);

    expect(current?.termsText).toBe(
      defaultAppAgreement(`App ${ctx.suffix}`)
    );
  });

  it("publishes a new app agreement without changing program terms", async () => {
    const beforeTerms = await getCurrentTermsVersion(ctx.programId);
    const beforeAgreement = await getCurrentAppAgreement(ctx.appId);

    if (!beforeTerms || !beforeAgreement) {
      throw new Error("Expected seeded app agreement and program terms.");
    }

    const published = await publishAppAgreement(
      ctx.ownerUserId,
      ctx.appId,
      "Custom developer agreement text."
    );

    const afterTerms = await getCurrentTermsVersion(ctx.programId);

    expect(published.versionNumber).toBe(beforeAgreement.versionNumber + 1);
    expect(published.termsText).toBe("Custom developer agreement text.");
    expect(afterTerms?.id).toBe(beforeTerms.id);
    expect(afterTerms?.versionNumber).toBe(beforeTerms.versionNumber);
  });

  it("publishes a new terms version and deactivates the previous default rule", async () => {
    const current = await getCurrentTermsVersion(ctx.programId);
    const nextVersionNumber = (current?.versionNumber ?? 0) + 1;

    const published = await publishProgramTermsVersion(
      ctx.ownerUserId,
      ctx.programId,
      {
        commissionRule: {
          rewardType: "percent",
          percentValue: 30,
          recurringDurationMonths: null,
        },
      },
      "usd"
    );

    expect(published.termsVersion.versionNumber).toBe(nextVersionNumber);
    expect(published.rule.isDefault).toBe(true);
    expect(published.rule.isActive).toBe(true);
    expect(Number(published.rule.percentValue)).toBe(30);

    const db = getDb();
    const versions = await db
      .select()
      .from(programTermsVersions)
      .where(eq(programTermsVersions.programId, ctx.programId));

    expect(versions).toHaveLength(nextVersionNumber);
  });

  it("pins a referral to one immutable terms version and rule", async () => {
    const current = await getCurrentTermsVersion(ctx.programId);

    if (!current) {
      throw new Error("Expected seeded program terms.");
    }

    const firstPin = await pinTermsOnReferral({
      referralId: ctx.referralId,
      programId: ctx.programId,
    });

    expect(firstPin.termsVersion.id).toBe(current.id);

    const published = await publishProgramTermsVersion(
      ctx.ownerUserId,
      ctx.programId,
      {
        commissionRule: {
          rewardType: "percent",
          percentValue: 35,
          recurringDurationMonths: null,
        },
      },
      "usd"
    );

    const secondPin = await pinTermsOnReferral({
      referralId: ctx.referralId,
      programId: ctx.programId,
    });

    expect(secondPin.termsVersion.id).toBe(firstPin.termsVersion.id);
    expect(secondPin.rule.id).toBe(firstPin.rule.id);
    expect(published.termsVersion.id).not.toBe(firstPin.termsVersion.id);
  });

  it("requires the currently displayed app agreement version for a public signup", async () => {
    const db = getDb();
    await db
      .update(programs)
      .set({ joinPageEnabled: true })
      .where(eq(programs.id, ctx.programId));

    const staleAgreement = await getCurrentAppAgreement(ctx.appId);

    if (!staleAgreement) {
      throw new Error("Expected seeded app agreement.");
    }

    await publishAppAgreement(
      ctx.ownerUserId,
      ctx.appId,
      "The current agreement shown on the join page."
    );

    const email = `join-${ctx.suffix}@refkit-vitest.test`;

    await expect(
      joinProgramViaPublicPage({
        programSlug: `prg-${ctx.suffix}`,
        email,
        name: "Join Tester",
        appAgreementVersionId: staleAgreement.id,
      })
    ).rejects.toMatchObject({ code: "agreement_version_outdated" });

    const currentAgreement = await getCurrentAppAgreement(ctx.appId);

    if (!currentAgreement) {
      throw new Error("Expected current app agreement.");
    }

    const joined = await joinProgramViaPublicPage({
      programSlug: `prg-${ctx.suffix}`,
      email,
      name: "Join Tester",
      appAgreementVersionId: currentAgreement.id,
    });

    const [acceptance] = await db
      .select()
      .from(affiliateAgreementAcceptances)
      .where(
        and(
          eq(
            affiliateAgreementAcceptances.programAffiliateId,
            joined.affiliate.id
          ),
          eq(
            affiliateAgreementAcceptances.appAgreementVersionId,
            currentAgreement.id
          )
        )
      )
      .limit(1);

    expect(acceptance?.appAgreementVersionId).toBe(currentAgreement.id);

    await db
      .delete(affiliateAgreementAcceptances)
      .where(
        eq(
          affiliateAgreementAcceptances.programAffiliateId,
          joined.affiliate.id
        )
      );
    await db
      .delete(affiliateLinks)
      .where(eq(affiliateLinks.programAffiliateId, joined.affiliate.id));
    await db.delete(programAffiliates).where(eq(programAffiliates.id, joined.affiliate.id));
    await db.delete(users).where(eq(users.id, joined.affiliate.userId));
  });

  it("creates and lists named affiliate links for a program membership", async () => {
    const created = await createAffiliateLink(
      ctx.affiliateUserId,
      ctx.programId,
      {
        label: "Newsletter",
        link_code: "newsletter",
        utmSource: "newsletter",
      }
    );

    expect(created.linkCode).toBe("newsletter");
    expect(created.label).toBe("Newsletter");
    expect(created.utmSource).toBe("newsletter");

    const links = await listAffiliateLinks(ctx.affiliateUserId, ctx.programId);

    expect(links.some((link) => link.id === created.id)).toBe(true);

    const serialized = serializeAffiliateLink(
      created,
      `${ctx.destinationUrl}`
    );

    expect(serialized.tracking_url).toContain("via=newsletter");
    expect(serialized.tracking_url).not.toContain("refkit_program");

    const legacy = await listAffiliateLinksForUser(ctx.affiliateUserId, {});
    const legacyCreated = legacy.data.find((link) => link.id === created.id);

    expect(legacyCreated?.url).toContain("via=newsletter");
    expect(legacyCreated?.url).not.toContain("refkit_program");
    expect(legacyCreated?.tracking_url).toBe(legacyCreated?.url);
    expect(legacyCreated?.utm_source).toBe("newsletter");
    expect(legacyCreated?.is_default).toBe(false);
  });

  it("rejects link codes that are already in use", async () => {
    await expect(
      createAffiliateLink(ctx.affiliateUserId, ctx.programId, {
        label: "Duplicate newsletter",
        link_code: "newsletter",
      })
    ).rejects.toMatchObject({
      code: "affiliate_link_code_taken",
    });

    const existing = await listAffiliateLinks(
      ctx.affiliateUserId,
      ctx.programId
    );
    const defaultLink = existing.find((link) => link.id === ctx.linkId);

    expect(defaultLink).toBeTruthy();

    await expect(
      createAffiliateLink(ctx.affiliateUserId, ctx.programId, {
        label: "Default collision",
        link_code: defaultLink!.linkCode,
      })
    ).rejects.toMatchObject({
      code: "affiliate_link_code_taken",
    });

    const otherProgram = await createProgram(ctx.ownerUserId, {
      appId: ctx.appId,
      name: `Link collision ${ctx.suffix}`,
      slug: `link-collision-${ctx.suffix}`,
      currency: "usd",
      destinationUrl: `${ctx.destinationUrl}`,
      commissionRule: {
        rewardType: "percent",
        percentValue: 15,
        recurringDurationMonths: null,
      },
    });
    const otherProgramAffiliateId = generateId(ID_PREFIXES.affiliate);

    await getDb().insert(programAffiliates).values({
      id: otherProgramAffiliateId,
      programId: otherProgram.program.id,
      userId: ctx.affiliateUserId,
      status: "active",
    });

    await expect(
      createAffiliateLink(
        ctx.affiliateUserId,
        otherProgram.program.id,
        {
          label: "Cross-program collision",
          link_code: "newsletter",
        }
      )
    ).rejects.toMatchObject({
      code: "affiliate_link_code_taken",
    });
  });

  it("allows the same link code on a different app", async () => {
    const otherApp = await seedAttributionGraph({
      includeAttribution: false,
    });

    try {
      const created = await createAffiliateLink(
        otherApp.affiliateUserId,
        otherApp.programId,
        {
          label: "Shared newsletter code",
          link_code: "newsletter",
        }
      );

      expect(created.linkCode).toBe("newsletter");
      expect(created.appId).toBe(otherApp.appId);
    }
    finally {
      await cleanupTestContext(otherApp);
    }
  });

  it("lets owners manage Affiliate links without crossing ownership", async () => {
    const linkCode = `owner-${Date.now().toString(36)}`;
    const created = await createAffiliateLinkForOwner(
      ctx.ownerUserId,
      ctx.programAffiliateId,
      {
        label: "Owner campaign",
        link_code: linkCode,
      }
    );

    const listed = await listAffiliateLinksForOwner(
      ctx.ownerUserId,
      ctx.programAffiliateId
    );
    expect(listed.some((link) => link.id === created.id)).toBe(true);

    const updated = await updateAffiliateLinkForOwner(
      ctx.ownerUserId,
      ctx.programAffiliateId,
      created.id,
      {
        label: "Owner campaign updated",
        destinationUrl: ctx.destinationUrl,
        utmSource: "owner-campaign",
      }
    );
    expect(updated).toMatchObject({
      label: "Owner campaign updated",
      destinationUrl: ctx.destinationUrl,
      utmSource: "owner-campaign",
    });

    const otherOwner = await seedAttributionGraph({
      includeAttribution: false,
    });

    try {
      await expect(
        listAffiliateLinksForOwner(
          otherOwner.ownerUserId,
          ctx.programAffiliateId
        )
      ).rejects.toMatchObject({ code: "organization_not_found" });
      await expect(
        createAffiliateLinkForOwner(
          otherOwner.ownerUserId,
          ctx.programAffiliateId,
          {
            link_code: `${linkCode}-other`,
          }
        )
      ).rejects.toMatchObject({ code: "organization_not_found" });
      await expect(
        updateAffiliateLinkForOwner(
          otherOwner.ownerUserId,
          ctx.programAffiliateId,
          created.id,
          { label: "Cross-owner update" }
        )
      ).rejects.toMatchObject({ code: "organization_not_found" });
      await expect(
        deleteAffiliateLinkForOwner(
          otherOwner.ownerUserId,
          ctx.programAffiliateId,
          created.id
        )
      ).rejects.toMatchObject({ code: "organization_not_found" });
    }
    finally {
      await cleanupTestContext(otherOwner);
    }

    const deleted = await deleteAffiliateLinkForOwner(
      ctx.ownerUserId,
      ctx.programAffiliateId,
      created.id
    );
    expect(deleted.id).toBe(created.id);

    const remaining = await listAffiliateLinksForOwner(
      ctx.ownerUserId,
      ctx.programAffiliateId
    );
    expect(remaining.some((link) => link.id === created.id)).toBe(false);
  });

  it("deletes named links but protects the default link and clicked links", async () => {
    const removable = await createAffiliateLink(
      ctx.affiliateUserId,
      ctx.programId,
      {
        label: "Temporary",
        link_code: "temporary",
      }
    );

    await deleteAffiliateLink(
      ctx.affiliateUserId,
      ctx.programId,
      removable.id
    );

    const links = await listAffiliateLinks(ctx.affiliateUserId, ctx.programId);
    expect(links.some((link) => link.id === removable.id)).toBe(false);

    await expect(
      deleteAffiliateLink(ctx.affiliateUserId, ctx.programId, ctx.linkId)
    ).rejects.toMatchObject({
      code: "default_affiliate_link_immutable",
    });

    const withClicks = await createAffiliateLink(
      ctx.affiliateUserId,
      ctx.programId,
      {
        label: "Clicked",
        link_code: "clicked-once",
      }
    );

    const db = getDb();
    await db.insert(clicks).values({
      id: generateId(ID_PREFIXES.click),
      affiliateLinkId: withClicks.id,
      programId: ctx.programId,
      programAffiliateId: ctx.programAffiliateId,
      ipHash: `hash-clicked-${ctx.suffix}`,
      userAgent: "vitest",
    });

    await expect(
      deleteAffiliateLink(
        ctx.affiliateUserId,
        ctx.programId,
        withClicks.id
      )
    ).rejects.toMatchObject({
      code: "affiliate_link_has_clicks",
    });
  });

  it("serializes the immutable link and UTM snapshot on clicks", async () => {
    const db = getDb();
    await db
      .update(clicks)
      .set({
        linkLabel: "Newsletter",
        linkCode: "newsletter",
        utmSource: "newsletter",
        utmMedium: "email",
        utmCampaign: "launch",
      })
      .where(eq(clicks.id, ctx.clickId));

    const [click] = await db
      .select()
      .from(clicks)
      .where(eq(clicks.id, ctx.clickId))
      .limit(1);

    expect(serializeClick(click!)).toMatchObject({
      affiliate_link_id: ctx.linkId,
      link_label: "Newsletter",
      link_code: "newsletter",
      utm_source: "newsletter",
      utm_medium: "email",
      utm_campaign: "launch",
    });
  });

  it("rejects clicks when program_affiliate_id and program_id do not match membership", async () => {
    const otherProgram = await createProgram(ctx.ownerUserId, {
      appId: ctx.appId,
      name: `Other ${ctx.suffix}`,
      slug: `other-${ctx.suffix}`,
      currency: "usd",
      destinationUrl: `${ctx.destinationUrl}`,
      commissionRule: {
        rewardType: "percent",
        percentValue: 15,
        recurringDurationMonths: null,
      },
    });
    const db = getDb();

    await expect(
      db.insert(clicks).values({
        id: generateId(ID_PREFIXES.click),
        affiliateLinkId: ctx.linkId,
        programId: otherProgram.program.id,
        programAffiliateId: ctx.programAffiliateId,
        ipHash: "mismatch",
        userAgent: "vitest",
      })
    ).rejects.toMatchObject({
      cause: {
        code: "23503",
        constraint_name: "clicks_affiliate_program_fk",
      },
    });

    await db
      .delete(commissionRules)
      .where(eq(commissionRules.programId, otherProgram.program.id));
    await db
      .delete(programTermsVersions)
      .where(eq(programTermsVersions.programId, otherProgram.program.id));
    await db.delete(programs).where(eq(programs.id, otherProgram.program.id));
  });
});
