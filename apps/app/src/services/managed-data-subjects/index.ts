import { and, eq, inArray, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  clicks,
  commissionEntries,
  customers,
  managedDataSubjectRedactions,
  referrals,
  transactions,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { createManagedDataSubjectRedactionReceipt } from "@/lib/crypto";
import { generateId, ID_PREFIXES } from "@/lib/ids";
import { requireAppAccess } from "@/services/scoping";

async function requireManagedCustomer(
  managedAccountId: string,
  appId: string,
  externalCustomerId: string
) {
  await requireAppAccess(managedAccountId, appId);
  const db = getDb();
  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.appId, appId),
        eq(customers.externalCustomerId, externalCustomerId)
      )
    )
    .limit(1);

  if (!customer || customer.redactedAt) {
    throw new AppError(
      "not_found",
      "customer_not_found",
      "Customer not found.",
      404
    );
  }

  return customer;
}

export async function exportManagedCustomerData(
  managedAccountId: string,
  appId: string,
  externalCustomerId: string
) {
  const customer = await requireManagedCustomer(
    managedAccountId,
    appId,
    externalCustomerId
  );
  const db = getDb();
  const referralRows = await db
    .select()
    .from(referrals)
    .where(eq(referrals.customerId, customer.id));
  const transactionRows = await db
    .select()
    .from(transactions)
    .where(eq(transactions.customerId, customer.id));
  const clickIds = [
    ...new Set(
      referralRows.flatMap((referral) =>
        referral.clickId ? [referral.clickId] : []
      )
    ),
  ];
  const clickRows = clickIds.length === 0
    ? []
    : await db
        .select()
        .from(clicks)
        .where(inArray(clicks.id, clickIds));
  const transactionIds = transactionRows.map((transaction) => transaction.id);
  const commissionRows = transactionIds.length === 0
    ? await db
        .select()
        .from(commissionEntries)
        .where(eq(commissionEntries.customerId, customer.id))
    : await db
        .select()
        .from(commissionEntries)
        .where(
          or(
            eq(commissionEntries.customerId, customer.id),
            inArray(commissionEntries.transactionId, transactionIds)
          )
        );

  return {
    exported_at: new Date().toISOString(),
    customer: {
      id: customer.id,
      app_id: customer.appId,
      external_customer_id: customer.externalCustomerId,
      email: customer.email,
      created_at: customer.createdAt.toISOString(),
    },
    referrals: referralRows.map((referral) => ({
      id: referral.id,
      program_id: referral.programId,
      program_affiliate_id: referral.programAffiliateId,
      click_id: referral.clickId,
      created_at: referral.createdAt.toISOString(),
    })),
    clicks: clickRows.map((click) => ({
      id: click.id,
      affiliate_link_id: click.affiliateLinkId,
      program_id: click.programId,
      program_affiliate_id: click.programAffiliateId,
      link_label: click.linkLabel,
      link_code: click.linkCode,
      utm_source: click.utmSource,
      utm_medium: click.utmMedium,
      utm_campaign: click.utmCampaign,
      page_url: click.pageUrl,
      referrer: click.referrer,
      ip_hash: click.ipHash,
      user_agent: click.userAgent,
      created_at: click.createdAt.toISOString(),
    })),
    transactions: transactionRows.map((transaction) => ({
      id: transaction.id,
      source: transaction.source,
      external_id: transaction.externalId,
      action: transaction.action,
      amount: transaction.amount,
      currency: transaction.currency,
      livemode: transaction.livemode,
      occurred_at: transaction.transactionDate.toISOString(),
    })),
    commission_entries: commissionRows.map((entry) => ({
      id: entry.id,
      transaction_id: entry.transactionId,
      kind: entry.kind,
      amount: entry.amount,
      currency: entry.currency,
      status: entry.status,
      created_at: entry.createdAt.toISOString(),
    })),
  };
}

export async function redactManagedCustomerData(
  managedAccountId: string,
  appId: string,
  externalCustomerId: string
) {
  await requireAppAccess(managedAccountId, appId);
  const db = getDb();
  const subjectFingerprint = createManagedDataSubjectRedactionReceipt(
    appId,
    externalCustomerId
  );

  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select()
      .from(customers)
      .where(
        and(
          eq(customers.appId, appId),
          eq(customers.externalCustomerId, externalCustomerId)
        )
      )
      .for("update")
      .limit(1);

    if (!customer) {
      const [receipt] = await tx
        .select()
        .from(managedDataSubjectRedactions)
        .where(
          and(
            eq(managedDataSubjectRedactions.appId, appId),
            eq(
              managedDataSubjectRedactions.subjectFingerprint,
              subjectFingerprint
            )
          )
        )
        .limit(1);

      if (receipt) {
        return {
          customer_id: receipt.customerId,
          redacted: true,
          redacted_at: receipt.redactedAt.toISOString(),
        };
      }

      throw new AppError(
        "not_found",
        "customer_not_found",
        "Customer not found.",
        404
      );
    }

    const now = new Date();
    const referralRows = await tx
      .select({ clickId: referrals.clickId })
      .from(referrals)
      .where(eq(referrals.customerId, customer.id));
    const clickIds = [
      ...new Set(
        referralRows.flatMap((referral) =>
          referral.clickId ? [referral.clickId] : []
        )
      ),
    ];

    if (referralRows.length > 0) {
      const deidentifiedCustomerId = generateId(ID_PREFIXES.customer);

      await tx.insert(customers).values({
        id: deidentifiedCustomerId,
        appId,
        externalCustomerId: `redacted_${deidentifiedCustomerId}`,
        redactedAt: now,
      });
      await tx
        .update(referrals)
        .set({
          customerId: deidentifiedCustomerId,
          clickId: null,
          updatedAt: now,
        })
        .where(eq(referrals.customerId, customer.id));
    }

    await tx
      .update(commissionEntries)
      .set({ customerId: null, updatedAt: now })
      .where(eq(commissionEntries.customerId, customer.id));

    await tx
      .update(transactions)
      .set({ customerId: null, updatedAt: now })
      .where(eq(transactions.customerId, customer.id));

    if (clickIds.length > 0) {
      await tx
        .update(clicks)
        .set({
          pageUrl: null,
          referrer: null,
          ipHash: "redacted",
          userAgent: null,
          updatedAt: now,
        })
        .where(inArray(clicks.id, clickIds));
    }

    await tx
      .insert(managedDataSubjectRedactions)
      .values({
        customerId: customer.id,
        appId,
        subjectFingerprint,
        redactedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          managedDataSubjectRedactions.appId,
          managedDataSubjectRedactions.subjectFingerprint,
        ],
        set: {
          customerId: customer.id,
          redactedAt: now,
        },
      });

    await tx.delete(customers).where(eq(customers.id, customer.id));

    return {
      customer_id: customer.id,
      redacted: true,
      redacted_at: now.toISOString(),
    };
  });
}
