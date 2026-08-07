import { and, eq, gt } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import { apps, stripeConnections, transactions } from "@/db/schema";
import { AppKeyAuthContext } from "@/lib/auth-context";
import { AppError } from "@/lib/errors";
import { isRevenueSource, type RevenueSource } from "@/lib/revenue-source";

export function deriveLivemodeFromAppKey(auth: AppKeyAuthContext) {
  return !auth.testMode;
}

export async function getAppRevenueSource(appId: string) {
  const db = getDb();

  const [app] = await db
    .select({ revenueSource: apps.revenueSource })
    .from(apps)
    .where(eq(apps.id, appId))
    .limit(1);

  if (!app) {
    throw new AppError("not_found", "app_not_found", "App not found.", 404);
  }

  if (!isRevenueSource(app.revenueSource)) {
    throw new AppError(
      "internal",
      "invalid_revenue_source",
      "App has an invalid revenue source.",
      500
    );
  }

  return app.revenueSource;
}

export async function assertAppRevenueSource(
  appId: string,
  expected: RevenueSource
) {
  const revenueSource = await getAppRevenueSource(appId);

  if (revenueSource !== expected) {
    throw new AppError(
      "conflict",
      "revenue_source_conflict",
      expected === "api"
        ? "This app uses Stripe for revenue. API payment reporting is not enabled."
        : "This app uses API payment reporting. Stripe revenue ingestion is not enabled.",
      409
    );
  }
}

export async function lockAppRevenueSource(
  appId: string,
  expected: RevenueSource,
  executor: DbExecutor
) {
  const [app] = await executor
    .select({ revenueSource: apps.revenueSource })
    .from(apps)
    .where(eq(apps.id, appId))
    .for("update")
    .limit(1);

  if (!app) {
    throw new AppError("not_found", "app_not_found", "App not found.", 404);
  }

  if (app.revenueSource !== expected) {
    throw new AppError(
      "conflict",
      "revenue_source_conflict",
      expected === "api"
        ? "This app uses Stripe for revenue. API payment reporting is not enabled."
        : "This app uses API payment reporting. Stripe revenue ingestion is not enabled.",
      409
    );
  }
}

export async function appHasRevenueTransactions(
  appId: string,
  executor: DbExecutor = getDb()
) {
  const db = executor;

  const [row] = await db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.appId, appId),
        eq(transactions.livemode, true),
        gt(transactions.amount, 0)
      )
    )
    .limit(1);

  return Boolean(row);
}

export async function assertRevenueSourceMutable(
  appId: string,
  executor: DbExecutor = getDb()
) {
  const hasRevenue = await appHasRevenueTransactions(appId, executor);

  if (hasRevenue) {
    throw new AppError(
      "conflict",
      "revenue_source_locked",
      "Revenue source cannot be changed after the first live payment.",
      409
    );
  }
}

export async function assertCanSetRevenueSource(
  appId: string,
  revenueSource: RevenueSource,
  executor: DbExecutor = getDb()
) {
  await assertRevenueSourceMutable(appId, executor);

  if (revenueSource === "api") {
    const db = executor;

    const [connection] = await db
      .select({ id: stripeConnections.id })
      .from(stripeConnections)
      .where(
        and(
          eq(stripeConnections.appId, appId),
          eq(stripeConnections.livemode, true),
          eq(stripeConnections.status, "connected")
        )
      )
      .limit(1);

    if (connection) {
      throw new AppError(
        "conflict",
        "stripe_connection_exists",
        "Disconnect live Stripe before switching to API payment reporting.",
        409
      );
    }
  }
}
