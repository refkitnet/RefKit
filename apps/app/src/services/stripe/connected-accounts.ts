import { and, asc, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  apps,
  pendingStripeInstalls,
  stripeAppAuthorizations,
  stripeConnections,
  type StripeConnection,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { isUniqueViolation } from "@/lib/db-errors";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { requireAppAccess } from "@/services/scoping";
import {
  createStripeInstallState,
  verifyStripeInstallState,
} from "@/lib/stripe-install-state";
import { getStripeClient } from "@/services/stripe/client";
import { isStripeAppInstallConfigured } from "@/services/stripe/config";
import { getServerEnv, getStripeAppEnv } from "@/lib/env";
import { assertAppRevenueSource } from "@/services/revenue/guards";

const PENDING_INSTALL_TTL_MS = 15 * 60 * 1000;
const AUTHORIZATION_CLAIM_SKEW_MS = 60 * 1000;

export {
  createEarnedCommissionEntry,
  createRefundReversalEntry,
  createDisputeEntry,
  getEarnedEntryForTransaction,
  markEntriesDisputed,
  restoreDisputedEntries,
} from "@/services/revenue/commission-ledger";

export function serializeStripeConnection(connection: StripeConnection) {
  return {
    id: connection.id,
    stripe_account_id: connection.stripeAccountId,
    livemode: connection.livemode,
    status: connection.status,
  };
}

export async function createSandboxStripeConnection(appId: string) {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(stripeConnections)
    .where(
      and(eq(stripeConnections.appId, appId), eq(stripeConnections.livemode, false))
    )
    .limit(1);

  if (existing) {
    return existing;
  }

  const connectionId = generateId(ID_PREFIXES.stripeConnection);
  const stripeAccountId = `acct_sandbox_${appId.replace("app_", "").slice(0, 16)}`;

  await db.insert(stripeConnections).values({
    id: connectionId,
    appId,
    stripeAccountId,
    livemode: false,
    status: "connected",
  });

  const [created] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.id, connectionId))
    .limit(1);

  return created!;
}

export async function getStripeConnectionForApp(appId: string) {
  const db = getDb();

  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.appId, appId))
    .limit(1);

  return connection ?? null;
}

export async function getStripeConnectionByAccountId(stripeAccountId: string) {
  const db = getDb();

  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.stripeAccountId, stripeAccountId))
    .limit(1);

  return connection ?? null;
}

async function resolveInstallLivemode(
  stripeAccountId: string,
  fallback: boolean
) {
  const db = getDb();
  const [authorization] = await db
    .select({ livemode: stripeAppAuthorizations.livemode })
    .from(stripeAppAuthorizations)
    .where(eq(stripeAppAuthorizations.stripeAccountId, stripeAccountId))
    .limit(1);

  return authorization?.livemode ?? fallback;
}

function stripeInstallModeMismatch(expectedLivemode: boolean) {
  return new AppError(
    "invalid_request",
    "stripe_mode_mismatch",
    expectedLivemode
      ? "Live mode requires a live Stripe account. Switch Stripe out of test mode and try again."
      : "Test mode requires a Stripe test account or sandbox. Switch Stripe to test mode and try again.",
    409,
  );
}

function expectedLivemodeForPending(pending: { state: string }) {
  return verifyStripeInstallState(pending.state).livemode;
}

export async function createStripeAppInstallUrl(
  userId: string,
  appId: string,
  returnTo?: string,
  livemode = true,
) {
  await requireAppAccess(userId, appId);
  await assertAppRevenueSource(appId, "stripe");

  if (!isStripeAppInstallConfigured()) {
    throw new AppError(
      "invalid_request",
      "stripe_not_configured",
      "Stripe App installs are not configured for this environment. Use sandbox testing locally or complete the Stripe App setup.",
      503
    );
  }

  const env = getServerEnv();
  const state = createStripeInstallState(appId, userId, returnTo, livemode);
  const redirectUri = `${env.APP_URL}/api/stripe/install/callback`;
  const installUrl = new URL(env.STRIPE_APP_INSTALL_URL!);
  installUrl.searchParams.set("state", state);
  installUrl.searchParams.set("redirect_uri", redirectUri);

  await upsertPendingStripeInstall({
    appId,
    userId,
    state,
  });

  return {
    url: installUrl.toString(),
    state,
  };
}

