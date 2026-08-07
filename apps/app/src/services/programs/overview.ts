import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  affiliateLinks,
  programAffiliates,
  clicks,
  programs,
  referrals,
  transactions,
  users,
} from "@/db/schema";
import type { AppEnvironment } from "@/lib/app-environment";
import { DEFAULT_LINK_LABEL } from "@/lib/link-code";
import { getProgramIdsForApp, requireProgramAccess } from "@/services/scoping";

const emptyOverview = {
  clicks: 0,
  referrals: 0,
  paying_customers: 0,
  gross_referred_revenue: { amount: 0, currency: "usd" },
  click_to_referral_rate: 0,
  referral_to_paid_rate: 0,
  top_affiliates: [],
};

function referredTransactionFilter(
  programIds: string[],
  environment: AppEnvironment,
) {
  return and(
    inArray(transactions.programId, programIds),
    eq(transactions.livemode, environment === "live"),
    gt(transactions.amount, 0),
    sql`${transactions.programAffiliateId} is not null`,
    sql`exists (
      select 1
      from ${programAffiliates}
      where ${programAffiliates.id} = ${transactions.programAffiliateId}
        and ${programAffiliates.isTest} = ${environment === "test"}
    )`
  );
}

export async function getProgramOverview(
  userId: string,
  programId: string,
  options: { environment?: AppEnvironment } = {},
) {
  const program = await requireProgramAccess(userId, programId);
  const environment = options.environment ?? "live";

  const db = getDb();

  const [clickStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(clicks)
    .innerJoin(
      programAffiliates,
      eq(programAffiliates.id, clicks.programAffiliateId)
    )
    .where(
      and(
        eq(clicks.programId, programId),
        eq(programAffiliates.isTest, environment === "test")
      )
    );

  const [referralStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(referrals)
    .innerJoin(
      programAffiliates,
      eq(programAffiliates.id, referrals.programAffiliateId)
    )
    .where(
      and(
        eq(referrals.programId, programId),
        eq(programAffiliates.isTest, environment === "test")
      )
    );

  const [payingStats] = await db
    .select({
      count: sql<number>`count(distinct ${transactions.customerId})::int`,
    })
    .from(transactions)
    .where(referredTransactionFilter([programId], environment));

  const [revenueStats] = await db
    .select({
      amount: sql<number>`coalesce(sum(${transactions.amount}), 0)::int`,
    })
    .from(transactions)
    .where(referredTransactionFilter([programId], environment));

  const clicksCount = Number(clickStats?.count ?? 0);
  const referralsCount = Number(referralStats?.count ?? 0);
  const payingCustomers = Number(payingStats?.count ?? 0);
  const grossReferredRevenue = Number(revenueStats?.amount ?? 0);

  const clickToReferralRate =
    clicksCount > 0 ? referralsCount / clicksCount : 0;
  const referralToPaidRate =
    referralsCount > 0 ? payingCustomers / referralsCount : 0;

  const topAffiliateRows = await db
    .select({
      programAffiliateId: transactions.programAffiliateId,
      defaultLinkCode: affiliateLinks.linkCode,
      userId: programAffiliates.userId,
      revenue: sql<number>`coalesce(sum(${transactions.amount}), 0)::int`,
    })
    .from(transactions)
    .innerJoin(programAffiliates, eq(programAffiliates.id, transactions.programAffiliateId))
    .leftJoin(
      affiliateLinks,
      and(
        eq(affiliateLinks.programAffiliateId, programAffiliates.id),
        eq(affiliateLinks.label, DEFAULT_LINK_LABEL)
      )
    )
    .where(
      and(
        eq(transactions.programId, programId),
        eq(transactions.livemode, environment === "live"),
        eq(programAffiliates.isTest, environment === "test"),
        gt(transactions.amount, 0),
        sql`${transactions.programAffiliateId} is not null`
      )
    )
    .groupBy(
      transactions.programAffiliateId,
      affiliateLinks.linkCode,
      programAffiliates.userId
    )
    .orderBy(sql`sum(${transactions.amount}) desc`)
    .limit(5);

  const userIds = topAffiliateRows.map((row) => row.userId);
  const userMap = new Map<
    string,
    { email: string; name: string | null; image: string | null }
  >();

  if (userIds.length > 0) {
    const userRows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    for (const user of userRows) {
      userMap.set(user.id, {
        email: user.email,
        name: user.name,
        image: user.image,
      });
    }
  }

  const topAffiliates = topAffiliateRows.map((row) => {
    const user = userMap.get(row.userId);

    return {
      program_affiliate_id: row.programAffiliateId,
      default_link_code: row.defaultLinkCode,
      email: environment === "test" ? null : (user?.email ?? null),
      name: environment === "test" ? "Test affiliate" : (user?.name ?? null),
      image: environment === "test" ? null : (user?.image ?? null),
      gross_revenue: {
        amount: Number(row.revenue),
        currency: program.currency,
      },
    };
  });

  return {
    clicks: clicksCount,
    referrals: referralsCount,
    paying_customers: payingCustomers,
    gross_referred_revenue: {
      amount: grossReferredRevenue,
      currency: program.currency,
    },
    click_to_referral_rate: clickToReferralRate,
    referral_to_paid_rate: referralToPaidRate,
    top_affiliates: topAffiliates,
  };
}

export async function getAppOverview(
  userId: string,
  appId: string,
  options: { environment?: AppEnvironment } = {},
) {
  const environment = options.environment ?? "live";
  const programIds = await getProgramIdsForApp(userId, appId);

  if (programIds.length === 0) {
    return emptyOverview;
  }

  const db = getDb();
  const transactionFilter = referredTransactionFilter(programIds, environment);

  const [clickStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(clicks)
    .innerJoin(
      programAffiliates,
      eq(programAffiliates.id, clicks.programAffiliateId)
    )
    .where(
      and(
        inArray(clicks.programId, programIds),
        eq(programAffiliates.isTest, environment === "test")
      )
    );

  const [referralStats] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(referrals)
    .innerJoin(
      programAffiliates,
      eq(programAffiliates.id, referrals.programAffiliateId)
    )
    .where(
      and(
        inArray(referrals.programId, programIds),
        eq(programAffiliates.isTest, environment === "test")
      )
    );

  const [payingStats] = await db
    .select({
      count: sql<number>`count(distinct ${transactions.customerId})::int`,
    })
    .from(transactions)
    .where(transactionFilter);

  const revenueByCurrency = await db
    .select({
      currency: transactions.currency,
      amount: sql<number>`coalesce(sum(${transactions.amount}), 0)::int`,
    })
    .from(transactions)
    .where(transactionFilter)
    .groupBy(transactions.currency)
    .orderBy(sql`sum(${transactions.amount}) desc`);

  const clicksCount = Number(clickStats?.count ?? 0);
  const referralsCount = Number(referralStats?.count ?? 0);
  const payingCustomers = Number(payingStats?.count ?? 0);
  const primaryRevenue = revenueByCurrency[0];
  const grossReferredRevenue = Number(primaryRevenue?.amount ?? 0);
  const currency = primaryRevenue?.currency ?? "usd";

  const clickToReferralRate =
    clicksCount > 0 ? referralsCount / clicksCount : 0;
  const referralToPaidRate =
    referralsCount > 0 ? payingCustomers / referralsCount : 0;

  const topAffiliateRows = await db
    .select({
      programAffiliateId: transactions.programAffiliateId,
      defaultLinkCode: affiliateLinks.linkCode,
      userId: programAffiliates.userId,
      programCurrency: programs.currency,
      revenue: sql<number>`coalesce(sum(${transactions.amount}), 0)::int`,
    })
    .from(transactions)
    .innerJoin(programAffiliates, eq(programAffiliates.id, transactions.programAffiliateId))
    .innerJoin(programs, eq(programs.id, transactions.programId))
    .leftJoin(
      affiliateLinks,
      and(
        eq(affiliateLinks.programAffiliateId, programAffiliates.id),
        eq(affiliateLinks.label, DEFAULT_LINK_LABEL)
      )
    )
    .where(transactionFilter)
    .groupBy(
      transactions.programAffiliateId,
      affiliateLinks.linkCode,
      programAffiliates.userId,
      programs.currency
    )
    .orderBy(sql`sum(${transactions.amount}) desc`)
    .limit(5);

  const userIds = topAffiliateRows.map((row) => row.userId);
  const userMap = new Map<
    string,
    { email: string; name: string | null; image: string | null }
  >();

  if (userIds.length > 0) {
    const userRows = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
      })
      .from(users)
      .where(inArray(users.id, userIds));

    for (const user of userRows) {
      userMap.set(user.id, {
        email: user.email,
        name: user.name,
        image: user.image,
      });
    }
  }

  const topAffiliates = topAffiliateRows.map((row) => {
    const user = userMap.get(row.userId);

    return {
      program_affiliate_id: row.programAffiliateId,
      default_link_code: row.defaultLinkCode,
      email: environment === "test" ? null : (user?.email ?? null),
      name: environment === "test" ? "Test affiliate" : (user?.name ?? null),
      image: environment === "test" ? null : (user?.image ?? null),
      gross_revenue: {
        amount: Number(row.revenue),
        currency: row.programCurrency,
      },
    };
  });

  return {
    clicks: clicksCount,
    referrals: referralsCount,
    paying_customers: payingCustomers,
    gross_referred_revenue: {
      amount: grossReferredRevenue,
      currency,
    },
    click_to_referral_rate: clickToReferralRate,
    referral_to_paid_rate: referralToPaidRate,
    top_affiliates: topAffiliates,
  };
}
