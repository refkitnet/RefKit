import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import {
  affiliateAgreementAcceptances,
  affiliateLinks,
  apiKeys,
  programAffiliates,
  programs,
  users,
} from "@/db/schema";
import { decryptTestApiKey } from "@/lib/crypto";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";
import { getAppSetupStatus } from "@/services/apps/setup-status";
import { joinProgramViaPublicPage } from "@/services/affiliates/join";
import { approvePendingAffiliate } from "@/services/affiliates/approve";
import {
  acknowledgeProgramDisable,
  disableProgram,
} from "@/services/programs/disable";
import { getProgramOverview, getAppOverview } from "@/services/programs/overview";
import { listClicksForProgram } from "@/services/clicks/list";
import {
  listReferralsForApp,
  listReferralsForProgram,
} from "@/services/referrals";
import { createAffiliate, listAffiliatesForApp } from "@/services/affiliates";
import { listTransactionsForApp } from "@/services/transactions";
import { listCommissionsForApp } from "@/services/commissions";
import { getMeProfile, getDefaultHomePathForUser } from "@/services/users/me";
import { updateUserName } from "@/services/users/update-profile";
import { removeUserPhoto, uploadUserPhoto } from "@/services/users/photo";
import { removeAppLogo, uploadAppLogo } from "@/services/apps/logo";
import {
  LOCAL_LOGO_DIR,
  LOCAL_USER_PHOTO_DIR,
} from "@/lib/logo-storage";
import { computePayableBalance } from "@/services/payouts/balance";
import { getCurrentAppAgreement } from "@/services/apps/agreement";
import { captureAffiliateClick } from "@/services/clicks";
import { identifyCustomer } from "@/services/identify";
import { reportPayment } from "@/services/revenue/report-payment";
import { createApiKey, touchApiKeyLastUsed } from "@/services/api-keys";
import { updateAppRevenueSource } from "@/services/apps";

const ONE_PIXEL_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54,
  0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01,
  0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00,
  0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

function onePixelPng(name: string) {
  return new File([ONE_PIXEL_PNG], name, { type: "image/png" });
}