async function upsertPendingStripeInstall(input: {
  appId: string;
  userId: string;
  state: string;
}) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + PENDING_INSTALL_TTL_MS);
  const [existing] = await db
    .select()
    .from(pendingStripeInstalls)
    .where(
      and(
        eq(pendingStripeInstalls.appId, input.appId),
        eq(pendingStripeInstalls.userId, input.userId)
      )
    )
    .limit(1);

  if (existing) {
    await db
      .update(pendingStripeInstalls)
      .set({
        state: input.state,
        expiresAt,
      })
      .where(eq(pendingStripeInstalls.id, existing.id));
    return;
  }

  await db.insert(pendingStripeInstalls).values({
    id: generateId(ID_PREFIXES.pendingStripeInstall),
    appId: input.appId,
    userId: input.userId,
    state: input.state,
    expiresAt,
  });
}

async function clearPendingStripeInstall(appId: string, userId: string) {
  const db = getDb();

  await db
    .delete(pendingStripeInstalls)
    .where(
      and(
        eq(pendingStripeInstalls.appId, appId),
        eq(pendingStripeInstalls.userId, userId)
      )
    );
}

async function getUnexpiredPendingInstall(appId: string, userId: string) {
  const db = getDb();
  const [pending] = await db
    .select()
    .from(pendingStripeInstalls)
    .where(
      and(
        eq(pendingStripeInstalls.appId, appId),
        eq(pendingStripeInstalls.userId, userId),
        gt(pendingStripeInstalls.expiresAt, new Date())
      )
    )
    .limit(1);

  return pending ?? null;
}

async function listUnexpiredPendingInstalls() {
  const db = getDb();

  return db
    .select()
    .from(pendingStripeInstalls)
    .where(gt(pendingStripeInstalls.expiresAt, new Date()));
}

async function markAuthorizationClaimed(
  authorizationId: string,
  appId: string
) {
  const db = getDb();

  await db
    .update(stripeAppAuthorizations)
    .set({
      claimedAppId: appId,
      claimedAt: new Date(),
    })
    .where(eq(stripeAppAuthorizations.id, authorizationId));
}

async function findClaimableAuthorization(pendingCreatedAt: Date) {
  const db = getDb();
  const earliest = new Date(
    pendingCreatedAt.getTime() - AUTHORIZATION_CLAIM_SKEW_MS
  );

  return db
    .select()
    .from(stripeAppAuthorizations)
    .where(
      and(
        isNull(stripeAppAuthorizations.claimedAt),
        gt(stripeAppAuthorizations.createdAt, earliest)
      )
    )
    .orderBy(asc(stripeAppAuthorizations.createdAt));
}

