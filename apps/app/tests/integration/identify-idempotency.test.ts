import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { customers, programs, referrals } from "@/db/schema";
import {
  cleanupTestContext,
  seedAttributionGraph,
  type TestContext,
} from "../helpers/context";
import { createApiKey } from "@/services/api-keys";
import { identifyCustomer } from "@/services/identify";

describe("identify idempotency", () => {
  let ctx: TestContext;
  const externalCustomerId = "identify-user-vitest";

  beforeAll(async () => {
    ctx = await seedAttributionGraph({ affiliateTestMode: true });
    ctx.rateLimitScopes.push(`identify:${ctx.apiKeyId}`);
  });

  afterAll(async () => {
    const db = getDb();

    const customerRows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(
        and(
          eq(customers.appId, ctx.appId),
          eq(customers.externalCustomerId, externalCustomerId)
        )
      );

    for (const row of customerRows) {
      await db.delete(referrals).where(eq(referrals.customerId, row.id));
      await db.delete(customers).where(eq(customers.id, row.id));
    }

    await cleanupTestContext(ctx);
  });

  it("creates one customer and one referral on duplicate identify calls", async () => {
    const auth = {
      type: "app_key" as const,
      userId: ctx.ownerUserId,
      keyId: ctx.apiKeyId,
      organizationId: ctx.organizationId,
      appId: ctx.appId,
      testMode: true,
    };

    const first = await identifyCustomer(auth, {
      clickId: ctx.clickId,
      externalCustomerId: externalCustomerId,
      email: `identify-${ctx.suffix}@refkit-vitest.test`,
    });

    expect(first.attributed).toBe(true);

    const second = await identifyCustomer(auth, {
      clickId: ctx.clickId,
      externalCustomerId: externalCustomerId,
      email: `identify-${ctx.suffix}@refkit-vitest.test`,
    });

    expect(second.attributed).toBe(false);
    expect(second.referral.id).toBe(first.referral.id);
    expect(second.customer.id).toBe(first.customer.id);

    const db = getDb();

    const customerRows = await db
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.appId, ctx.appId),
          eq(customers.externalCustomerId, externalCustomerId)
        )
      );

    const referralRows = await db
      .select()
      .from(referrals)
      .where(eq(referrals.programId, ctx.programId));

    const identifyReferrals = referralRows.filter(
      (row) => row.customerId === first.customer.id
    );

    expect(customerRows).toHaveLength(1);
    expect(identifyReferrals).toHaveLength(1);
  });

  it("accepts only matching Test and Live key/Affiliate combinations", async () => {
    const liveCtx = await seedAttributionGraph();
    const liveKey = await createApiKey({
      userId: liveCtx.ownerUserId,
      kind: "app",
      organizationId: liveCtx.organizationId,
      appId: liveCtx.appId,
      name: `Live identify key ${liveCtx.suffix}`,
      testMode: false,
    });
    const liveKeyForTestAffiliate = await createApiKey({
      userId: ctx.ownerUserId,
      kind: "app",
      organizationId: ctx.organizationId,
      appId: ctx.appId,
      name: `Mismatched identify key ${ctx.suffix}`,
      testMode: false,
    });
    liveCtx.affiliateApiKeyIds = [liveKey.id];
    ctx.affiliateApiKeyIds = [
      ...(ctx.affiliateApiKeyIds ?? []),
      liveKeyForTestAffiliate.id,
    ];
    liveCtx.rateLimitScopes.push(`identify:${liveCtx.apiKeyId}`);
    liveCtx.rateLimitScopes.push(`identify:${liveKey.id}`);
    ctx.rateLimitScopes.push(`identify:${liveKeyForTestAffiliate.id}`);

    const authFor = (
      target: TestContext,
      keyId: string,
      testMode: boolean
    ) => ({
      type: "app_key" as const,
      userId: target.ownerUserId,
      keyId,
      organizationId: target.organizationId,
      appId: target.appId,
      testMode,
    });

    try {
      await expect(identifyCustomer(
        authFor(liveCtx, liveKey.id, false),
        {
          clickId: liveCtx.clickId,
          externalCustomerId: `identify-live-live-${liveCtx.suffix}`,
        }
      )).resolves.toMatchObject({ attributed: true });

      await expect(identifyCustomer(
        authFor(liveCtx, liveCtx.apiKeyId, true),
        {
          clickId: liveCtx.clickId,
          externalCustomerId: `identify-test-live-${liveCtx.suffix}`,
        }
      )).rejects.toMatchObject({ code: "click_not_found" });

      await expect(identifyCustomer(
        authFor(ctx, liveKeyForTestAffiliate.id, false),
        {
          clickId: ctx.clickId,
          externalCustomerId: `identify-live-test-${ctx.suffix}`,
        }
      )).rejects.toMatchObject({ code: "click_not_found" });
    }
    finally {
      await cleanupTestContext(liveCtx);
    }
  });

  it("restricts clickless promotion-code evidence to managed revenue keys", async () => {
    const externalId = `identify-code-${ctx.suffix}`;
    const db = getDb();
    await db
      .update(programs)
      .set({ promotionCodeFallback: true })
      .where(eq(programs.id, ctx.programId));

    const ordinaryAuth = {
      type: "app_key" as const,
      userId: ctx.ownerUserId,
      keyId: ctx.apiKeyId,
      organizationId: ctx.organizationId,
      appId: ctx.appId,
      testMode: true,
    };
    const input = {
      externalCustomerId: externalId,
      attributionEvidence: {
        type: "promotion_code" as const,
        value: `CODE-${ctx.suffix}`,
        programId: ctx.programId,
        programAffiliateId: ctx.programAffiliateId,
      },
    };

    await expect(
      identifyCustomer(ordinaryAuth, input)
    ).rejects.toMatchObject({ code: "managed_connection_required" });

    const result = await identifyCustomer(
      {
        ...ordinaryAuth,
        userId: null,
        managedAccountId: "macc_identify_test",
        managedConnectionId: "mcon_identify_test",
      },
      input
    );

    try {
      expect(result.attributed).toBe(true);
      expect(result.attributionSource).toBe("promotion_code");
      expect(result.referral.clickId).toBeNull();
    }
    finally {
      await db.delete(referrals).where(eq(referrals.customerId, result.customer.id));
      await db.delete(customers).where(eq(customers.id, result.customer.id));
    }
  });
});
