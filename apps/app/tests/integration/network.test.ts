import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getDb } from "@/db/client";
import {
  affiliateLinks,
  affiliateAgreementAcceptances,
  programAffiliates,
  apps,
  users,
} from "@/db/schema";
import { joinListedProgramForUser } from "@/services/affiliates/join";
import {
  setAppNetworkVisibility,
  setDefaultProgram,
} from "@/services/apps";
import { removeAppLogo } from "@/services/apps/logo";
import { listNetworkApps, serializeNetworkApp } from "@/services/network";
import {
  createProgram,
  pauseProgram,
  updateProgram,
} from "@/services/programs";
import { getCurrentAppAgreement } from "@/services/apps/agreement";
import {
  cleanupTestContext,
  createAffiliateUser,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";

vi.mock("@/lib/closed-beta.server", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/closed-beta.server")>();
  return {
    ...mod,
    assertRefKitNetworkAccessible: () => {},
  };
});

describe("RefKit Network", () => {
  let ctx: TestContext;
  let networkUserId: string;
  let joinedProgramAffiliateId: string | null = null;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    networkUserId = await createAffiliateUser(`${ctx.suffix}-network`);
  });

  afterAll(async () => {
    const db = getDb();

    if (joinedProgramAffiliateId) {
      await db
        .delete(affiliateAgreementAcceptances)
        .where(eq(affiliateAgreementAcceptances.programAffiliateId, joinedProgramAffiliateId));
      await db
        .delete(affiliateLinks)
        .where(eq(affiliateLinks.programAffiliateId, joinedProgramAffiliateId));
      await db.delete(programAffiliates).where(eq(programAffiliates.id, joinedProgramAffiliateId));
    }

    await db.delete(users).where(eq(users.id, networkUserId));
    await cleanupTestContext(ctx);
  });

  it("requires an app logo before showing its default program", async () => {
    await expect(
      setAppNetworkVisibility(ctx.ownerUserId, ctx.appId, true)
    ).rejects.toMatchObject({ code: "app_logo_required" });

    const db = getDb();
    await db
      .update(apps)
      .set({ logoUrl: "https://assets.example.com/logo.png" })
      .where(eq(apps.id, ctx.appId));

    const listed = await setAppNetworkVisibility(
      ctx.ownerUserId,
      ctx.appId,
      true
    );

    expect(listed.networkVisible).toBe(true);

    await expect(
      removeAppLogo(ctx.ownerUserId, ctx.appId)
    ).rejects.toMatchObject({ code: "app_logo_in_use" });
  });

  it("lists active public programs with app branding and current terms", async () => {
    const result = await listNetworkApps({ limit: 100 });
    const row = result.data.find((entry) => entry.program.id === ctx.programId);

    expect(row).toBeDefined();

    const serialized = serializeNetworkApp(
      row!,
      "https://app.refkit.net"
    );

    expect(serialized.app.logo_url).toBe("https://assets.example.com/logo.png");
    expect(serialized.program.join_page_approval).toBe("pending");
    expect(serialized.current_terms_version.id).toBeTruthy();
    expect(serialized.current_agreement_version?.terms_text).toBeTruthy();
    expect(serialized.join_url).toContain(`/join/${serialized.program.slug}`);
  });

  it("protects the visible default program lifecycle", async () => {
    await expect(
      pauseProgram(ctx.ownerUserId, ctx.programId)
    ).rejects.toMatchObject({ code: "network_default_program_active_required" });
  });

  it("keeps Network listing and join when the hosted join page is off", async () => {
    const updated = await updateProgram(ctx.ownerUserId, ctx.programId, {
      joinPageEnabled: false,
    });

    expect(updated.joinPageEnabled).toBe(false);

    const listed = await listNetworkApps({ limit: 100 });
    expect(
      listed.data.some((entry) => entry.program.id === ctx.programId),
    ).toBe(true);

    await updateProgram(ctx.ownerUserId, ctx.programId, {
      joinPageEnabled: true,
    });
  });

  it("shows only the app default when multiple programs exist", async () => {
    const created = await createProgram(ctx.ownerUserId, {
      appId: ctx.appId,
      name: `Secondary ${ctx.suffix}`,
      slug: `secondary-${ctx.suffix}`,
      currency: "usd",
      destinationUrl: `${ctx.destinationUrl}`,
      commissionRule: {
        rewardType: "percent",
        percentValue: 35,
      },
    });

    expect(created.program.isDefault).toBe(false);

    await setDefaultProgram(
      ctx.ownerUserId,
      ctx.appId,
      created.program.id
    );

    const changed = await listNetworkApps({ limit: 100 });
    const appRows = changed.data.filter((entry) => entry.app.id === ctx.appId);
    expect(appRows).toHaveLength(1);
    expect(appRows[0]?.program.id).toBe(created.program.id);

    await setDefaultProgram(ctx.ownerUserId, ctx.appId, ctx.programId);
  });

  it("creates a session-bound pending membership with accepted agreement", async () => {
    const agreement = await getCurrentAppAgreement(ctx.appId);

    if (!agreement) {
      throw new Error("Expected current app agreement.");
    }

    const result = await joinListedProgramForUser({
      programId: ctx.programId,
      userId: networkUserId,
      appAgreementVersionId: agreement.id,
    });

    joinedProgramAffiliateId = result.affiliate.id;
    expect(result.status).toBe("pending");
    expect(result.affiliate.userId).toBe(networkUserId);

    await expect(
      joinListedProgramForUser({
        programId: ctx.programId,
        userId: networkUserId,
        appAgreementVersionId: agreement.id,
      })
    ).rejects.toMatchObject({ code: "affiliate_already_exists" });
  });

  it("hides the app after Network visibility is disabled", async () => {
    await setAppNetworkVisibility(ctx.ownerUserId, ctx.appId, false);

    const result = await listNetworkApps({ limit: 100 });
    expect(result.data.some((entry) => entry.program.id === ctx.programId)).toBe(
      false
    );

    await expect(
      listNetworkApps({ limit: 100, startingAfter: ctx.appId })
    ).rejects.toMatchObject({ code: "invalid_starting_after" });
  });
});
