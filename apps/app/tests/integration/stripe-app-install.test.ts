import { createHmac } from "crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "@/db/client";
import { pendingStripeInstalls, stripeConnections } from "@/db/schema";
import { resetServerEnvCache } from "@/lib/env";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { updateAppRevenueSource } from "@/services/apps";
import {
  claimPendingStripeInstall,
  completeStripeAppInstall,
  createStripeAppInstallUrl,
  disconnectStripeConnectionForApp,
  recordStripeAppAuthorization,
} from "@/services/stripe/connected-accounts";
import {
  seedAttributionGraph,
  cleanupTestContext,
  type TestContext,
} from "../helpers/context";

describe("stripe app install", () => {
  let ctx: TestContext;
  const previousStripeSecret = process.env.STRIPE_SECRET_KEY;
  const previousInstallUrl = process.env.STRIPE_APP_INSTALL_URL;
  const previousAppSecret = process.env.STRIPE_APP_SECRET;
  const previousFixtureMode = process.env.STRIPE_FIXTURE_MODE;
  const previousAppUrl = process.env.APP_URL;

  beforeAll(async () => {
    ctx = await seedAttributionGraph();
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  afterEach(() => {
    resetServerEnvCache();

    for (const [name, value] of Object.entries({
      STRIPE_SECRET_KEY: previousStripeSecret,
      STRIPE_APP_INSTALL_URL: previousInstallUrl,
      STRIPE_APP_SECRET: previousAppSecret,
      STRIPE_FIXTURE_MODE: previousFixtureMode,
      APP_URL: previousAppUrl,
    })) {
      if (value === undefined) {
        delete process.env[name];
      }
      else {
        process.env[name] = value;
      }
    }
  });

  it("builds a Stripe App install URL when installs are configured", async () => {
    const appUrl = "http://localhost:3000";
    process.env.APP_URL = appUrl;
    process.env.STRIPE_SECRET_KEY = "sk_test_install_example";
    process.env.STRIPE_APP_INSTALL_URL =
      "https://marketplace.stripe.com/apps/install/link/refkit-test";
    process.env.STRIPE_APP_SECRET = "absec_test_install_example";
    process.env.STRIPE_FIXTURE_MODE = "false";
    resetServerEnvCache();

    const result = await createStripeAppInstallUrl(
      ctx.ownerUserId,
      ctx.appId
    );
    const url = new URL(result.url);

    expect(url.origin).toBe("https://marketplace.stripe.com");
    expect(url.pathname).toBe("/apps/install/link/refkit-test");
    expect(url.searchParams.get("redirect_uri")).toBe(
      `${appUrl}/api/stripe/install/callback`
    );
    expect(url.searchParams.get("state")).toBe(result.state);
    expect(result.state).toContain(".");
  });

  it("verifies Stripe's install signature before storing the account", async () => {
    const appSecret = "absec_test_install_example";
    process.env.STRIPE_SECRET_KEY = "sk_test_install_example";
    process.env.STRIPE_APP_INSTALL_URL =
      "https://marketplace.stripe.com/apps/install/link/refkit-test";
    process.env.STRIPE_APP_SECRET = appSecret;
    process.env.STRIPE_FIXTURE_MODE = "false";
    resetServerEnvCache();

    const { state } = await createStripeAppInstallUrl(
      ctx.ownerUserId,
      ctx.appId,
      undefined,
      false,
    );
    const stripeUserId = "usr_refkit_install_test";
    const stripeAccountId = `acct_refkit_${ctx.appId.slice(-8)}`;
    const payload = JSON.stringify({
      state,
      user_id: stripeUserId,
      account_id: stripeAccountId,
    });
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac("sha256", appSecret)
      .update(`${timestamp}.${payload}`)
      .digest("hex");

    const connection = await completeStripeAppInstall({
      stripeUserId,
      stripeAccountId,
      state,
      installSignature: `t=${timestamp},v1=${signature}`,
      livemode: false,
    });
    ctx.stripeConnectionId = connection.id;

    expect(connection.appId).toBe(ctx.appId);
    expect(connection.stripeAccountId).toBe(stripeAccountId);
    expect(connection.livemode).toBe(false);
    expect(connection.status).toBe("connected");
  });

  it("binds an authorized Stripe account to a single pending install", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_install_example";
    process.env.STRIPE_APP_INSTALL_URL =
      "https://marketplace.stripe.com/apps/install/link/refkit-test";
    process.env.STRIPE_APP_SECRET = "absec_test_install_example";
    process.env.STRIPE_FIXTURE_MODE = "false";
    resetServerEnvCache();

    // The webhook only records the authorization; the owner-scoped claim binds
    // it when this app is the sole install in flight.
    await getDb()
      .delete(pendingStripeInstalls)
      .where(eq(pendingStripeInstalls.appId, ctx.appId));
    await createStripeAppInstallUrl(ctx.ownerUserId, ctx.appId);

    const stripeAccountId = `acct_auth_${ctx.appId.slice(-8)}`;
    const recorded = await recordStripeAppAuthorization({
      stripeAccountId,
      livemode: true,
    });

    expect(recorded.status).toBe("pending_claim");
    expect(recorded.connection).toBeNull();

    const claimed = await claimPendingStripeInstall({
      userId: ctx.ownerUserId,
      appId: ctx.appId,
    });

    expect(claimed.status).toBe("connected");
    expect(claimed.connection?.stripeAccountId).toBe(stripeAccountId);
    ctx.stripeConnectionId = claimed.connection?.id ?? ctx.stripeConnectionId;
  });

  it("rejects a Stripe authorization from the wrong dashboard mode", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_install_example";
    process.env.STRIPE_APP_INSTALL_URL =
      "https://marketplace.stripe.com/apps/install/link/refkit-test";
    process.env.STRIPE_APP_SECRET = "absec_test_install_example";
    process.env.STRIPE_FIXTURE_MODE = "false";
    resetServerEnvCache();

    await getDb()
      .delete(pendingStripeInstalls)
      .where(eq(pendingStripeInstalls.appId, ctx.appId));
    await createStripeAppInstallUrl(
      ctx.ownerUserId,
      ctx.appId,
      undefined,
      false,
    );

    const stripeAccountId = `acct_mode_mismatch_${ctx.appId.slice(-8)}`;
    const recorded = await recordStripeAppAuthorization({
      stripeAccountId,
      livemode: true,
    });

    expect(recorded).toMatchObject({
      status: "pending_claim",
      connection: null,
    });

    // Mode mismatch is enforced when the owner claims, not from the webhook.
    const claimed = await claimPendingStripeInstall({
      userId: ctx.ownerUserId,
      appId: ctx.appId,
    });

    expect(claimed).toMatchObject({
      status: "mode_mismatch",
      connection: null,
    });
    expect(claimed.message).toContain("Test mode requires");

    const [connection] = await getDb()
      .select()
      .from(stripeConnections)
      .where(eq(stripeConnections.stripeAccountId, stripeAccountId))
      .limit(1);

    expect(connection).toBeUndefined();
  });

  it("disconnects live Stripe so revenue source can switch to API", async () => {
    const db = getDb();
    const [existing] = await db
      .select()
      .from(stripeConnections)
      .where(
        and(
          eq(stripeConnections.appId, ctx.appId),
          eq(stripeConnections.livemode, true)
        )
      )
      .limit(1);

    if (existing) {
      await db
        .update(stripeConnections)
        .set({ status: "connected" })
        .where(eq(stripeConnections.id, existing.id));
      ctx.stripeConnectionId = existing.id;
    }
    else {
      const connectionId = generateId(ID_PREFIXES.stripeConnection);
      await db.insert(stripeConnections).values({
        id: connectionId,
        appId: ctx.appId,
        stripeAccountId: `acct_disconnect_${ctx.appId.slice(-8)}`,
        livemode: true,
        status: "connected",
      });
      ctx.stripeConnectionId = connectionId;
    }

    await expect(
      updateAppRevenueSource(ctx.ownerUserId, ctx.appId, "api")
    ).rejects.toMatchObject({
      code: "stripe_connection_exists",
    });

    const disconnected = await disconnectStripeConnectionForApp(
      ctx.ownerUserId,
      ctx.appId,
      { livemode: true }
    );

    expect(disconnected.status).toBe("disconnected");
    expect(disconnected.livemode).toBe(true);

    await expect(
      updateAppRevenueSource(ctx.ownerUserId, ctx.appId, "api")
    ).resolves.toMatchObject({ revenueSource: "api" });
  });

  it("reconnects a disconnected Stripe account on reinstall", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_install_example";
    process.env.STRIPE_APP_INSTALL_URL =
      "https://marketplace.stripe.com/apps/install/link/refkit-test";
    process.env.STRIPE_APP_SECRET = "absec_test_install_example";
    process.env.STRIPE_FIXTURE_MODE = "false";
    resetServerEnvCache();

    await updateAppRevenueSource(ctx.ownerUserId, ctx.appId, "stripe");

    const db = getDb();
    const [existing] = await db
      .select()
      .from(stripeConnections)
      .where(eq(stripeConnections.appId, ctx.appId))
      .limit(1);

    expect(existing).toBeTruthy();

    await db
      .update(stripeConnections)
      .set({ status: "disconnected" })
      .where(eq(stripeConnections.id, existing!.id));

    const stripeAccountId = `acct_reconnect_${ctx.appId.slice(-8)}`;

    await db
      .delete(pendingStripeInstalls)
      .where(eq(pendingStripeInstalls.appId, ctx.appId));
    await createStripeAppInstallUrl(
      ctx.ownerUserId,
      ctx.appId,
      undefined,
      existing!.livemode,
    );

    await recordStripeAppAuthorization({
      stripeAccountId,
      livemode: existing!.livemode,
    });

    const claimed = await claimPendingStripeInstall({
      userId: ctx.ownerUserId,
      appId: ctx.appId,
    });

    expect(claimed.status).toBe("connected");
    expect(claimed.connection?.status).toBe("connected");
    expect(claimed.connection?.id).toBe(existing!.id);
  });
});
