import { and, eq } from "drizzle-orm";
import { getDb, type DbExecutor } from "@/db/client";
import {
  affiliatePromotionCodes,
  programAffiliates,
  clicks,
  customers,
  programs,
  referrals,
  users,
} from "@/db/schema";
import { generateId, ID_PREFIXES } from "@/lib/ids";

export type ResolvedAttribution = {
  programId: string;
  affiliateId: string;
  customerId: string;
  referralId: string;
  clickId: string | null;
};

function readMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string
) {
  if (!metadata) {
    return null;
  }

  const value = metadata[key];

  if (typeof value !== "string" || value.length === 0) {
    return null;
  }

  return value;
}

export async function resolveAttributionFromMetadata(input: {
  appId: string;
  metadata: Record<string, unknown> | null | undefined;
  promotionCodeId?: string | null;
  programIdHint?: string | null;
}) {
  const db = getDb();

  const customerId = readMetadataString(input.metadata, "refkit_customer_id");
  const clickId = readMetadataString(input.metadata, "refkit_click_id");
  const programId =
    readMetadataString(input.metadata, "refkit_program_id") ??
    input.programIdHint ??
    null;

  if (customerId && programId) {
    const [customer] = await db
      .select()
      .from(customers)
      .where(
        and(eq(customers.id, customerId), eq(customers.appId, input.appId))
      )
      .limit(1);

    if (customer) {
      const [referral] = await db
        .select()
        .from(referrals)
        .where(
          and(
            eq(referrals.customerId, customer.id),
            eq(referrals.programId, programId)
          )
        )
        .limit(1);

      if (referral) {
        return {
          programId,
          affiliateId: referral.programAffiliateId,
          customerId: customer.id,
          referralId: referral.id,
          clickId: referral.clickId,
        } satisfies ResolvedAttribution;
      }
    }
  }

  if (clickId) {
    const [click] = await db
      .select()
      .from(clicks)
      .where(eq(clicks.id, clickId))
      .limit(1);

    if (click) {
      const [program] = await db
        .select()
        .from(programs)
        .where(eq(programs.id, click.programId))
        .limit(1);

      if (program?.appId === input.appId) {
        const customerIdFromClick = readMetadataString(
          input.metadata,
          "refkit_customer_id"
        );

        if (customerIdFromClick) {
          const [referral] = await db
            .select()
            .from(referrals)
            .where(
              and(
                eq(referrals.customerId, customerIdFromClick),
                eq(referrals.programId, click.programId)
              )
            )
            .limit(1);

          if (referral) {
            return {
              programId: click.programId,
              affiliateId: click.programAffiliateId,
              customerId: customerIdFromClick,
              referralId: referral.id,
              clickId: click.id,
            } satisfies ResolvedAttribution;
          }
        }
        else {
          // Only a click id is available (e.g. subscription metadata on a
          // renewal). The identify call linked this click to a referral.
          const [referral] = await db
            .select()
            .from(referrals)
            .where(
              and(
                eq(referrals.clickId, click.id),
                eq(referrals.programId, click.programId)
              )
            )
            .limit(1);

          if (referral) {
            return {
              programId: click.programId,
              affiliateId: referral.programAffiliateId,
              customerId: referral.customerId,
              referralId: referral.id,
              clickId: click.id,
            } satisfies ResolvedAttribution;
          }
        }
      }
    }
  }

  if (input.promotionCodeId && customerId) {
    const promotionCodeConditions = [
      eq(
        affiliatePromotionCodes.stripePromotionCodeId,
        input.promotionCodeId
      ),
      eq(programs.appId, input.appId),
      eq(programs.promotionCodeFallback, true),
      eq(programAffiliates.programId, affiliatePromotionCodes.programId),
    ];

    if (programId) {
      promotionCodeConditions.push(
        eq(affiliatePromotionCodes.programId, programId)
      );
    }

    const [promotionCode] = await db
      .select({
        programId: affiliatePromotionCodes.programId,
        programAffiliateId: affiliatePromotionCodes.programAffiliateId,
      })
      .from(affiliatePromotionCodes)
      .innerJoin(
        programs,
        eq(programs.id, affiliatePromotionCodes.programId)
      )
      .innerJoin(
        programAffiliates,
        eq(
          programAffiliates.id,
          affiliatePromotionCodes.programAffiliateId
        )
      )
      .where(and(...promotionCodeConditions))
      .limit(1);

    if (promotionCode) {
      const [customer] = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.id, customerId),
            eq(customers.appId, input.appId)
          )
        )
        .limit(1);

      if (customer) {
        const referral = await db.transaction(async (tx) => {
          await tx
            .insert(referrals)
            .values({
              id: generateId(ID_PREFIXES.referral),
              customerId: customer.id,
              programId: promotionCode.programId,
              programAffiliateId: promotionCode.programAffiliateId,
              clickId: null,
            })
            .onConflictDoNothing();

          const [storedReferral] = await tx
            .select()
            .from(referrals)
            .where(
              and(
                eq(referrals.customerId, customer.id),
                eq(referrals.programId, promotionCode.programId)
              )
            )
            .limit(1);

          return storedReferral ?? null;
        });

        if (referral) {
          return {
            programId: promotionCode.programId,
            affiliateId: referral.programAffiliateId,
            customerId: customer.id,
            referralId: referral.id,
            clickId: referral.clickId,
          } satisfies ResolvedAttribution;
        }
      }
    }
  }

  return null;
}

export async function isSelfReferral(
  affiliateId: string,
  customerId: string,
  executor: DbExecutor = getDb()
) {
  const db = executor;

  const [affiliate] = await db
    .select()
    .from(programAffiliates)
    .where(eq(programAffiliates.id, affiliateId))
    .limit(1);

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);

  if (!affiliate || !customer?.email) {
    return false;
  }

  const [affiliateUser] = await db
    .select()
    .from(users)
    .where(eq(users.id, affiliate.userId))
    .limit(1);

  if (!affiliateUser?.email) {
    return false;
  }

  return (
    affiliateUser.email.trim().toLowerCase() ===
    customer.email.trim().toLowerCase()
  );
}