async function upsertStripeAppConnection(input: {
  appId: string;
  stripeAccountId: string;
  livemode: boolean;
}) {
  const db = getDb();

  const [existingForAccount] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.stripeAccountId, input.stripeAccountId))
    .limit(1);

  if (existingForAccount && existingForAccount.appId !== input.appId) {
    throw new AppError(
      "invalid_request",
      "stripe_account_already_connected",
      "This Stripe account is already connected to another RefKit app.",
      409
    );
  }

  if (
    existingForAccount
    && existingForAccount.livemode !== input.livemode
  ) {
    throw new AppError(
      "conflict",
      "stripe_account_mode_mismatch",
      "This Stripe account is already connected in the other mode.",
      409
    );
  }

  const [existingForApp] = await db
    .select()
    .from(stripeConnections)
    .where(
      and(
        eq(stripeConnections.appId, input.appId),
        eq(stripeConnections.livemode, input.livemode)
      )
    )
    .limit(1);

  if (existingForApp) {
    await db
      .update(stripeConnections)
      .set({
        stripeAccountId: input.stripeAccountId,
        status: "connected",
      })
      .where(eq(stripeConnections.id, existingForApp.id));

    const [updated] = await db
      .select()
      .from(stripeConnections)
      .where(eq(stripeConnections.id, existingForApp.id))
      .limit(1);

    return updated!;
  }

  const connectionId = generateId(ID_PREFIXES.stripeConnection);

  try {
    await db.insert(stripeConnections).values({
      id: connectionId,
      appId: input.appId,
      stripeAccountId: input.stripeAccountId,
      livemode: input.livemode,
      status: "connected",
    });
  }
  catch (error) {
    if (isUniqueViolation(error)) {
      const [existing] = await db
        .select()
        .from(stripeConnections)
        .where(eq(stripeConnections.stripeAccountId, input.stripeAccountId))
        .limit(1);

      if (existing) {
        if (existing.appId !== input.appId) {
          throw new AppError(
            "invalid_request",
            "stripe_account_already_connected",
            "This Stripe account is already connected to another RefKit app.",
            409
          );
        }

        if (existing.livemode !== input.livemode) {
          throw new AppError(
            "conflict",
            "stripe_account_mode_mismatch",
            "This Stripe account is already connected in the other mode.",
            409
          );
        }

        await db
          .update(stripeConnections)
          .set({
            status: "connected",
          })
          .where(eq(stripeConnections.id, existing.id));

        const [updated] = await db
          .select()
          .from(stripeConnections)
          .where(eq(stripeConnections.id, existing.id))
          .limit(1);

        return updated!;
      }
    }

    throw error;
  }

  const [created] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.id, connectionId))
    .limit(1);

  return created!;
}

export async function completeStripeAppInstall(input: {
  stripeUserId: string;
  stripeAccountId: string;
  state: string;
  installSignature: string;
  livemode: boolean;
}) {
  const payload = verifyStripeInstallState(input.state);

  await requireAppAccess(payload.userId, payload.appId);

  const stripe = getStripeClient();
  const signaturePayload = JSON.stringify({
    state: input.state,
    user_id: input.stripeUserId,
    account_id: input.stripeAccountId,
  });
  const signatureVerifier = stripe.webhooks.signature;

  if (!signatureVerifier) {
    throw new Error("Stripe install signature verification is unavailable.");
  }

  signatureVerifier.verifyHeader(
    signaturePayload,
    input.installSignature,
    getStripeAppEnv().STRIPE_APP_SECRET
  );

  const livemode = await resolveInstallLivemode(
    input.stripeAccountId,
    input.livemode
  );

  if (
    payload.livemode !== undefined
    && payload.livemode !== livemode
  ) {
    await clearPendingStripeInstall(payload.appId, payload.userId);
    await claimAuthorizationForAccount(input.stripeAccountId, payload.appId);
    throw stripeInstallModeMismatch(payload.livemode);
  }

  const connection = await upsertStripeAppConnection({
    appId: payload.appId,
    stripeAccountId: input.stripeAccountId,
    livemode,
  });

  await clearPendingStripeInstall(payload.appId, payload.userId);
  await claimAuthorizationForAccount(
    input.stripeAccountId,
    payload.appId
  );

  return connection;
}

async function claimAuthorizationForAccount(
  stripeAccountId: string,
  appId: string
) {
  const db = getDb();
  const [authorization] = await db
    .select()
    .from(stripeAppAuthorizations)
    .where(eq(stripeAppAuthorizations.stripeAccountId, stripeAccountId))
    .limit(1);

  if (authorization && !authorization.claimedAt) {
    await markAuthorizationClaimed(authorization.id, appId);
  }
}

