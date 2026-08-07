import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { customers, programs, referrals } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { ResolvedAttribution } from "@/services/stripe/attribution";

export async function resolveAttributionFromCustomer(input: {
  appId: string;
  customerId: string;
  programId: string;
}) {
  const db = getDb();

  const [customer] = await db
    .select()
    .from(customers)
    .where(
      and(
        eq(customers.id, input.customerId),
        eq(customers.appId, input.appId)
      )
    )
    .limit(1);

  if (!customer) {
    throw new AppError(
      "not_found",
      "customer_not_found",
      "Customer not found.",
      404
    );
  }

  const [program] = await db
    .select()
    .from(programs)
    .where(eq(programs.id, input.programId))
    .limit(1);

  if (!program || program.appId !== input.appId) {
    throw new AppError(
      "not_found",
      "program_not_found",
      "Program not found.",
      404
    );
  }

  const [referral] = await db
    .select()
    .from(referrals)
    .where(
      and(
        eq(referrals.customerId, customer.id),
        eq(referrals.programId, input.programId)
      )
    )
    .limit(1);

  if (!referral) {
    return null;
  }

  return {
    programId: input.programId,
    affiliateId: referral.programAffiliateId,
    customerId: customer.id,
    referralId: referral.id,
    clickId: referral.clickId,
  } satisfies ResolvedAttribution;
}