describe("dashboard api services", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
    const db = getDb();

    await db
      .update(programs)
      .set({
        joinPageEnabled: true,
        joinPageApproval: "pending",
      })
      .where(eq(programs.id, ctx.programId));
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  it("returns setup status for an app", async () => {
    const status = await getAppSetupStatus(ctx.ownerUserId, ctx.appId);

    expect(status.program_launched).toBe(true);
    expect(status.api_key_created).toBe(true);
    expect(status.first_click).toBe(true);
    expect(status.first_identify).toBe(true);
    expect(status.stripe_connected).toBe(false);
  });

  it("stores new recoverable Test keys as ciphertext only", async () => {
    const [key] = await getDb()
      .select({
        testKey: apiKeys.testKey,
        testKeyEncrypted: apiKeys.testKeyEncrypted,
      })
      .from(apiKeys)
      .where(eq(apiKeys.id, ctx.apiKeyId))
      .limit(1);

    expect(key?.testKey).toBeNull();
    expect(key?.testKeyEncrypted).toEqual(expect.any(String));
    expect(decryptTestApiKey(key!.testKeyEncrypted!)).toBe(ctx.apiKey);
  });

  it("backfills a legacy plaintext Test key when setup status reads it", async () => {
    const legacy = await seedAttributionGraph({ includeAttribution: false });

    try {
      const db = getDb();
      await db
        .update(apiKeys)
        .set({
          testKey: legacy.apiKey,
          testKeyEncrypted: null,
        })
        .where(eq(apiKeys.id, legacy.apiKeyId));

      const status = await getAppSetupStatus(
        legacy.ownerUserId,
        legacy.appId
      );
      const [stored] = await db
        .select({
          testKey: apiKeys.testKey,
          testKeyEncrypted: apiKeys.testKeyEncrypted,
        })
        .from(apiKeys)
        .where(eq(apiKeys.id, legacy.apiKeyId))
        .limit(1);

      expect(status.test_api_key).toBe(legacy.apiKey);
      expect(stored?.testKey).toBeNull();
      expect(stored?.testKeyEncrypted).toEqual(expect.any(String));
      expect(decryptTestApiKey(stored!.testKeyEncrypted!)).toBe(
        legacy.apiKey
      );
    }
    finally {
      await cleanupTestContext(legacy);
    }
  });

  it("allows production readiness without completing the optional test journey", async () => {
    const direct = await seedAttributionGraph({ includeAttribution: false });

    try {
      await updateAppRevenueSource(direct.ownerUserId, direct.appId, "api");
      const liveKey = await createApiKey({
        userId: direct.ownerUserId,
        kind: "app",
        organizationId: direct.organizationId,
        appId: direct.appId,
        name: "Direct production key",
        testMode: false,
      });
      direct.affiliateApiKeyIds = [
        ...(direct.affiliateApiKeyIds ?? []),
        liveKey.id,
      ];

      const status = await getAppSetupStatus(direct.ownerUserId, direct.appId);

      expect(status).toMatchObject({
        test_integration_complete: false,
        production_website_ready: true,
        live_api_key_created: true,
        production_ready: true,
      });
    }
    finally {
      await cleanupTestContext(direct);
    }
  });

  it("returns program overview KPIs", async () => {
    const overview = await getProgramOverview(
      ctx.ownerUserId,
      ctx.programId
    );

    expect(overview.clicks).toBe(1);
    expect(overview.referrals).toBe(1);
  });

  it("returns app overview KPIs aggregated across programs", async () => {
    const overview = await getAppOverview(ctx.ownerUserId, ctx.appId);

    expect(overview.clicks).toBe(1);
    expect(overview.referrals).toBe(1);
    expect(overview.gross_referred_revenue).toEqual({
      amount: 0,
      currency: "usd",
    });
  });

  it("treats real affiliate commissions as test integration complete", async () => {
    const before = await getAppSetupStatus(ctx.ownerUserId, ctx.appId);

    expect(before.test_integration_complete).toBe(false);
    expect(before.test_affiliate_created).toBe(false);

    await updateAppRevenueSource(ctx.ownerUserId, ctx.appId, "api");
    const liveKey = await createApiKey({
      userId: ctx.ownerUserId,
      kind: "app",
      organizationId: ctx.organizationId,
      appId: ctx.appId,
      name: `Live dashboard key ${ctx.suffix}`,
      testMode: false,
    });
    ctx.affiliateApiKeyIds = [
      ...(ctx.affiliateApiKeyIds ?? []),
      liveKey.id,
    ];
    await touchApiKeyLastUsed(liveKey.id);
    ctx.rateLimitScopes.push(`report-payment:${liveKey.id}`);

    await reportPayment(
      {
        type: "app_key",
        userId: ctx.ownerUserId,
        keyId: liveKey.id,
        organizationId: ctx.organizationId,
        appId: ctx.appId,
        testMode: false,
      },
      {
        paymentId: `affiliate-path-payment-${ctx.suffix}`,
        customerId: ctx.customerId,
        programId: ctx.programId,
        amount: 5000,
        currency: "usd",
      }
    );

    const after = await getAppSetupStatus(ctx.ownerUserId, ctx.appId);

    expect(after).toMatchObject({
      test_integration_complete: true,
      test_affiliate_created: false,
      test_first_commission: false,
      first_commission: true,
    });
  });

  it("isolates the full test integration from live lists and metrics", async () => {
    const before = await getAppOverview(ctx.ownerUserId, ctx.appId);
    const testAffiliate = await createAffiliate(ctx.ownerUserId, {
      programId: ctx.programId,
      testMode: true,
    });
    const click = await captureAffiliateClick({
      via: testAffiliate.link.linkCode,
      page: `${ctx.destinationUrl}`,
      ip: "127.0.0.2",
      userAgent: "vitest test integration",
    });

    if (!click.clickId) {
      throw new Error("Expected test click to be recorded.");
    }

    const identified = await identifyCustomer(
      {
        type: "app_key",
        userId: ctx.ownerUserId,
        keyId: ctx.apiKeyId,
        organizationId: ctx.organizationId,
        appId: ctx.appId,
        testMode: true,
      },
      {
        clickId: click.clickId,
        externalCustomerId: `test-customer-${ctx.suffix}`,
        email: `test-customer-${ctx.suffix}@refkit-vitest.test`,
      }
    );

    await touchApiKeyLastUsed(ctx.apiKeyId);
    ctx.rateLimitScopes.push(`report-payment:${ctx.apiKeyId}`);

    await reportPayment(
      {
        type: "app_key",
        userId: ctx.ownerUserId,
        keyId: ctx.apiKeyId,
        organizationId: ctx.organizationId,
        appId: ctx.appId,
        testMode: true,
      },
      {
        paymentId: `test-payment-${ctx.suffix}`,
        customerId: identified.customer.id,
        programId: ctx.programId,
        amount: 2500,
        currency: "usd",
      }
    );

    const [status, regularAffiliates, testAffiliates, after, balance] =
      await Promise.all([
        getAppSetupStatus(ctx.ownerUserId, ctx.appId),
        listAffiliatesForApp(ctx.ownerUserId, ctx.appId, {}),
        listAffiliatesForApp(ctx.ownerUserId, ctx.appId, {}, { testMode: true }),
        getAppOverview(ctx.ownerUserId, ctx.appId),
        computePayableBalance(testAffiliate.affiliate.id, ctx.programId),
      ]);

    expect(status).toMatchObject({
      test_api_key_created: true,
      test_api_key: ctx.apiKey,
      test_api_key_used: true,
      test_affiliate_created: true,
      test_first_click: true,
      test_first_identify: true,
      test_first_revenue_event: true,
      test_first_commission: true,
      test_integration_complete: true,
      live_api_key_created: true,
      production_ready: true,
    });
    expect(regularAffiliates.data.some((row) => row.isTest)).toBe(false);
    expect(testAffiliates.data).toHaveLength(1);
    expect(testAffiliates.data[0]?.isTest).toBe(true);
    expect(after).toEqual(before);
    expect(balance.amount).toBe(0);

    const [
      testOverview,
      testClicks,
      liveClicks,
      testReferrals,
      liveReferrals,
      testTransactions,
      liveTransactions,
      testCommissions,
      liveCommissions,
    ] = await Promise.all([
      getAppOverview(ctx.ownerUserId, ctx.appId, { environment: "test" }),
      listClicksForProgram(ctx.ownerUserId, ctx.programId, {}, {
        environment: "test",
      }),
      listClicksForProgram(ctx.ownerUserId, ctx.programId, {}, {
        environment: "live",
      }),
      listReferralsForApp(ctx.ownerUserId, ctx.appId, {}, {
        environment: "test",
      }),
      listReferralsForApp(ctx.ownerUserId, ctx.appId, {}, {
        environment: "live",
      }),
      listTransactionsForApp(ctx.ownerUserId, ctx.appId, {}, {
        environment: "test",
      }),
      listTransactionsForApp(ctx.ownerUserId, ctx.appId, {}, {
        environment: "live",
      }),
      listCommissionsForApp(ctx.ownerUserId, ctx.appId, {}, {
        environment: "test",
      }),
      listCommissionsForApp(ctx.ownerUserId, ctx.appId, {}, {
        environment: "live",
      }),
    ]);

    expect(testOverview).toMatchObject({
      clicks: 1,
      referrals: 1,
      paying_customers: 1,
      gross_referred_revenue: { amount: 2500, currency: "usd" },
    });
    expect(testClicks.data.map((row) => row.id)).toContain(click.clickId);
    expect(liveClicks.data.map((row) => row.id)).not.toContain(click.clickId);
    expect(testReferrals.data.map((row) => row.id)).toContain(
      identified.referral.id,
    );
    expect(liveReferrals.data.map((row) => row.id)).not.toContain(
      identified.referral.id,
    );
    expect(testTransactions.data.every((row) => !row.livemode)).toBe(true);
    expect(liveTransactions.data.every((row) => row.livemode)).toBe(true);
    expect(testCommissions.data.every((row) => !row.livemode)).toBe(true);
    expect(liveCommissions.data.every((row) => row.livemode)).toBe(true);

  });

  it("does not lock the revenue source after test-only payment activity", async () => {
    const testOnly = await seedAttributionGraph({ affiliateTestMode: true });

    try {
      await updateAppRevenueSource(testOnly.ownerUserId, testOnly.appId, "api");
      testOnly.rateLimitScopes.push(`report-payment:${testOnly.apiKeyId}`);
      await reportPayment(
        {
          type: "app_key",
          userId: testOnly.ownerUserId,
          keyId: testOnly.apiKeyId,
          organizationId: testOnly.organizationId,
          appId: testOnly.appId,
          testMode: true,
        },
        {
          paymentId: `test-only-payment-${testOnly.suffix}`,
          customerId: testOnly.customerId,
          programId: testOnly.programId,
          amount: 2500,
          currency: "usd",
        }
      );

      await expect(
        updateAppRevenueSource(testOnly.ownerUserId, testOnly.appId, "stripe")
      ).resolves.toMatchObject({ revenueSource: "stripe" });
    }
    finally {
      await cleanupTestContext(testOnly);
    }
  });

  it("lists clicks and referrals for a program", async () => {
    const clicks = await listClicksForProgram(
      ctx.ownerUserId,
      ctx.programId,
      {}
    );
    const referrals = await listReferralsForProgram(
      ctx.ownerUserId,
      ctx.programId,
      {}
    );

    expect(clicks.data.map((row) => row.id)).toContain(ctx.clickId);
    expect(referrals.data.map((row) => row.id)).toContain(ctx.referralId);
  });

  it("lists affiliates referrals transactions and commissions for an app", async () => {
    const [affiliates, referrals, transactions, commissions] =
      await Promise.all([
        listAffiliatesForApp(ctx.ownerUserId, ctx.appId, {}),
        listReferralsForApp(ctx.ownerUserId, ctx.appId, {}),
        listTransactionsForApp(ctx.ownerUserId, ctx.appId, {}),
        listCommissionsForApp(ctx.ownerUserId, ctx.appId, {}),
      ]);

    expect(affiliates.data).toHaveLength(1);
    expect(affiliates.data[0].programId).toBe(ctx.programId);
    expect(referrals.data.map((row) => row.id)).toContain(ctx.referralId);
    expect(
      referrals.data.every((row) => row.programId === ctx.programId)
    ).toBe(true);
    expect(
      transactions.data.map((row) => row.amount).sort((a, b) => a - b)
    ).toEqual([2500, 5000]);
    expect(
      commissions.data.map((row) => row.amount).sort((a, b) => a - b)
    ).toEqual([500, 1000]);
  });

  it("handles join page signup with pending approval", async () => {
    const suffix = `${ctx.suffix}-join`;
    const db = getDb();
    const currentAgreement = await getCurrentAppAgreement(ctx.appId);

    if (!currentAgreement) {
      throw new Error("Expected seeded app agreement.");
    }

    const result = await joinProgramViaPublicPage({
      programSlug: `prg-${ctx.suffix}`,
      email: `join-${suffix}@refkit-vitest.test`,
      name: "Join Tester",
      appAgreementVersionId: currentAgreement.id,
    });

    expect(result.status).toBe("pending");
    const [joinedUser] = await db
      .select({ primaryMode: users.primaryMode })
      .from(users)
      .where(eq(users.id, result.affiliate.userId))
      .limit(1);
    expect(joinedUser?.primaryMode).toBe("affiliate");

    const approved = await approvePendingAffiliate(
      ctx.ownerUserId,
      result.affiliate.id
    );
    expect(approved.status).toBe("active");

    await db
      .delete(affiliateAgreementAcceptances)
      .where(eq(affiliateAgreementAcceptances.programAffiliateId, result.affiliate.id));
    await db
      .delete(affiliateLinks)
      .where(eq(affiliateLinks.programAffiliateId, result.affiliate.id));
    await db.delete(programAffiliates).where(eq(programAffiliates.id, result.affiliate.id));
    await db
      .delete(users)
      .where(eq(users.id, result.affiliate.userId));
  });

  it("extends me profile with organizations and affiliate programs", async () => {
    const profile = await getMeProfile(
      ctx.ownerUserId,
      `owner-${ctx.suffix}@refkit-vitest.test`,
      "Owner"
    );

    expect(profile.organizations.length).toBeGreaterThanOrEqual(1);
    expect(profile.default_mode).toBe("owner");
    expect(profile.image).toBeNull();

    const affiliateProfile = await getMeProfile(
      ctx.affiliateUserId,
      `affiliate-${ctx.suffix}@refkit-vitest.test`,
      "Affiliate"
    );

    expect(affiliateProfile.program_affiliates.length).toBeGreaterThanOrEqual(1);
    expect(affiliateProfile.default_mode).toBe("affiliate");
    expect(affiliateProfile.image).toBeNull();
  });

  it("uploads and removes a profile photo", async () => {
    const ownerEmail = `owner-${ctx.suffix}@refkit-vitest.test`;
    const file = onePixelPng("photo.png");

    const uploaded = await uploadUserPhoto(
      ctx.ownerUserId,
      ownerEmail,
      "Owner",
      file
    );

    expect(uploaded.image).toMatch(/\/api\/dev\/user-photos\//);

    const cleared = await removeUserPhoto(
      ctx.ownerUserId,
      ownerEmail,
      "Owner"
    );

    expect(cleared.image).toBeNull();
  });

  it("serializes image replacements and retains only the active local file", async () => {
    const ownerEmail = `owner-${ctx.suffix}@refkit-vitest.test`;
    ctx.rateLimitScopes.push(
      `upload-user-photo:${ctx.ownerUserId}`,
      `upload-app-logo:${ctx.appId}`
    );

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        uploadUserPhoto(
          ctx.ownerUserId,
          ownerEmail,
          "Owner",
          onePixelPng(`photo-${index}.png`)
        )
      )
    );

    await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        uploadAppLogo(
          ctx.ownerUserId,
          ctx.appId,
          onePixelPng(`logo-${index}.png`)
        )
      )
    );

    await expect(
      readdir(join(LOCAL_USER_PHOTO_DIR, ctx.ownerUserId))
    ).resolves.toHaveLength(1);
    await expect(
      readdir(join(LOCAL_LOGO_DIR, ctx.appId))
    ).resolves.toHaveLength(1);

    await removeUserPhoto(ctx.ownerUserId, ownerEmail, "Owner");
    await removeAppLogo(ctx.ownerUserId, ctx.appId);

    await expect(
      readdir(join(LOCAL_USER_PHOTO_DIR, ctx.ownerUserId))
    ).resolves.toHaveLength(0);
    await expect(
      readdir(join(LOCAL_LOGO_DIR, ctx.appId))
    ).resolves.toHaveLength(0);
  });

  it("updates user name and returns it from getMeProfile", async () => {
    const ownerEmail = `owner-${ctx.suffix}@refkit-vitest.test`;
    const updated = await updateUserName(
      ctx.ownerUserId,
      "Updated Owner",
      ownerEmail
    );

    expect(updated.name).toBe("Updated Owner");

    const profile = await getMeProfile(
      ctx.ownerUserId,
      ownerEmail,
      "Stale Session Name"
    );

    expect(profile.name).toBe("Updated Owner");
  });

  it("rejects empty user name updates", async () => {
    const ownerEmail = `owner-${ctx.suffix}@refkit-vitest.test`;

    await expect(
      updateUserName(ctx.ownerUserId, "   ", ownerEmail)
    ).rejects.toMatchObject({
      code: "invalid_name",
    });
  });

  it("resolves default home path from profile mode", async () => {
    const ownerHome = await getDefaultHomePathForUser(
      ctx.ownerUserId,
      `owner-${ctx.suffix}@refkit-vitest.test`,
      "Owner"
    );
    const affiliateHome = await getDefaultHomePathForUser(
      ctx.affiliateUserId,
      `affiliate-${ctx.suffix}@refkit-vitest.test`,
      "Affiliate"
    );

    expect(ownerHome).toBe("/dashboard");
    expect(affiliateHome).toBe("/affiliate");
  });

  it("requires acknowledgment before disabling a program", async () => {
    await expect(
      disableProgram(ctx.ownerUserId, ctx.programId)
    ).rejects.toThrow();

    await acknowledgeProgramDisable(ctx.ownerUserId, ctx.programId);

    const disabled = await disableProgram(ctx.ownerUserId, ctx.programId);
    expect(disabled.status).toBe("disabled");

    const db = getDb();
    await db
      .update(programs)
      .set({ status: "active", disabledAcknowledgedAt: null })
      .where(eq(programs.id, ctx.programId));
  });
});