export async function recordStripeAppAuthorization(input: {
  stripeAccountId: string;
  livemode: boolean;
}) {
  const db = getDb();
  const existingConnection = await getStripeConnectionByAccountId(
    input.stripeAccountId
  );

  if (existingConnection) {
    if (existingConnection.livemode !== input.livemode) {
      console.warn(
        `[refkit:stripe] Ignoring authorization mode mismatch for ${input.stripeAccountId}.`
      );

      return {
        status: "mode_mismatch" as const,
        connection: null,
      };
    }

    if (existingConnection.status !== "connected") {
      await db
        .update(stripeConnections)
        .set({ status: "connected" })
        .where(eq(stripeConnections.id, existingConnection.id));
    }

    return {
      status: "already_connected" as const,
      connection: {
        ...existingConnection,
        status: "connected" as const,
      },
    };
  }

  const [existingAuth] = await db
    .select()
    .from(stripeAppAuthorizations)
    .where(
      eq(stripeAppAuthorizations.stripeAccountId, input.stripeAccountId)
    )
    .limit(1);

  if (!existingAuth) {
    await db.insert(stripeAppAuthorizations).values({
      id: generateId(ID_PREFIXES.stripeAppAuthorization),
      stripeAccountId: input.stripeAccountId,
      livemode: input.livemode,
    });
  }
  else if (existingAuth.claimedAt) {
    // Re-install after disconnect: allow a fresh claim.
    await db
      .update(stripeAppAuthorizations)
      .set({
        livemode: input.livemode,
        claimedAppId: null,
        claimedAt: null,
      })
      .where(eq(stripeAppAuthorizations.id, existingAuth.id));
  }
  else {
    await db
      .update(stripeAppAuthorizations)
      .set({ livemode: input.livemode })
      .where(eq(stripeAppAuthorizations.id, existingAuth.id));
  }

  // The webhook cannot cryptographically prove which RefKit app started this
  // install, so it never binds an account on its own. Binding happens only
  // through an authenticated path: the signed install callback, the post-install
  // session button, or the owner-scoped claim poll. This avoids attaching a
  // Stripe account to the wrong app when installs overlap.
  const pendings = await listUnexpiredPendingInstalls();

  console.info(
    `[refkit:stripe] Recorded authorization for ${input.stripeAccountId}; ` +
      `${pendings.length} pending install(s) waiting for claim.`
  );

  return {
    status: "pending_claim" as const,
    connection: null,
  };
}

export async function claimPendingStripeInstall(input: {
  userId: string;
  appId: string;
}) {
  await requireAppAccess(input.userId, input.appId);
  await assertAppRevenueSource(input.appId, "stripe");

  const pending = await getUnexpiredPendingInstall(input.appId, input.userId);

  if (!pending) {
    const db = getDb();
    const [claimedAuth] = await db
      .select()
      .from(stripeAppAuthorizations)
      .where(eq(stripeAppAuthorizations.claimedAppId, input.appId))
      .orderBy(desc(stripeAppAuthorizations.claimedAt))
      .limit(1);

    if (claimedAuth) {
      const bound = await getStripeConnectionByAccountId(
        claimedAuth.stripeAccountId
      );

      if (bound && bound.status === "connected") {
        return {
          status: "connected" as const,
          connection: bound,
        };
      }
    }

    const existing = await getStripeConnectionForApp(input.appId);

    if (existing && existing.status === "connected") {
      return {
        status: "connected" as const,
        connection: existing,
      };
    }

    return {
      status: "waiting" as const,
      connection: null,
      message:
        "Start Connect Stripe from RefKit again, then finish installing in Stripe.",
    };
  }

  const claimable = await findClaimableAuthorization(pending.createdAt);

  if (claimable.length === 0) {
    return {
      status: "waiting" as const,
      connection: null,
      message:
        "Waiting for Stripe to confirm the install. Finish in the Stripe tab, then wait a few seconds.",
    };
  }

  if (claimable.length > 1) {
    return {
      status: "ambiguous" as const,
      connection: null,
      message:
        "Multiple Stripe installs are in progress. Use the Return to RefKit button on Stripe, or try again in a few minutes.",
    };
  }

  // Only bind the single claimable authorization when this owner is the sole
  // install in flight. If other pending installs exist we cannot prove the
  // authorization belongs to this caller, so fail closed instead of guessing.
  const otherPendings = (await listUnexpiredPendingInstalls()).filter(
    (row) => row.appId !== pending.appId || row.userId !== pending.userId
  );

  if (otherPendings.length > 0) {
    return {
      status: "ambiguous" as const,
      connection: null,
      message:
        "Multiple Stripe installs are in progress. Use the Return to RefKit button on Stripe, or try again in a few minutes.",
    };
  }

  const authorization = claimable[0]!;
  const expectedLivemode = expectedLivemodeForPending(pending);

  if (
    expectedLivemode !== undefined
    && expectedLivemode !== authorization.livemode
  ) {
    await clearPendingStripeInstall(input.appId, input.userId);
    await markAuthorizationClaimed(authorization.id, input.appId);

    return {
      status: "mode_mismatch" as const,
      connection: null,
      message: stripeInstallModeMismatch(expectedLivemode).message,
    };
  }

  const connection = await upsertStripeAppConnection({
    appId: input.appId,
    stripeAccountId: authorization.stripeAccountId,
    livemode: authorization.livemode,
  });

  await clearPendingStripeInstall(input.appId, input.userId);
  await markAuthorizationClaimed(authorization.id, input.appId);

  return {
    status: "connected" as const,
    connection,
  };
}

export async function completeStripeAppInstallFromAccountId(input: {
  userId: string;
  stripeAccountId: string;
  livemode: boolean;
}) {
  const pendingList = await listUnexpiredPendingInstalls();
  const pendingForUser = pendingList.filter(
    (pending) => pending.userId === input.userId
  );

  if (pendingForUser.length === 0) {
    throw new AppError(
      "invalid_request",
      "stripe_install_not_started",
      "Start Connect Stripe from RefKit before finishing the Stripe install.",
      400
    );
  }

  if (pendingForUser.length > 1) {
    throw new AppError(
      "invalid_request",
      "stripe_install_ambiguous",
      "Multiple RefKit apps are waiting to connect. Finish one install at a time.",
      409
    );
  }

  const pending = pendingForUser[0]!;
  await requireAppAccess(input.userId, pending.appId);

  const db = getDb();
  const [authorization] = await db
    .select()
    .from(stripeAppAuthorizations)
    .where(
      eq(stripeAppAuthorizations.stripeAccountId, input.stripeAccountId)
    )
    .limit(1);

  const livemode = authorization?.livemode ?? input.livemode;
  const expectedLivemode = expectedLivemodeForPending(pending);

  if (
    expectedLivemode !== undefined
    && expectedLivemode !== livemode
  ) {
    await clearPendingStripeInstall(pending.appId, pending.userId);
    await claimAuthorizationForAccount(input.stripeAccountId, pending.appId);
    throw stripeInstallModeMismatch(expectedLivemode);
  }

  const connection = await upsertStripeAppConnection({
    appId: pending.appId,
    stripeAccountId: input.stripeAccountId,
    livemode,
  });

  await clearPendingStripeInstall(pending.appId, pending.userId);
  await claimAuthorizationForAccount(input.stripeAccountId, pending.appId);

  return connection;
}

export async function markStripeConnectionDisconnected(
  connection: StripeConnection
) {
  const db = getDb();

  await db
    .update(stripeConnections)
    .set({ status: "disconnected" })
    .where(eq(stripeConnections.id, connection.id));
}

export async function disconnectStripeConnectionForApp(
  userId: string,
  appId: string,
  options: { livemode?: boolean } = {}
) {
  await requireAppAccess(userId, appId);

  const livemode = options.livemode ?? true;
  const db = getDb();

  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(
      and(
        eq(stripeConnections.appId, appId),
        eq(stripeConnections.livemode, livemode),
        eq(stripeConnections.status, "connected")
      )
    )
    .limit(1);

  if (!connection) {
    throw new AppError(
      "not_found",
      "stripe_connection_not_found",
      livemode
        ? "No live Stripe connection to disconnect."
        : "No test Stripe connection to disconnect.",
      404
    );
  }

  await markStripeConnectionDisconnected(connection);

  const [updated] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.id, connection.id))
    .limit(1);

  return updated!;
}

export async function getAppForConnection(connection: StripeConnection) {
  const db = getDb();

  const [app] = await db
    .select()
    .from(apps)
    .where(eq(apps.id, connection.appId))
    .limit(1);

  return app ?? null;
}
